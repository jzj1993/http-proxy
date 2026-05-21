# HTTP Proxy

[English](README.md) | 简体中文

`HTTP Proxy` 是一个带 HMAC 鉴权的 HTTP 代理服务。调用方把签名后的 `POST /proxy` 请求交给本地服务，服务完成出网 HTTP/HTTPS 请求后返回上游响应。

## 能力

| 路径 | 说明 |
| --- | --- |
| `src/` | 代理服务端，提供 `POST /proxy` 接口。 |
| `client/` | TypeScript client，负责请求签名和代理调用封装。 |
| `e2e/` | 本地端到端代理冒烟测试。 |

代理支持 HTTP/HTTPS 目标、常见 HTTP 方法、文本请求体和 base64 二进制请求体；会阻止 localhost、私有 IPv4 地址段、link-local、multicast、IPv6 loopback、IPv6 unique-local 和 IPv6 link-local 等明显不安全目标。

## 使用场景

- 内部服务统一出网，集中处理鉴权、超时和响应大小限制。
- 受限运行环境通过固定签名网关访问外部 HTTP/HTTPS API。
- 为脚本、任务队列或 AI agent 提供带签名保护的请求代发入口。
- 把第三方 API 调用收口到单一服务，便于后续增加日志、限流和审计。

## 快速开始

```bash
npm install
cp .env.example .env
```

编辑 `.env`，把 `PROXY_SECRET` 改成足够长的随机字符串，然后启动服务：

```bash
npm run dev
```

默认监听 `0.0.0.0:3000`。

## 使用 Client

推荐通过 `client/` 里的 `HttpProxyClient` 调用代理服务，调用方不需要自己拼 HMAC header。

```ts
import { HttpProxyClient } from "./client/index.js";

const client = new HttpProxyClient({
  proxyUrl: "http://127.0.0.1:3000/proxy",
  proxySecret: process.env.PROXY_SECRET!,
});

const result = await client.request({
  url: "https://example.com/api",
  method: "GET",
  headers: {
    accept: "application/json",
  },
});

console.log(result.status, result.body);
```

核心类型：

```ts
type ProxyRequest = {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: string | null;
  bodyEncoding?: "utf8" | "base64";
};

type ProxyResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
};
```

## 配置

`.env` 只放代理服务本身的运行配置：

```bash
PROXY_SECRET=replace-with-a-long-random-secret
PORT=3000
HOST=0.0.0.0
REQUEST_TIMEOUT_MS=15000
MAX_RESPONSE_BYTES=5242880
TIMESTAMP_TOLERANCE_MS=300000
```

| 变量 | 说明 |
| --- | --- |
| `PROXY_SECRET` | 必填，HMAC 签名密钥。 |
| `PORT` | 服务监听端口，默认 `3000`。 |
| `HOST` | 服务监听地址，默认 `0.0.0.0`。 |
| `REQUEST_TIMEOUT_MS` | 上游请求超时时间，默认 `15000`。 |
| `MAX_RESPONSE_BYTES` | 最大上游响应体大小，默认 `5242880`。 |
| `TIMESTAMP_TOLERANCE_MS` | 请求时间戳允许偏移，默认 `300000`。 |

## 直接调用接口

如果不使用 `client/`，需要自己调用 `POST /proxy` 并生成签名：

```http
POST /proxy
Content-Type: application/json
X-Proxy-Timestamp: <unix milliseconds>
X-Proxy-Signature: <hmac-sha256 hex>
```

签名内容是 `<timestamp>.<raw JSON request body>`。

```js
import { createHmac } from "node:crypto";

const timestamp = String(Date.now());
const body = JSON.stringify({
  url: "https://example.com/api",
  method: "GET",
});

const signature = createHmac("sha256", process.env.PROXY_SECRET)
  .update(`${timestamp}.${body}`)
  .digest("hex");
```

## 安全边界

服务会拒绝未签名请求、签名错误请求，以及超出时间窗口的请求。代理目标只允许 `http:` 和 `https:` URL。

转发前，服务会移除 hop-by-hop 与 authority 类请求头。服务也会阻止字面量不安全目标，包括 localhost、私有网络地址、link-local、multicast、IPv6 loopback、IPv6 unique-local 和 IPv6 link-local 地址。

当前实现检查的是字面量不安全地址和 localhost 类主机名；如果放到多租户或敌意环境里，需要增加 DNS 解析检查来降低 DNS rebinding 风险。

## 开发命令

```bash
npm run dev
npm run build
npm test
npm run test:e2e
```

生产运行：

```bash
npm run build
npm start
```

端到端冒烟测试需要先启动本地服务，再运行：

```bash
npm run test:e2e
```

脚本会读取 `.env` 里的 `PORT` 和 `PROXY_SECRET`，调用本地代理请求 `https://httpbin.org/json`，并把返回的 JSON body 解析后打印出来。
