import { handleAuthProxyRequest } from "@neondatabase/auth/server";
import type { Context } from "hono";
import type { Env } from "../../env";

type WorkerContext = { Bindings: Env };

export async function proxyAuthRequest(context: Context<WorkerContext>): Promise<Response> {
  const baseUrl = context.env.NEON_AUTH_BASE_URL;
  const cookieSecret = context.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !cookieSecret) {
    return context.json(
      { error: { code: "auth_not_configured", message: "Authentication is not configured for this environment." } },
      503,
    );
  }

  const path = context.req.path.replace(/^\/api\/auth\/?/, "");
  return handleAuthProxyRequest({
    request: context.req.raw,
    path,
    baseUrl,
    cookieSecret,
    sameSite: "lax",
  });
}

