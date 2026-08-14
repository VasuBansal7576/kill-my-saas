import { PlaceSessionCommandSchema } from "@programflow/contracts";
import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { SchedulingRepository, SchedulingRepositoryError } from "./repository";
import { SchedulingError, SchedulingService } from "./service";

type SchedulingContext = { Bindings: Env } & ActorContext;

export const schedulingOrganizerRoutes = new Hono<SchedulingContext>();

schedulingOrganizerRoutes.get("/events/:eventSlug/agenda", async (context) => {
  const revisionId = context.req.query("revisionId");
  if (revisionId && !z.uuid().safeParse(revisionId).success) {
    return invalid(context, "invalid_revision", { revisionId: ["Choose a valid schedule revision."] });
  }
  return run(context, async (service) => context.json(await service.getWorkspace(
    context.get("actor"), context.req.param("eventSlug"), revisionId,
  )));
});

schedulingOrganizerRoutes.post("/events/:eventSlug/agenda/revisions", async (context) => run(context, async (service) =>
  context.json(await service.createDraftRevision(context.get("actor"), context.req.param("eventSlug")), 201),
));

schedulingOrganizerRoutes.put("/events/:eventSlug/agenda/placements/:sessionId", async (context) => {
  const parsed = PlaceSessionCommandSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_place_session", parsed.error.flatten().fieldErrors);
  if (parsed.data.sessionId !== context.req.param("sessionId")) {
    return context.json({ error: { code: "invalid_place_session", message: "The route and command session IDs must match." } }, 400);
  }
  return run(context, async (service) => context.json(await service.placeSession(
    context.get("actor"),
    context.req.param("eventSlug"),
    parsed.data,
  )));
});

schedulingOrganizerRoutes.delete("/events/:eventSlug/agenda/placements/:sessionId", async (context) => {
  const parsed = z.uuid().safeParse(context.req.query("revisionId"));
  if (!parsed.success) return invalid(context, "invalid_revision", { revisionId: parsed.error.issues.map((issue) => issue.message) });
  if (!z.uuid().safeParse(context.req.param("sessionId")).success) {
    return invalid(context, "invalid_session", { sessionId: ["Choose a valid session."] });
  }
  return run(context, async (service) => context.json(await service.unplaceSession(
    context.get("actor"),
    context.req.param("eventSlug"),
    parsed.data,
    context.req.param("sessionId"),
  )));
});

schedulingOrganizerRoutes.get("/events/:eventSlug/agenda/placements/:sessionId/suggestions", async (context) => {
  const parsed = z.object({
    revisionId: z.uuid(),
    sessionId: z.uuid(),
  }).safeParse({
    revisionId: context.req.query("revisionId"),
    sessionId: context.req.param("sessionId"),
  });
  if (!parsed.success) return invalid(context, "invalid_suggestion_request", parsed.error.flatten().fieldErrors);
  return run(context, async (service) => context.json(await service.getPlacementSuggestions(
    context.get("actor"),
    context.req.param("eventSlug"),
    parsed.data.revisionId,
    parsed.data.sessionId,
  )));
});

schedulingOrganizerRoutes.post("/events/:eventSlug/agenda/auto-place", async (context) => {
  const parsed = z.object({ revisionId: z.uuid() }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_auto_place", parsed.error.flatten().fieldErrors);
  return run(context, async (service) => context.json(await service.autoPlace(
    context.get("actor"),
    context.req.param("eventSlug"),
    parsed.data.revisionId,
  )));
});

schedulingOrganizerRoutes.get("/events/:eventSlug/agenda/revisions/:revisionId/handoff", async (context) => {
  const revisionId = z.uuid().safeParse(context.req.param("revisionId"));
  if (!revisionId.success) return invalid(context, "invalid_revision", { revisionId: revisionId.error.issues.map((issue) => issue.message) });
  return run(context, async (service) => context.json(await service.getConflictFreeRevision(
    context.get("actor"), context.req.param("eventSlug"), revisionId.data,
  )));
});

function service(context: Context<SchedulingContext>) {
  if (!context.env.DATABASE_URL) throw new SchedulingHttpError("database_not_configured", "Database configuration is required.");
  return new SchedulingService(new SchedulingRepository(createDatabase(context.env.DATABASE_URL)));
}

async function run<T>(context: Context<SchedulingContext>, operation: (service: SchedulingService) => Promise<T>) {
  try {
    return await operation(service(context));
  } catch (error) {
    return schedulingError(context, error);
  }
}

function invalid(context: Context<SchedulingContext>, code: string, fields: Record<string, string[] | undefined>) {
  return context.json({ error: { code, message: "The scheduling command is invalid.", fields } }, 400);
}

function schedulingError(context: Context<SchedulingContext>, error: unknown) {
  if (error instanceof SchedulingHttpError) return context.json({ error: { code: error.code, message: error.message } }, 503);
  if (error instanceof SchedulingError) {
    const status = error.code === "forbidden" ? 403 : error.code === "revision_not_ready" ? 409 : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
  if (error instanceof SchedulingRepositoryError) {
    const status = error.code.endsWith("not_found") ? 404 : error.code === "room_overlap" || error.code === "revision_in_use" ? 409 : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
  throw error;
}

class SchedulingHttpError extends Error {
  constructor(readonly code: "database_not_configured", message: string) { super(message); }
}
