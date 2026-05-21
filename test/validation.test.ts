import { describe, expect, it } from "vitest";
import {
  assertSafeTargetUrl,
  filterForwardHeaders,
  validateProxyRequestBody,
} from "../src/validation.js";

describe("validateProxyRequestBody", () => {
  it("accepts a valid minimal request", () => {
    expect(validateProxyRequestBody({ url: "https://example.com", method: "GET" })).toEqual({
      url: "https://example.com",
      method: "GET",
    });
  });

  it("normalizes allowed methods to uppercase", () => {
    expect(validateProxyRequestBody({ url: "https://example.com", method: "post" })).toMatchObject({
      method: "POST",
    });
  });

  it("rejects unsupported methods", () => {
    expect(() =>
      validateProxyRequestBody({ url: "https://example.com", method: "TRACE" }),
    ).toThrow("Unsupported method");
  });

  it("rejects non-object payloads", () => {
    expect(() => validateProxyRequestBody(null)).toThrow("Request body must be an object");
  });

  it("rejects malformed headers", () => {
    expect(() =>
      validateProxyRequestBody({
        url: "https://example.com",
        method: "GET",
        headers: { accept: ["application/json"] },
      }),
    ).toThrow("Headers must be a string record");
  });

  it("rejects invalid body encoding", () => {
    expect(() =>
      validateProxyRequestBody({
        url: "https://example.com",
        method: "POST",
        body: "abc",
        bodyEncoding: "binary",
      }),
    ).toThrow("Unsupported body encoding");
  });
});

describe("assertSafeTargetUrl", () => {
  it("accepts public http and https URLs", () => {
    expect(assertSafeTargetUrl("https://example.com/path").hostname).toBe("example.com");
    expect(assertSafeTargetUrl("http://93.184.216.34/path").hostname).toBe("93.184.216.34");
  });

  it("rejects invalid URLs", () => {
    expect(() => assertSafeTargetUrl("not a url")).toThrow("Invalid target URL");
  });

  it("rejects non-http protocols", () => {
    expect(() => assertSafeTargetUrl("file:///etc/passwd")).toThrow(
      "Only http and https URLs are allowed",
    );
  });

  it("rejects localhost names", () => {
    expect(() => assertSafeTargetUrl("http://localhost:3000")).toThrow(
      "Unsafe target host",
    );
    expect(() => assertSafeTargetUrl("http://api.localhost")).toThrow(
      "Unsafe target host",
    );
  });

  it("rejects unsafe IPv4 ranges", () => {
    for (const host of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.1.1",
      "0.1.2.3",
      "224.0.0.1",
    ]) {
      expect(() => assertSafeTargetUrl(`http://${host}`), host).toThrow("Unsafe target host");
    }
  });

  it("rejects unsafe IPv6 ranges", () => {
    for (const host of ["[::1]", "[fc00::1]", "[fd12:3456::1]", "[fe80::1]"]) {
      expect(() => assertSafeTargetUrl(`http://${host}`), host).toThrow("Unsafe target host");
    }
  });
});

describe("filterForwardHeaders", () => {
  it("strips hop-by-hop and authority headers", () => {
    expect(
      filterForwardHeaders({
        host: "example.com",
        connection: "keep-alive",
        "transfer-encoding": "chunked",
        upgrade: "websocket",
        accept: "application/json",
        "x-custom": "ok",
      }),
    ).toEqual({
      accept: "application/json",
      "x-custom": "ok",
    });
  });
});
