import { describe, expect, it } from "vitest";
import { createSignature, verifyHmacRequest } from "../src/auth.js";

const secret = "test-secret";
const rawBody = JSON.stringify({ url: "https://example.com", method: "GET" });
const now = 1_700_000_000_000;
const timestamp = String(now);

describe("createSignature", () => {
  it("creates a stable HMAC-SHA256 hex signature", () => {
    expect(createSignature(secret, timestamp, rawBody)).toMatch(/^[a-f0-9]{64}$/);
    expect(createSignature(secret, timestamp, rawBody)).toBe(
      createSignature(secret, timestamp, rawBody),
    );
  });
});

describe("verifyHmacRequest", () => {
  it("accepts a valid signature inside the timestamp window", () => {
    const signature = createSignature(secret, timestamp, rawBody);

    expect(
      verifyHmacRequest({
        secret,
        headers: { timestamp, signature },
        rawBody,
        now,
        toleranceMs: 300_000,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects an invalid signature", () => {
    const result = verifyHmacRequest({
      secret,
      headers: { timestamp, signature: "a".repeat(64) },
      rawBody,
      now,
      toleranceMs: 300_000,
    });

    expect(result).toEqual({
      ok: false,
      statusCode: 401,
      message: "Invalid signature",
    });
  });

  it("rejects missing auth headers", () => {
    expect(
      verifyHmacRequest({
        secret,
        headers: {},
        rawBody,
        now,
        toleranceMs: 300_000,
      }),
    ).toEqual({
      ok: false,
      statusCode: 401,
      message: "Missing authentication headers",
    });
  });

  it("rejects stale timestamps", () => {
    const staleTimestamp = String(now - 300_001);
    const signature = createSignature(secret, staleTimestamp, rawBody);

    expect(
      verifyHmacRequest({
        secret,
        headers: { timestamp: staleTimestamp, signature },
        rawBody,
        now,
        toleranceMs: 300_000,
      }),
    ).toEqual({
      ok: false,
      statusCode: 401,
      message: "Timestamp outside allowed window",
    });
  });

  it("rejects future timestamps outside the window", () => {
    const futureTimestamp = String(now + 300_001);
    const signature = createSignature(secret, futureTimestamp, rawBody);

    expect(
      verifyHmacRequest({
        secret,
        headers: { timestamp: futureTimestamp, signature },
        rawBody,
        now,
        toleranceMs: 300_000,
      }),
    ).toEqual({
      ok: false,
      statusCode: 401,
      message: "Timestamp outside allowed window",
    });
  });

  it("rejects malformed timestamps", () => {
    expect(
      verifyHmacRequest({
        secret,
        headers: { timestamp: "not-a-number", signature: "a".repeat(64) },
        rawBody,
        now,
        toleranceMs: 300_000,
      }),
    ).toEqual({
      ok: false,
      statusCode: 401,
      message: "Invalid timestamp",
    });
  });
});
