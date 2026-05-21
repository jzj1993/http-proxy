import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { performProxyRequest } from "../src/proxy.js";

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

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

describe("performProxyRequest", () => {
  it("forwards method, headers, and utf8 body", async () => {
    const baseUrl = await createUpstream(async (req, res) => {
      const body = await readRequestBody(req);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          method: req.method,
          header: req.headers["x-test"],
          body: body.toString("utf8"),
        }),
      );
    });

    const result = await performProxyRequest({
      request: {
        url: `${baseUrl}/echo`,
        method: "POST",
        headers: { "x-test": "yes" },
        body: "hello",
      },
      timeoutMs: 1_000,
      maxResponseBytes: 1024,
    });

    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(result.body)).toEqual({ method: "POST", header: "yes", body: "hello" });
    expect(result.bodyEncoding).toBe("utf8");
  });

  it("decodes base64 request bodies before forwarding", async () => {
    const baseUrl = await createUpstream(async (req, res) => {
      const body = await readRequestBody(req);
      res.end(body.toString("hex"));
    });

    const result = await performProxyRequest({
      request: {
        url: baseUrl,
        method: "PUT",
        body: Buffer.from([0, 1, 2, 255]).toString("base64"),
        bodyEncoding: "base64",
      },
      timeoutMs: 1_000,
      maxResponseBytes: 1024,
    });

    expect(result.body).toBe("000102ff");
  });

  it("base64 encodes binary upstream responses", async () => {
    const baseUrl = await createUpstream((_req, res) => {
      res.setHeader("content-type", "application/octet-stream");
      res.end(Buffer.from([0, 1, 2, 255]));
    });

    const result = await performProxyRequest({
      request: { url: baseUrl, method: "GET" },
      timeoutMs: 1_000,
      maxResponseBytes: 1024,
    });

    expect(result.bodyEncoding).toBe("base64");
    expect(result.body).toBe(Buffer.from([0, 1, 2, 255]).toString("base64"));
  });

  it("rejects requests that exceed the timeout", async () => {
    const baseUrl = await createUpstream((_req, res) => {
      setTimeout(() => res.end("late"), 100);
    });

    await expect(
      performProxyRequest({
        request: { url: baseUrl, method: "GET" },
        timeoutMs: 10,
        maxResponseBytes: 1024,
      }),
    ).rejects.toThrow("Upstream request timed out");
  });

  it("rejects responses larger than the configured byte limit", async () => {
    const baseUrl = await createUpstream((_req, res) => {
      res.end("too large");
    });

    await expect(
      performProxyRequest({
        request: { url: baseUrl, method: "GET" },
        timeoutMs: 1_000,
        maxResponseBytes: 3,
      }),
    ).rejects.toThrow("Upstream response exceeded maximum size");
  });
});
