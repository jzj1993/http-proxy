/*
 * 文件说明: 验证代理客户端会生成签名请求，并把代理服务响应返回给调用方。
 * 参考资料: README.md
 */
import { describe, expect, it } from "vitest";
import { HttpProxyClient } from "../client/index.js";

describe("HttpProxyClient", () => {
  it("signs proxy requests and returns proxy results", async () => {
    const requests: Request[] = [];
    const client = new HttpProxyClient({
      proxyUrl: "http://127.0.0.1:3000/proxy",
      proxySecret: "client-test-secret",
      now: () => 1_700_000_000_000,
      fetchHook: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          status: 200,
          headers: { "content-type": "application/json" },
          body: "{\"ok\":true}",
          bodyEncoding: "utf8",
        });
      },
    });

    const result = await client.request({
      url: "https://example.com/data",
      method: "GET",
      headers: { accept: "application/json" },
    });

    expect(result).toEqual({
      status: 200,
      headers: { "content-type": "application/json" },
      body: "{\"ok\":true}",
      bodyEncoding: "utf8",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("http://127.0.0.1:3000/proxy");
    expect(requests[0].headers.get("content-type")).toBe("application/json");
    expect(requests[0].headers.get("x-proxy-timestamp")).toBe("1700000000000");
    expect(requests[0].headers.get("x-proxy-signature")).toMatch(/^[a-f0-9]{64}$/);
    await expect(requests[0].json()).resolves.toEqual({
      url: "https://example.com/data",
      method: "GET",
      headers: { accept: "application/json" },
    });
  });
});
