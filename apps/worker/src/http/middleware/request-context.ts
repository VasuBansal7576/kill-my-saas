import { createMiddleware } from "hono/factory";

export const requestContext = createMiddleware(async (context, next) => {
  const requestId = context.req.header("cf-ray") ?? crypto.randomUUID();
  const startedAt = performance.now();
  context.header("x-request-id", requestId);
  await next();
  const durationMs = performance.now() - startedAt;
  context.header("server-timing", `app;dur=${durationMs.toFixed(1)}`);
  context.header("x-response-time", `${durationMs.toFixed(1)}ms`);
  if (durationMs >= 750) {
    console.warn(JSON.stringify({
      level: "warn",
      operation: "slow_http_request",
      requestId,
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      durationMs: Math.round(durationMs),
    }));
  }
});
