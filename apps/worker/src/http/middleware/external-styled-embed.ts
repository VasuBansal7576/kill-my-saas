import type { MiddlewareHandler } from "hono";

export const externalStyledEmbedHeaders: MiddlewareHandler = async (context, next) => {
  await next();

  const contentType = context.res.headers.get("content-type")?.toLowerCase();
  if (context.res.status !== 200 || !contentType?.startsWith("text/html")) return;

  context.res.headers.delete("x-frame-options");
  context.res.headers.set("cross-origin-resource-policy", "cross-origin");
  context.res.headers.set(
    "content-security-policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors *",
  );
};
