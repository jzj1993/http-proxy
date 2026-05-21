# HTTP Proxy 服务端实现计划

> **给 agentic workers：** 必须使用子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步实现本计划。步骤使用 checkbox（`- [ ]`）语法来跟踪进度。

**目标：** 构建一个带鉴权的 Node.js HTTP 代理服务，接收带签名的代理请求，并从本机转发安全的 HTTP 请求。

**架构：** 创建一个 Fastify TypeScript 服务，按职责拆分为配置、HMAC 鉴权、请求校验、代理执行和服务装配模块。测试使用 Vitest 与 Fastify injection 覆盖接口行为，并用本地 mock 上游服务覆盖转发行为。

**技术栈：** Node.js、TypeScript、Fastify、Vitest、tsx、内置 `fetch`、dotenv。

---

## 文件结构

- `package.json`：脚本和运行时/开发依赖。
- `tsconfig.json`：Node.js 的 TypeScript 编译配置。
- `.gitignore`：生成文件和本地文件忽略规则。
- `.env.example`：运行时配置示例。
- `src/config.ts`：加载并校验环境配置。
- `src/auth.ts`：HMAC 签名校验。
- `src/validation.ts`：代理载荷校验、安全 URL 检查和请求头过滤。
- `src/proxy.ts`：执行上游请求、超时、响应大小限制和响应体编码。
- `src/server.ts`：创建 Fastify app、注册路由，并在直接执行时启动服务。
- `test/auth.test.ts`：HMAC 测试。
- `test/validation.test.ts`：URL、载荷和请求头测试。
- `test/proxy.test.ts`：上游转发测试。
- `test/server.test.ts`：接口集成测试。

### 任务 1：项目脚手架

**文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`.gitignore`
- 创建：`.env.example`

- [ ] **步骤 1：创建项目元数据和脚本**

创建 `package.json`：

```json
{
  "name": "http-proxy",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "fastify": "^5.2.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **步骤 2：创建 TypeScript 配置**

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **步骤 3：创建本地文件忽略列表**

创建 `.gitignore`：

```gitignore
node_modules
dist
.env
.DS_Store
coverage
```

- [ ] **步骤 4：创建配置示例**

创建 `.env.example`：

```bash
PROXY_SECRET=replace-with-a-long-random-secret
PORT=3000
HOST=0.0.0.0
REQUEST_TIMEOUT_MS=15000
MAX_RESPONSE_BYTES=5242880
TIMESTAMP_TOLERANCE_MS=300000
```

- [ ] **步骤 5：安装依赖**

运行：`npm install`

预期：依赖安装完成，并生成 `package-lock.json`。

### 任务 2：HMAC 鉴权

**文件：**
- 创建：`src/auth.ts`
- 创建：`test/auth.test.ts`

- [ ] **步骤 1：编写失败的鉴权测试**

创建 `test/auth.test.ts`，覆盖有效签名、无效签名、缺失请求头、过期时间戳、未来时间戳和格式错误的时间戳。

- [ ] **步骤 2：实现鉴权模块**

创建 `src/auth.ts`，导出：

```ts
export type AuthHeaders = {
  timestamp?: string | string[];
  signature?: string | string[];
};

export function createSignature(secret: string, timestamp: string, rawBody: string): string;

export function verifyHmacRequest(input: {
  secret: string;
  headers: AuthHeaders;
  rawBody: string;
  now?: number;
  toleranceMs: number;
}): { ok: true } | { ok: false; statusCode: 401; message: string };
```

使用 `crypto.createHmac("sha256", secret)` 生成签名，并使用 `crypto.timingSafeEqual` 比较签名。

- [ ] **步骤 3：运行鉴权测试**

运行：`npm test -- test/auth.test.ts`

预期：所有鉴权测试通过。

### 任务 3：校验和请求头过滤

**文件：**
- 创建：`src/validation.ts`
- 创建：`test/validation.test.ts`

- [ ] **步骤 1：编写失败的校验测试**

创建测试，覆盖允许的方法、被拒绝的方法、无效 URL、非 HTTP 协议、本地/私有 IPv4 目标、loopback/unique-local IPv6 目标、有效公共 hostname，以及会被剥离的 hop-by-hop 请求头。

- [ ] **步骤 2：实现校验模块**

创建 `src/validation.ts`，导出：

```ts
export type ProxyMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type ProxyRequestBody = {
  url: string;
  method: ProxyMethod;
  headers?: Record<string, string>;
  body?: string | null;
  bodyEncoding?: "utf8" | "base64";
};

export function validateProxyRequestBody(value: unknown): ProxyRequestBody;

export function assertSafeTargetUrl(rawUrl: string): URL;

export function filterForwardHeaders(headers?: Record<string, string>): Record<string, string>;
```

使用 `node:net` 的 IP 检查拒绝不安全主机中的字面量 IP，并阻止 `localhost` 主机名。DNS rebinding 防护可以之后通过在 `fetch` 前解析 hostname 增加；当前版本阻止字面量不安全地址和明显的 localhost 名称。

- [ ] **步骤 3：运行校验测试**

运行：`npm test -- test/validation.test.ts`

预期：所有校验测试通过。

### 任务 4：代理执行器

**文件：**
- 创建：`src/proxy.ts`
- 创建：`test/proxy.test.ts`

- [ ] **步骤 1：编写失败的代理测试**

在测试中创建本地 `node:http` 上游服务，验证方法、请求头、UTF-8 请求体转发、base64 请求体转发、响应头、UTF-8 响应编码、二进制响应 base64 编码、超时拒绝和最大响应字节拒绝。

- [ ] **步骤 2：实现代理执行器**

创建 `src/proxy.ts`，导出：

```ts
import type { ProxyRequestBody } from "./validation.js";

export type ProxyResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
};

export async function performProxyRequest(input: {
  request: ProxyRequestBody;
  timeoutMs: number;
  maxResponseBytes: number;
}): Promise<ProxyResult>;
```

使用 `AbortController` 处理超时，使用 `fetch` 发起上游请求，使用 `filterForwardHeaders` 处理出站请求头，并通过流式读取和字节计数实现响应大小限制。

- [ ] **步骤 3：运行代理测试**

运行：`npm test -- test/proxy.test.ts`

预期：所有代理测试通过。

### 任务 5：Fastify 服务端

**文件：**
- 创建：`src/config.ts`
- 创建：`src/server.ts`
- 创建：`test/server.test.ts`

- [ ] **步骤 1：编写失败的服务端集成测试**

创建测试，用已知 secret 构建 app，发送带签名的 Fastify injection 请求，验证成功代理响应、拒绝错误签名、拒绝过期时间戳、拒绝无效载荷，并把上游失败映射成 JSON 错误。

- [ ] **步骤 2：实现配置加载器**

创建 `src/config.ts`，导出：

```ts
export type AppConfig = {
  proxySecret: string;
  port: number;
  host: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  timestampToleranceMs: number;
};

export function loadConfig(env?: NodeJS.ProcessEnv): AppConfig;
```

要求 `PROXY_SECRET` 必填；带默认值解析正整数配置。

- [ ] **步骤 3：实现 Fastify 服务端**

创建 `src/server.ts`，导出：

```ts
export function createApp(config: AppConfig): FastifyInstance;
```

添加 `preParsing` hook，把原始 JSON 请求体捕获到 Fastify request 对象上。添加 `POST /proxy`，先验证 HMAC，再处理请求；校验载荷，运行代理执行器，并返回形如 `{ "error": { "message": "..." } }` 的 JSON 错误。

- [ ] **步骤 4：运行服务端测试**

运行：`npm test -- test/server.test.ts`

预期：所有服务端集成测试通过。

### 任务 6：最终验证和 README

**文件：**
- 创建：`README.md`

- [ ] **步骤 1：创建 README**

记录安装、配置、本地运行、请求格式、HMAC 签名示例、安全限制和响应格式。

- [ ] **步骤 2：运行完整验证**

运行：

```bash
npm test
npm run build
```

预期：测试通过，TypeScript 输出 `dist`。

## 自检

- Spec 覆盖：计划覆盖脚手架、鉴权、校验、代理执行、服务路由、配置、测试和 README。
- 占位符扫描：没有遗留开放占位符或未定义的实现阶段。
- 类型一致性：请求和响应类型只定义一次，并在各模块中保持一致引用。
