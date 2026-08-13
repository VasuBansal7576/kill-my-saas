import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import { claimAndEnqueueOutbox } from "../../outbox";
import type { ActorContext } from "../identity-access/actor";
import { BrevoEmailAdapter, type ProviderOutcome } from "./brevo-adapter";
import {
  BrevoWebhookEventSchema,
  CommunicationHistoryQuerySchema,
  CreatePlacementCalendarSchema,
  QueueOrganizerCommunicationSchema,
  RetryDeliverySchema,
  SaveCommunicationTemplateSchema,
  type BrevoWebhookEvent,
} from "./contracts";
import {
  applyProviderOutcome,
  CommunicationsError,
  createPlacementCalendarArtifacts,
  dispatchDelivery,
  getCommunicationDetail,
  listCommunicationHistory,
  listCommunicationsSummary,
  listCommunicationsWorkspace,
  pollDeliveryOutcome,
  queueOrganizerCommunication,
  retryDelivery,
  saveTemplate,
} from "./service";

export type CommunicationsEnv = Env & {
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  BREVO_WEBHOOK_TOKEN?: string;
};

type CommunicationsContext = { Bindings: CommunicationsEnv } & ActorContext;
type WebhookContext = { Bindings: CommunicationsEnv };

export const communicationsOrganizerRoutes = new Hono<CommunicationsContext>();
export const communicationsProviderRoutes = new Hono<WebhookContext>();

communicationsOrganizerRoutes.get("/events/:eventSlug/communications", async (context) => run(context, async (database) =>
  context.json(await listCommunicationsWorkspace(database, context.get("actor"), context.req.param("eventSlug"))),
));

communicationsOrganizerRoutes.get("/events/:eventSlug/communications/summary", async (context) => run(context, async (database) =>
  context.json(await listCommunicationsSummary(database, context.get("actor"), context.req.param("eventSlug"))),
));

communicationsOrganizerRoutes.get("/events/:eventSlug/communications/history", async (context) => {
  const parsed = CommunicationHistoryQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return invalid(context, "invalid_communication_history_query", parsed.error.flatten().fieldErrors);
  return run(context, async (database) => context.json(await listCommunicationHistory(
    database,
    context.get("actor"),
    context.req.param("eventSlug"),
    parsed.data,
  )));
});

communicationsOrganizerRoutes.get("/events/:eventSlug/communications/:communicationId", async (context) => run(context, async (database) =>
  context.json(await getCommunicationDetail(
    database,
    context.get("actor"),
    context.req.param("eventSlug"),
    context.req.param("communicationId"),
  )),
));

communicationsOrganizerRoutes.put("/events/:eventSlug/communications/templates", async (context) => {
  const parsed = SaveCommunicationTemplateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_communication_template", parsed.error.flatten().fieldErrors);
  return run(context, async (database) => context.json(await saveTemplate(
    database, context.get("actor"), context.req.param("eventSlug"), parsed.data,
  )));
});

communicationsOrganizerRoutes.post("/events/:eventSlug/communications", async (context) => {
  const parsed = QueueOrganizerCommunicationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_communication", parsed.error.flatten().fieldErrors);
  return run(context, async (database) => {
    const result = await queueOrganizerCommunication(database, context.get("actor"), context.req.param("eventSlug"), parsed.data);
    context.executionCtx.waitUntil(claimAndEnqueueOutbox(context.env, result.outboxEventIds));
    return context.json(result, 202);
  });
});

communicationsOrganizerRoutes.post("/events/:eventSlug/communications/deliveries/:recipientId/retry", async (context) => {
  const parsed = RetryDeliverySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_delivery_retry", parsed.error.flatten().fieldErrors);
  return run(context, async (database) => {
    const result = await retryDelivery(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("recipientId"),
      parsed.data.idempotencyKey,
    );
    if (result.outboxEventId) context.executionCtx.waitUntil(claimAndEnqueueOutbox(context.env, [result.outboxEventId]));
    return context.json(result, 202);
  });
});

communicationsOrganizerRoutes.post("/events/:eventSlug/communications/deliveries/:recipientId/poll", async (context) =>
  run(context, async (database) => {
    const provider = configuredBrevo(context.env);
    if (!provider) return context.json({ error: { code: "brevo_not_configured", message: "Brevo credentials and a verified sender are required to reconcile delivery." } }, 503);
    return context.json(await pollDeliveryOutcome(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("recipientId"),
      provider,
    ));
  }),
);

communicationsOrganizerRoutes.post("/events/:eventSlug/communications/calendar-artifacts", async (context) => {
  const parsed = CreatePlacementCalendarSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_calendar_artifact", parsed.error.flatten().fieldErrors);
  return run(context, async (database) => {
    const result = await createPlacementCalendarArtifacts(database, context.get("actor"), context.req.param("eventSlug"), parsed.data);
    if (result.communication) context.executionCtx.waitUntil(claimAndEnqueueOutbox(context.env, result.communication.outboxEventIds));
    return context.json(result, 201);
  });
});

communicationsProviderRoutes.post("/brevo", async (context) => {
  const configuredToken = context.env.BREVO_WEBHOOK_TOKEN;
  if (!configuredToken) return context.json({ error: { code: "webhook_not_configured", message: "Brevo webhook authentication is not configured." } }, 503);
  const bearer = context.req.header("authorization");
  const customToken = context.req.header("x-programflow-webhook-token");
  if (bearer !== `Bearer ${configuredToken}` && customToken !== configuredToken) {
    return context.json({ error: { code: "invalid_webhook_authentication", message: "Webhook authentication failed." } }, 401);
  }
  const body: unknown = await context.req.json().catch(() => null);
  const candidates = Array.isArray(body) ? body : [body];
  const parsed = candidates.map((candidate) => BrevoWebhookEventSchema.safeParse(candidate));
  if (parsed.some((result) => !result.success)) {
    return context.json({ error: { code: "invalid_webhook_event", message: "Webhook event payload is invalid." } }, 400);
  }
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const outcomes = parsed.map((result) => {
    if (!result.success) throw new Error("Validated webhook event unexpectedly failed to parse.");
    return webhookOutcome(result.data);
  });
  const applied = [];
  for (const outcome of outcomes) applied.push(await applyProviderOutcome(database, outcome));
  return context.json({ accepted: applied.length, outcomes: applied });
});

export function configuredBrevo(environment: CommunicationsEnv) {
  if (!environment.BREVO_API_KEY || !environment.BREVO_SENDER_EMAIL) return undefined;
  return new BrevoEmailAdapter({
    apiKey: environment.BREVO_API_KEY,
    senderEmail: environment.BREVO_SENDER_EMAIL,
    senderName: environment.BREVO_SENDER_NAME ?? "ProgramFlow",
  });
}

export async function processCommunicationDelivery(environment: CommunicationsEnv, recipientId: string) {
  if (!environment.DATABASE_URL) throw new Error("Database configuration is required.");
  return dispatchDelivery(createDatabase(environment.DATABASE_URL), recipientId, configuredBrevo(environment));
}

function webhookOutcome(event: BrevoWebhookEvent): ProviderOutcome {
  const epoch = event.ts_epoch ?? (event.ts_event ? event.ts_event * 1_000 : event.ts ? event.ts * 1_000 : undefined);
  const occurredAt = epoch ? new Date(epoch) : event.date ? new Date(event.date) : new Date();
  const safeOccurredAt = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
  const providerMessageId = event["message-id"];
  return {
    providerEventId: `${providerMessageId}:${event.event}:${event.id ?? safeOccurredAt.toISOString()}`,
    providerMessageId,
    eventType: event.event,
    occurredAt: safeOccurredAt,
    reason: event.reason,
    metadata: { email: event.email, subject: event.subject, tags: event.tags ?? event.tag },
  };
}

function configuredDatabase<C extends CommunicationsContext | WebhookContext>(context: Context<C>) {
  if (!context.env.DATABASE_URL) {
    return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  }
  return createDatabase(context.env.DATABASE_URL);
}

async function run<T>(context: Context<CommunicationsContext>, operation: (database: ReturnType<typeof createDatabase>) => Promise<T>) {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  try {
    return await operation(database);
  } catch (error) {
    if (!(error instanceof CommunicationsError)) throw error;
    const status = ["event_not_found", "template_not_found", "communication_not_found", "delivery_not_found", "placement_not_found"].includes(error.code)
      ? 404
      : error.code === "forbidden"
        ? 403
        : ["idempotency_conflict", "invalid_delivery_state"].includes(error.code)
          ? 409
          : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
}

function invalid(context: Context<CommunicationsContext>, code: string, fields: Record<string, string[] | undefined>) {
  return context.json({ error: { code, message: "The request is invalid.", fields } }, 400);
}
