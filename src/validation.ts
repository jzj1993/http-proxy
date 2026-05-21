import { isIP } from "node:net";

export type ProxyMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type ProxyRequestBody = {
  url: string;
  method: ProxyMethod;
  headers?: Record<string, string>;
  body?: string | null;
  bodyEncoding?: "utf8" | "base64";
};

const allowedMethods = new Set<ProxyMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const blockedHeaders = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error("Headers must be a string record");
  }

  const result: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") {
      throw new Error("Headers must be a string record");
    }
    result[key] = headerValue;
  }
  return result;
}

export function validateProxyRequestBody(value: unknown): ProxyRequestBody {
  if (!isRecord(value)) {
    throw new Error("Request body must be an object");
  }

  if (typeof value.url !== "string" || value.url.length === 0) {
    throw new Error("URL must be a non-empty string");
  }

  if (typeof value.method !== "string") {
    throw new Error("Method must be a string");
  }

  const method = value.method.toUpperCase();
  if (!allowedMethods.has(method as ProxyMethod)) {
    throw new Error("Unsupported method");
  }

  let headers: Record<string, string> | undefined;
  if (value.headers !== undefined) {
    headers = assertStringRecord(value.headers);
  }

  if (value.body !== undefined && value.body !== null && typeof value.body !== "string") {
    throw new Error("Body must be a string or null");
  }

  if (
    value.bodyEncoding !== undefined &&
    value.bodyEncoding !== "utf8" &&
    value.bodyEncoding !== "base64"
  ) {
    throw new Error("Unsupported body encoding");
  }

  return {
    url: value.url,
    method: method as ProxyMethod,
    ...(headers ? { headers } : {}),
    ...(value.body !== undefined ? { body: value.body } : {}),
    ...(value.bodyEncoding !== undefined ? { bodyEncoding: value.bodyEncoding } : {}),
  };
}

function isUnsafeIPv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isUnsafeIPv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isUnsafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");

  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    return isUnsafeIPv4(host);
  }
  if (ipVersion === 6) {
    return isUnsafeIPv6(host);
  }

  return false;
}

export function assertSafeTargetUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid target URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  if (isUnsafeHost(url.hostname)) {
    throw new Error("Unsafe target host");
  }

  return url;
}

export function filterForwardHeaders(headers?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const normalizedKey = key.toLowerCase();
    if (!blockedHeaders.has(normalizedKey)) {
      result[normalizedKey] = value;
    }
  }
  return result;
}
