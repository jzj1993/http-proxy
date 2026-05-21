import type { ProxyRequestBody } from "./validation.js";
import { filterForwardHeaders } from "./validation.js";

export type ProxyResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
};

function buildRequestBody(request: ProxyRequestBody): BodyInit | undefined {
  if (request.body === undefined || request.body === null || request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  if (request.bodyEncoding === "base64") {
    return Buffer.from(request.body, "base64");
  }

  return request.body;
}

function collectHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function isUtf8(buffer: Buffer): boolean {
  return buffer.toString("utf8").includes("\uFFFD") === false;
}

async function readLimitedResponse(response: Response, maxResponseBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxResponseBytes) {
      await reader.cancel();
      throw new Error("Upstream response exceeded maximum size");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function performProxyRequest(input: {
  request: ProxyRequestBody;
  timeoutMs: number;
  maxResponseBytes: number;
}): Promise<ProxyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.request.url, {
      method: input.request.method,
      headers: filterForwardHeaders(input.request.headers),
      body: buildRequestBody(input.request),
      signal: controller.signal,
    });

    const responseBody = await readLimitedResponse(response, input.maxResponseBytes);
    const bodyEncoding = isUtf8(responseBody) ? "utf8" : "base64";

    return {
      status: response.status,
      headers: collectHeaders(response.headers),
      body: bodyEncoding === "utf8" ? responseBody.toString("utf8") : responseBody.toString("base64"),
      bodyEncoding,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Upstream request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
