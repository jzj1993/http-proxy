# HTTP Proxy 服务端设计

## 目标

构建一个 Node.js HTTP 服务端，对外提供单个带鉴权的代理接口。远程调用方提交目标 URL、HTTP 方法、可选请求头和可选请求体。服务端从本机发起该请求，并把上游响应返回给调用方。

## 架构

服务是一个用 TypeScript 编写的小型 Fastify 应用。`POST /proxy` 是唯一的代理接口。预校验步骤会基于原始请求体和时间戳验证 HMAC 签名。鉴权通过后，请求校验会检查目标 URL、方法、请求头、请求体结构和 SSRF 防护，再用 `fetch` 发起上游请求。Fastify 通过 `preParsing` hook 捕获原始 JSON 请求体，这样 HMAC 签名可以基于客户端实际发送的字节内容验证。

## 请求契约

客户端调用：

```http
POST /proxy
X-Proxy-Timestamp: <unix milliseconds>
X-Proxy-Signature: <hex hmac-sha256>
Content-Type: application/json
```

签名载荷是：

```text
<timestamp>.<raw request body>
```

请求体是：

```json
{
  "url": "https://example.com/api",
  "method": "GET",
  "headers": {
    "accept": "application/json"
  },
  "body": null
}
```

允许的方法是 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD` 和 `OPTIONS`。

## 响应契约

代理接口返回 JSON：

```json
{
  "status": 200,
  "headers": {
    "content-type": "application/json"
  },
  "body": "{\"ok\":true}",
  "bodyEncoding": "utf8"
}
```

如果上游响应体不是有效的 UTF-8 文本，`bodyEncoding` 为 `base64`。

## 安全

服务要求配置 `PROXY_SECRET`。没有有效时间戳或 HMAC 签名的请求会被拒绝。时间戳偏移默认允许 5 分钟，以降低重放风险。

目标 URL 只允许 `http:` 和 `https:`。服务会拒绝 localhost、loopback、私有 IPv4 地址段、link-local 地址段、multicast 地址段、IPv6 loopback、IPv6 unique-local 地址段和 IPv6 link-local 地址段。`host`、`connection`、`transfer-encoding`、`upgrade` 等 hop-by-hop 和 authority 类请求头不会被转发。

上游请求使用可配置超时时间。上游响应体大小受可配置上限约束。

## 配置

环境变量：

```bash
PROXY_SECRET=required-shared-secret
PORT=3000
HOST=0.0.0.0
REQUEST_TIMEOUT_MS=15000
MAX_RESPONSE_BYTES=5242880
TIMESTAMP_TOLERANCE_MS=300000
```

## 测试

测试覆盖 HMAC 校验、时间戳拒绝、请求结构校验、URL 安全检查、请求头过滤、上游请求转发、响应编码、超时处理和响应大小限制。
