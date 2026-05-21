# HTTP Proxy

`HTTP Proxy` is an HMAC-protected HTTP proxy service. Callers send a signed `POST /proxy` request to the local service, and the service performs the outbound HTTP/HTTPS request and returns the upstream response.

[中文 README](README.zh-CN.md)

## What It Does

| Path | Purpose |
| --- | --- |
| `src/` | Proxy server that exposes `POST /proxy`. |
| `client/` | TypeScript client that signs requests and wraps proxy calls. |
| `e2e/` | Local end-to-end smoke test for the proxy flow. |

The proxy supports HTTP/HTTPS targets, common HTTP methods, text request bodies, and base64-encoded binary request bodies. It blocks clearly unsafe targets such as localhost, private IPv4 ranges, link-local addresses, multicast addresses, IPv6 loopback, IPv6 unique-local, and IPv6 link-local addresses.

## Use Cases

- Centralize outbound HTTP/HTTPS access for internal services.
- Give restricted runtimes a fixed, signed gateway for external APIs.
- Provide scripts, job queues, or AI agents with a protected request relay.
- Route third-party API traffic through one service so logging, rate limiting, and auditing can be added later.

## Quick Start

```bash
npm install
cp .env.example .env
```

Edit `.env` and replace `PROXY_SECRET` with a long random secret, then start the service:

```bash
npm run dev
```

By default, the server listens on `0.0.0.0:3000`.

## Client Usage

The recommended path is to use `HttpProxyClient` from `client/`. Callers do not need to build HMAC headers manually.

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

Core types:

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

## Configuration

`.env` contains the runtime configuration for the proxy service:

```bash
PROXY_SECRET=replace-with-a-long-random-secret
PORT=3000
HOST=0.0.0.0
REQUEST_TIMEOUT_MS=15000
MAX_RESPONSE_BYTES=5242880
TIMESTAMP_TOLERANCE_MS=300000
```

| Variable | Description |
| --- | --- |
| `PROXY_SECRET` | Required HMAC signing secret. |
| `PORT` | Listen port. Defaults to `3000`. |
| `HOST` | Listen host. Defaults to `0.0.0.0`. |
| `REQUEST_TIMEOUT_MS` | Upstream request timeout. Defaults to `15000`. |
| `MAX_RESPONSE_BYTES` | Maximum upstream response body size. Defaults to `5242880`. |
| `TIMESTAMP_TOLERANCE_MS` | Allowed timestamp skew for signed requests. Defaults to `300000`. |

## Direct API Calls

If you do not use `client/`, call `POST /proxy` directly and generate the signature yourself:

```http
POST /proxy
Content-Type: application/json
X-Proxy-Timestamp: <unix milliseconds>
X-Proxy-Signature: <hmac-sha256 hex>
```

The signed payload is `<timestamp>.<raw JSON request body>`.

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

## Security Boundary

The service rejects unsigned requests, requests with invalid signatures, and requests outside the allowed timestamp window. Target URLs must use `http:` or `https:`.

Before forwarding, the proxy removes hop-by-hop and authority-related request headers. It also blocks literal unsafe hosts such as localhost, private network addresses, link-local addresses, multicast addresses, IPv6 loopback, IPv6 unique-local, and IPv6 link-local addresses.

The current implementation checks literal unsafe addresses and localhost-style hostnames. For multi-tenant or hostile environments, add DNS resolution checks to reduce DNS rebinding risk.

## Development

```bash
npm run dev
npm run build
npm test
npm run test:e2e
```

Run the production build:

```bash
npm run build
npm start
```

For the end-to-end smoke test, start the local service first, then run:

```bash
npm run test:e2e
```

The script reads `PORT` and `PROXY_SECRET` from `.env`, calls the local proxy for `https://httpbin.org/json`, and prints the parsed JSON body.
