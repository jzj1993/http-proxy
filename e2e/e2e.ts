/*
 * 文件说明: 端到端调用已启动的本地代理服务，请求外部 HTTP 目标并校验代理返回结果。
 * 参考资料: README.md
 */
import "dotenv/config";
import { HttpProxyClient } from "../client/index.js";

const proxyHost = "127.0.0.1";
const proxyPort = process.env.PORT ?? "3000";
const proxyUrl = `http://${proxyHost}:${proxyPort}/proxy`;
const targetUrl = "https://httpbin.org/json";
const secret = process.env.PROXY_SECRET;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

async function main() {
  const proxySecret = requireEnv(secret, "PROXY_SECRET");
  const client = new HttpProxyClient({ proxyUrl, proxySecret });
  const result = await client.request({
    url: targetUrl,
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upstream returned HTTP ${result.status}: ${result.body}`);
  }
  if (result.bodyEncoding !== "utf8") {
    throw new Error(`Expected utf8 body, received ${result.bodyEncoding}`);
  }

  const parsedBody = parseJsonBody(result.body) as { slideshow?: unknown };
  if (!parsedBody.slideshow) {
    throw new Error("Unexpected upstream body: missing slideshow field");
  }

  console.log("E2E proxy request succeeded");
  console.log(
    JSON.stringify(
      {
        proxyUrl,
        targetUrl,
        result: {
          ...result,
          body: parsedBody,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
