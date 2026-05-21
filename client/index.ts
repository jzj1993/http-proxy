/*
 * 文件说明: 提供调用 HTTP 代理服务的客户端，负责请求序列化、HMAC 签名和响应解析。
 * 参考资料: README.md
 */
import { createHmac } from "node:crypto";

export type ProxyRequest = {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: string | null;
  bodyEncoding?: "base64";
};

export type ProxyResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type HttpProxyClientOptions = {
  proxyUrl: string;
  proxySecret: string;
  now?: () => number;
  fetchHook?: FetchLike;
};

function createSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export class HttpProxyClient {
  private readonly fetcher: FetchLike;
  private readonly now: () => number;
  private readonly proxySecret: string;
  private readonly proxyUrl: string;

  constructor(options: HttpProxyClientOptions) {
    this.fetcher = options.fetchHook ?? fetch;
    this.now = options.now ?? Date.now;
    this.proxySecret = options.proxySecret;
    this.proxyUrl = options.proxyUrl;
  }

  async request(request: ProxyRequest): Promise<ProxyResult> {
    const rawBody = JSON.stringify(request);
    const timestamp = String(this.now());
    const response = await this.fetcher(this.proxyUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-proxy-timestamp": timestamp,
        "x-proxy-signature": createSignature(this.proxySecret, timestamp, rawBody),
      },
      body: rawBody,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Proxy returned HTTP ${response.status}: ${responseText}`);
    }

    return JSON.parse(responseText) as ProxyResult;
  }
}
