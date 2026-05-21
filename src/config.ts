/*
 * 文件说明: 读取代理服务运行配置，并为端口、超时和响应大小提供默认值与校验。
 * 参考资料: .env.example, README.md
 */
import "dotenv/config";

export type AppConfig = {
  proxySecret: string;
  port: number;
  host: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  timestampToleranceMs: number;
  now?: () => number;
  allowUnsafeTargetUrlsForTesting?: boolean;
};

function parsePositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  const rawValue = env[name];
  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (!env.PROXY_SECRET) {
    throw new Error("PROXY_SECRET is required");
  }

  return {
    proxySecret: env.PROXY_SECRET,
    port: parsePositiveInteger(env, "PORT", 9090),
    host: env.HOST || "0.0.0.0",
    requestTimeoutMs: parsePositiveInteger(env, "REQUEST_TIMEOUT_MS", 15_000),
    maxResponseBytes: parsePositiveInteger(env, "MAX_RESPONSE_BYTES", 5 * 1024 * 1024),
    timestampToleranceMs: parsePositiveInteger(env, "TIMESTAMP_TOLERANCE_MS", 300_000),
  };
}
