import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createSignature } from "../src/auth.js";
import { createApp } from "../src/server.js";
import type { AppConfig } from "../src/config.js";

const secret = "server-test-secret";
const now = 1_700_000_000_000;

const config: AppConfig = {
  proxySecret: secret,
  port: 0,
  host: "127.0.0.1",
  requestTimeoutMs: 1_000,
  maxResponseBytes: 1024 * 1024,
  timestampToleranceMs: 300_000,
};

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const servers: http.Server[] = [];

async function createUpstream(handler: Handler): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to bind test server");
  }
  return `http://127.0.0.1:${address.port}`;
}

function signedHeaders(rawBody: string, timestamp = String(now)) {
  return {
    "content-type": "application/json",
    "x-proxy-timestamp": timestamp,
    "x-proxy-signature": createSignature(secret, timestamp, rawBody),
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("createApp", () => {
  it("returns proxied upstream responses for signed requests", async () => {
    const upstreamUrl = await createUpstream((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    const app = createApp({ ...config, now: () => now, allowUnsafeTargetUrlsForTesting: true });
    const rawBody = JSON.stringify({ url: upstreamUrl, method: "GET" });

    const response = await app.inject({
      method: "POST",
      url: "/proxy",
      headers: signedHeaders(rawBody),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 200,
      body: JSON.stringify({ ok: true }),
      bodyEncoding: "utf8",
    });
    await app.close();
  });

  it("rejects invalid signatures", async () => {
    const app = createApp({ ...config, now: () => now });
    const rawBody = JSON.stringify({ url: "https://example.com", method: "GET" });

    const response = await app.inject({
      method: "POST",
      url: "/proxy",
      headers: {
        "content-type": "application/json",
        "x-proxy-timestamp": String(now),
        "x-proxy-signature": "a".repeat(64),
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { message: "Invalid signature" } });
    await app.close();
  });

  it("rejects stale timestamps", async () => {
    const app = createApp({ ...config, now: () => now });
    const timestamp = String(now - 300_001);
    const rawBody = JSON.stringify({ url: "https://example.com", method: "GET" });

    const response = await app.inject({
      method: "POST",
      url: "/proxy",
      headers: signedHeaders(rawBody, timestamp),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { message: "Timestamp outside allowed window" },
    });
    await app.close();
  });

  it("rejects invalid payloads", async () => {
    const app = createApp({ ...config, now: () => now });
    const rawBody = JSON.stringify({ url: "https://example.com", method: "TRACE" });

    const response = await app.inject({
      method: "POST",
      url: "/proxy",
      headers: signedHeaders(rawBody),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: "Unsupported method" } });
    await app.close();
  });

  it("rejects unsafe target URLs", async () => {
    const app = createApp({ ...config, now: () => now });
    const rawBody = JSON.stringify({ url: "http://127.0.0.1:8080", method: "GET" });

    const response = await app.inject({
      method: "POST",
      url: "/proxy",
      headers: signedHeaders(rawBody),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { message: "Unsafe target host" } });
    await app.close();
  });

  it("maps upstream failures to JSON errors", async () => {
    const app = createApp({
      ...config,
      now: () => now,
      allowUnsafeTargetUrlsForTesting: true,
      requestTimeoutMs: 10,
    });
    const upstreamUrl = await createUpstream((_req, res) => {
      setTimeout(() => res.end("late"), 100);
    });
    const rawBody = JSON.stringify({ url: upstreamUrl, method: "GET" });

    const response = await app.inject({
      method: "POST",
      url: "/proxy",
      headers: signedHeaders(rawBody),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: { message: "Upstream request timed out" } });
    await app.close();
  });
});
