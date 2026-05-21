import { createHmac, timingSafeEqual } from "node:crypto";

export type AuthHeaders = {
  timestamp?: string | string[];
  signature?: string | string[];
};

type AuthResult = { ok: true } | { ok: false; statusCode: 401; message: string };

function singleHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyHmacRequest(input: {
  secret: string;
  headers: AuthHeaders;
  rawBody: string;
  now?: number;
  toleranceMs: number;
}): AuthResult {
  const timestamp = singleHeaderValue(input.headers.timestamp);
  const signature = singleHeaderValue(input.headers.signature);

  if (!timestamp || !signature) {
    return { ok: false, statusCode: 401, message: "Missing authentication headers" };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs)) {
    return { ok: false, statusCode: 401, message: "Invalid timestamp" };
  }

  const now = input.now ?? Date.now();
  if (Math.abs(now - timestampMs) > input.toleranceMs) {
    return { ok: false, statusCode: 401, message: "Timestamp outside allowed window" };
  }

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return { ok: false, statusCode: 401, message: "Invalid signature" };
  }

  const expected = Buffer.from(createSignature(input.secret, timestamp, input.rawBody), "hex");
  const actual = Buffer.from(signature, "hex");

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, statusCode: 401, message: "Invalid signature" };
  }

  return { ok: true };
}
