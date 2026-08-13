import { createDatabase, decisions, events, submissions } from "@programflow/database";
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import {
  AcceptanceError,
  changeSubmissionDecision,
  releaseDecision,
  updateDecisionNotification,
} from "./acceptance";
import {
  requestSessionChange,
  resolveSessionChange,
  SessionChangeRequestError,
} from "./change-requests";

type ProgramContext = { Bindings: Env } & ActorContext;

const IdempotencyKeySchema = z.string().trim().min(12).max(200);
const NotificationSchema = z.object({
  revision: z.number().int().positive(),
  subjectTemplate: z.string().trim().min(1).max(998),
  htmlTemplate: z.string().min(1).max(250_000),
  textTemplate: z.string().min(1).max(100_000),
});
const DecisionChangeSchema = z.object({
  submissionId: z.uuid(),
  outcome: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().min(1).max(5_000),
  changeReason: z.string().trim().min(3).max(5_000),
  idempotencyKey: IdempotencyKeySchema,
});
const SessionChangeSchema = z.object({
  title: z.string().trim().min(3).max(180),
  abstract: z.string().trim().max(20_000),
  reason: z.string().trim().min(3).max(5_000),
  idempotencyKey: IdempotencyKeySchema,
});
const ResolveSessionChangeSchema = z.object({
  resolution: z.enum(["approved", "rejected"]),
  note: z.string().trim().min(3).max(5_000),
  idempotencyKey: IdempotencyKeySchema,
});

export function createProgramOrganizerRoutes(dependencies: {
  onDecisionReleased?: (environment: Env, outboxEventIds: readonly string[]) => Promise<void>;
} = {}) {
  const routes = new Hono<ProgramContext>();

  routes.put("/events/:eventSlug/decisions/:decisionId/notification", async (context) => {
    const input = NotificationSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return invalid(context, "invalid_decision_notification", input.error.flatten().fieldErrors);
    return run(context, async (database) => {
      await assertDecisionInEvent(database, context.req.param("decisionId"), context.req.param("eventSlug"));
      return context.json(await updateDecisionNotification(database, context.get("actor"), {
        decisionId: context.req.param("decisionId"),
        ...input.data,
      }));
    });
  });

  routes.post("/events/:eventSlug/decisions/:decisionId/release", async (context) => {
    const input = z.object({ idempotencyKey: IdempotencyKeySchema }).safeParse(await context.req.json().catch(() => null));
    if (!input.success) return invalid(context, "invalid_decision_release", input.error.flatten().fieldErrors);
    return run(context, async (database) => {
      await assertDecisionInEvent(database, context.req.param("decisionId"), context.req.param("eventSlug"));
      const result = await releaseDecision(database, context.get("actor"), {
        decisionId: context.req.param("decisionId"),
        idempotencyKey: input.data.idempotencyKey,
      });
      await dependencies.onDecisionReleased?.(context.env, result.outboxEventIds);
      return context.json(result);
    });
  });

  routes.post("/events/:eventSlug/decisions/:decisionId/change", async (context) => {
    const input = DecisionChangeSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return invalid(context, "invalid_decision_change", input.error.flatten().fieldErrors);
    return run(context, async (database) => {
      await assertDecisionInEvent(database, context.req.param("decisionId"), context.req.param("eventSlug"));
      const result = await changeSubmissionDecision(database, context.get("actor"), input.data);
      return context.json({ outcome: input.data.outcome, handoff: result });
    });
  });

  routes.post("/events/:eventSlug/session-change-requests/:requestId/resolve", async (context) => {
    const input = ResolveSessionChangeSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return invalid(context, "invalid_session_change_resolution", input.error.flatten().fieldErrors);
    return run(context, async (database) => context.json(await resolveSessionChange(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("requestId"),
      input.data,
    )));
  });

  return routes;
}

export const programSpeakerRoutes = new Hono<ProgramContext>();

programSpeakerRoutes.post("/events/:eventSlug/sessions/:sessionId/change-requests", async (context) => {
  const input = SessionChangeSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_session_change_request", input.error.flatten().fieldErrors);
  return run(context, async (database) => context.json(await requestSessionChange(
    database,
    context.get("actor"),
    context.req.param("eventSlug"),
    context.req.param("sessionId"),
    input.data,
  ), 201));
});

async function assertDecisionInEvent(database: ReturnType<typeof createDatabase>, decisionId: string, eventSlug: string) {
  const [row] = await database.select({ slug: events.slug }).from(decisions)
    .innerJoin(submissions, eq(submissions.id, decisions.submissionId))
    .innerJoin(events, eq(events.id, submissions.eventId))
    .where(eq(decisions.id, decisionId)).limit(1);
  if (!row || row.slug !== eventSlug) throw new AcceptanceError("decision_not_found", "Decision not found in this Event.");
}

async function run<T>(
  context: Context<ProgramContext>,
  operation: (database: ReturnType<typeof createDatabase>) => Promise<T>,
) {
  if (!context.env.DATABASE_URL) return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  try {
    return await operation(createDatabase(context.env.DATABASE_URL));
  } catch (error) {
    if (error instanceof AcceptanceError || error instanceof SessionChangeRequestError) {
      const status = error.code === "forbidden" ? 403
        : error.code.endsWith("_not_found") ? 404
          : error.code === "stale_notification" ? 409
            : 409;
      return context.json({ error: { code: error.code, message: error.message } }, status);
    }
    throw error;
  }
}

function invalid(context: Context<ProgramContext>, code: string, fields: unknown) {
  return context.json({ error: { code, message: "The request is invalid.", fields } }, 400);
}
