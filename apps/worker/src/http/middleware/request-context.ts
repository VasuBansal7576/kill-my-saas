import { createMiddleware } from "hono/factory";

export const requestContext = createMiddleware(async (context, next) => {
  const requestId = context.req.header("cf-ray") ?? crypto.randomUUID();
  context.header("x-request-id", requestId);
  await next();
});

