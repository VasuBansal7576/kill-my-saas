import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../../../env";
import type { ActorContext } from "../../identity-access/actor";
import { AcceleventsRestAdapter } from "./adapter";
import { AcceleventsIntegrationRepository, AcceleventsRepositoryError } from "./repository";
import { AcceleventsIntegrationError, AcceleventsIntegrationService } from "./service";

type AcceleventsContext = { Bindings: Env } & ActorContext;
export const acceleventsOrganizerRoutes = new Hono<AcceleventsContext>();

const fieldMappingSchema = z.object({
  entityType: z.enum(["speaker", "session"]),
  canonicalField: z.string().trim().min(1).max(100),
  externalField: z.string().trim().min(1).max(100),
  required: z.boolean(),
  enabled: z.boolean(),
});
const referenceMappingSchema = z.object({
  referenceType: z.enum(["track", "format"]),
  canonicalId: z.string().uuid(),
  canonicalLabel: z.string().trim().min(1).max(150),
  externalValue: z.string().trim().min(1).max(150),
});
const configurationSchema = z.object({
  externalEventUrl: z.string().trim().max(200).nullable().optional(),
  apiBaseUrl: z.literal("https://api.accelevents.com").optional(),
  credentialBinding: z.literal("ACCELEVENTS_API_TOKEN").optional(),
  authorizationHeader: z.enum(["Authorization", "Key"]).optional(),
  enabled: z.boolean(),
  mappings: z.array(fieldMappingSchema).min(1).max(100),
  referenceMappings: z.array(referenceMappingSchema).max(200),
});

acceleventsOrganizerRoutes.get("/events/:eventSlug/integrations/accelevents", async (context) => execute(context, async (service) =>
  context.json(await service.getWorkspace(context.get("actor"), context.req.param("eventSlug"), Boolean(token(context)))),
));

acceleventsOrganizerRoutes.put("/events/:eventSlug/integrations/accelevents", async (context) => {
  const parsed = configurationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "invalid_accelevents_configuration", message: "The Accelevents configuration is invalid.", fields: parsed.error.flatten().fieldErrors } }, 400);
  return execute(context, async (service) => context.json(await service.saveConfiguration(
    context.get("actor"), context.req.param("eventSlug"), parsed.data, Boolean(token(context)),
  )));
});

acceleventsOrganizerRoutes.post("/events/:eventSlug/integrations/accelevents/runs", async (context) => {
  const body: unknown = await context.req.json().catch(() => null);
  const secret = token(context);
  const candidate = body && typeof body === "object" ? body as { mode?: unknown } : {};
  const provider = candidate.mode !== "preview" && secret ? (configuration: { apiBaseUrl: string; authorizationHeader: string }) =>
    new AcceleventsRestAdapter({
      token: secret,
      baseUrl: configuration.apiBaseUrl,
      authorizationHeader: configuration.authorizationHeader === "Key" ? "Key" : "Authorization",
    }) : undefined;
  return execute(context, async (service) => context.json(await service.run(
    context.get("actor"), context.req.param("eventSlug"), body, provider,
  )));
});

function service(context: Context<AcceleventsContext>) {
  if (!context.env.DATABASE_URL) throw new AcceleventsHttpError("database_not_configured", "Database configuration is required.");
  return new AcceleventsIntegrationService(new AcceleventsIntegrationRepository(createDatabase(context.env.DATABASE_URL)));
}

async function execute<T>(context: Context<AcceleventsContext>, operation: (service: AcceleventsIntegrationService) => Promise<T>) {
  try { return await operation(service(context)); }
  catch (error) { return integrationError(context, error); }
}

function token(context: Context<AcceleventsContext>): string | undefined {
  const value = context.env.ACCELEVENTS_API_TOKEN;
  return value?.trim() || undefined;
}

function integrationError(context: Context<AcceleventsContext>, error: unknown) {
  if (error instanceof AcceleventsHttpError) return context.json({ error: { code: error.code, message: error.message } }, 503);
  if (error instanceof AcceleventsIntegrationError) {
    const status = error.code === "forbidden" ? 403 : error.code === "invalid_event" ? 409 : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
  if (error instanceof AcceleventsRepositoryError) return context.json({ error: { code: error.code, message: error.message } }, 404);
  throw error;
}

class AcceleventsHttpError extends Error {
  constructor(readonly code: "database_not_configured", message: string) { super(message); }
}
