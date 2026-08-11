import { ReadinessResponseSchema, type ReadinessResponse } from "@programflow/contracts";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./env";
import { requestContext } from "./http/middleware/request-context";

type WorkerContext = { Bindings: Env };

export function createApp() {
  const app = new Hono<WorkerContext>();

  app.use("*", requestContext);
  app.use("*", secureHeaders());

  app.get("/api/v1/health/live", (context) =>
    context.json({ status: "ok", service: "programflow" } as const),
  );

  app.get("/api/v1/health/ready", (context) => {
    const dependencies = {
      database: status(Boolean(context.env.DATABASE_URL), "Neon PostgreSQL connection"),
      auth: status(Boolean(context.env.NEON_AUTH_BASE_URL), "Neon Auth endpoint"),
      email: status(Boolean(context.env.BREVO_API_KEY), "Brevo transactional email"),
      files: status(Boolean(context.env.FILES), "Cloudflare R2 binding"),
      queue: status(Boolean(context.env.JOBS), "Cloudflare Queue binding"),
      ai: status(Boolean(context.env.AI), "Cloudflare Workers AI binding"),
    };
    const response: ReadinessResponse = {
      status: Object.values(dependencies).every((dependency) => dependency.configured)
        ? "ready"
        : "needs_configuration",
      service: "programflow",
      environment: context.env.APP_ENV,
      commit: context.env.GIT_COMMIT_SHA ?? "local",
      dependencies,
    };

    return context.json(ReadinessResponseSchema.parse(response));
  });

  app.get("/api/v1", (context) =>
    context.json({
      name: "ProgramFlow API",
      version: "v1",
      documentation: "/api/v1/openapi.json",
    }),
  );

  app.notFound((context) =>
    context.json(
      { error: { code: "not_found", message: "The requested API resource does not exist." } },
      404,
    ),
  );

  app.onError((error, context) => {
    console.error(JSON.stringify({
      level: "error",
      operation: "http_request",
      message: error.message,
      requestId: context.res.headers.get("x-request-id"),
    }));
    return context.json(
      { error: { code: "internal_error", message: "The request could not be completed." } },
      500,
    );
  });

  return app;
}

function status(configured: boolean, dependency: string) {
  return {
    configured,
    detail: configured ? `${dependency} is configured` : `${dependency} needs configuration`,
  };
}

