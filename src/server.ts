import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { Readable } from "node:stream";
import { loadConfig, type AppConfig } from "./config.js";
import { verifyHmacRequest } from "./auth.js";
import { assertSafeTargetUrl, validateProxyRequestBody } from "./validation.js";
import { performProxyRequest } from "./proxy.js";

type RawBodyRequest = FastifyRequest & {
  rawBody?: string;
};

function errorResponse(reply: FastifyReply, statusCode: number, message: string) {
  return reply.status(statusCode).send({ error: { message } });
}

function isDirectExecution(): boolean {
  return process.argv[1] ? import.meta.url === new URL(process.argv[1], "file:").href : false;
}

export function createApp(config: AppConfig): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: config.maxResponseBytes,
  });

  app.addHook("preParsing", async (request: RawBodyRequest, _reply, payload) => {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    request.rawBody = rawBody;
    return Readable.from([rawBody]);
  });

  app.post("/proxy", async (request: RawBodyRequest, reply) => {
    const rawBody = request.rawBody ?? "";
    const authResult = verifyHmacRequest({
      secret: config.proxySecret,
      headers: {
        timestamp: request.headers["x-proxy-timestamp"],
        signature: request.headers["x-proxy-signature"],
      },
      rawBody,
      now: config.now?.(),
      toleranceMs: config.timestampToleranceMs,
    });

    if (!authResult.ok) {
      return errorResponse(reply, authResult.statusCode, authResult.message);
    }

    let proxyRequest;
    try {
      proxyRequest = validateProxyRequestBody(request.body);
      if (!config.allowUnsafeTargetUrlsForTesting) {
        assertSafeTargetUrl(proxyRequest.url);
      }
    } catch (error) {
      return errorResponse(reply, 400, error instanceof Error ? error.message : "Invalid request");
    }

    try {
      const result = await performProxyRequest({
        request: proxyRequest,
        timeoutMs: config.requestTimeoutMs,
        maxResponseBytes: config.maxResponseBytes,
      });
      return reply.send(result);
    } catch (error) {
      return errorResponse(
        reply,
        502,
        error instanceof Error ? error.message : "Upstream request failed",
      );
    }
  });

  return app;
}

if (isDirectExecution()) {
  const config = loadConfig();
  const app = createApp(config);
  app.listen({ port: config.port, host: config.host }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
