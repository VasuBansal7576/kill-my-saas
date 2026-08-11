import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { AirtableRestAdapter } from "./airtable-adapter";
import { AirtableIntegrationRepository, AirtableRepositoryError } from "./repository";
import { AirtableIntegrationError, AirtableIntegrationService } from "./service";

type IntegrationsContext = { Bindings: Env } & ActorContext;

export const integrationsOrganizerRoutes = new Hono<IntegrationsContext>();

const mappingSchema = z.object({
  entityType: z.enum(["person", "speaker", "session"]),
  localField: z.string().trim().min(1).max(100),
  externalField: z.string().trim().min(1).max(100),
  direction: z.enum(["export", "import", "both"]),
  owner: z.enum(["programflow", "airtable"]),
  enabled: z.boolean().optional(),
});

const configurationSchema = z.object({
  baseId: z.string().trim().max(100).nullable().optional(),
  tableId: z.string().trim().max(150).nullable().optional(),
  credentialBinding: z.literal("AIRTABLE_TOKEN").optional(),
  modifiedTimeField: z.string().trim().max(100).nullable().optional(),
  enabled: z.boolean(),
  pageSize: z.number().int().min(1).max(100).optional(),
  mappings: z.array(mappingSchema).max(100),
});

integrationsOrganizerRoutes.get("/events/:eventSlug/integrations/airtable", async (context) => run(context, async (service) =>
  context.json(await service.getWorkspace(context.get("actor"), context.req.param("eventSlug"), Boolean(airtableToken(context)))),
));

integrationsOrganizerRoutes.put("/events/:eventSlug/integrations/airtable", async (context) => {
  const parsed = configurationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_airtable_configuration", parsed.error.flatten().fieldErrors);
  return run(context, async (service) => context.json(await service.saveConfiguration(
    context.get("actor"),
    context.req.param("eventSlug"),
    parsed.data,
    Boolean(airtableToken(context)),
  )));
});

integrationsOrganizerRoutes.post("/events/:eventSlug/integrations/airtable/sync", async (context) => {
  const body: unknown = await context.req.json().catch(() => null);
  const token = airtableToken(context);
  const provider = token ? new AirtableRestAdapter({ token }) : undefined;
  return run(context, async (service) => context.json(await service.run(
    context.get("actor"), context.req.param("eventSlug"), body, provider,
  )));
});

function service(context: Context<IntegrationsContext>) {
  if (!context.env.DATABASE_URL) throw new AirtableHttpError("database_not_configured", "Database configuration is required.");
  return new AirtableIntegrationService(new AirtableIntegrationRepository(createDatabase(context.env.DATABASE_URL)));
}
async function run<T>(context: Context<IntegrationsContext>, operation: (service: AirtableIntegrationService) => Promise<T>) {
  try {
    return await operation(service(context));
  } catch (error) {
    return integrationError(context, error);
  }
}

function airtableToken(context: Context<IntegrationsContext>): string | undefined {
  const value = (context.env as unknown as Record<string, unknown>).AIRTABLE_TOKEN;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function invalid(context: Context<IntegrationsContext>, code: string, fields: Record<string, string[] | undefined>) {
  return context.json({ error: { code, message: "The Airtable configuration is invalid.", fields } }, 400);
}

function integrationError(context: Context<IntegrationsContext>, error: unknown) {
  if (error instanceof AirtableHttpError) return context.json({ error: { code: error.code, message: error.message } }, 503);
  if (error instanceof AirtableIntegrationError) {
    const status = error.code === "forbidden" ? 403 : error.code === "invalid_event" ? 409 : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
  if (error instanceof AirtableRepositoryError) {
    return context.json({ error: { code: error.code, message: error.message } }, 404);
  }
  throw error;
}

class AirtableHttpError extends Error {
  constructor(readonly code: "database_not_configured", message: string) { super(message); }
}
