import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import {
  AddSpeakerInputSchema,
  CompleteSpeakerTaskInputSchema,
  CreateSpeakerTaskInputSchema,
  ImportSpeakersInputSchema,
  RosterQuerySchema,
  SaveSpeakerResourceInputSchema,
  UpdateAssignmentDueDateInputSchema,
  UpdateSpeakerInputSchema,
  UpdateSpeakerStatusInputSchema,
} from "./contracts";
import {
  SpeakerOperationsError,
  addSpeaker,
  completeOwnSpeakerTask,
  createSpeakerTask,
  getSpeakerDetail,
  getSpeakerPortal,
  getSpeakerTasksWorkspace,
  importSpeakers,
  listSpeakerResources,
  listSpeakerRoster,
  saveSpeakerResource,
  updateAssignmentDueDate,
  updateOwnSpeakerProfile,
  updateSpeaker,
  updateSpeakerStatus,
} from "./service";

type SpeakerContext = { Bindings: Env } & ActorContext;

export const speakerOperationsOrganizerRoutes = new Hono<SpeakerContext>();
export const speakerOperationsPortalRoutes = new Hono<SpeakerContext>();

speakerOperationsOrganizerRoutes.get("/events/:eventSlug/speakers", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const query = RosterQuerySchema.safeParse({
    search: context.req.query("search"),
    status: context.req.query("status"),
    taskStatus: context.req.query("taskStatus"),
  });
  if (!query.success) return invalid(context, "invalid_roster_filter", query.error.flatten().fieldErrors);
  try {
    return context.json(await listSpeakerRoster(database, context.get("actor"), context.req.param("eventSlug"), query.data));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.post("/events/:eventSlug/speakers", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = AddSpeakerInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_speaker", input.error.flatten().fieldErrors);
  try {
    return context.json(await addSpeaker(database, context.get("actor"), context.req.param("eventSlug"), input.data), 201);
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.post("/events/:eventSlug/speakers/import", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = ImportSpeakersInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_speaker_import", input.error.flatten().fieldErrors);
  try {
    return context.json(await importSpeakers(database, context.get("actor"), context.req.param("eventSlug"), input.data.csv));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.get("/events/:eventSlug/speakers/:eventSpeakerId", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  try {
    return context.json(await getSpeakerDetail(database, context.get("actor"), context.req.param("eventSlug"), context.req.param("eventSpeakerId")));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.patch("/events/:eventSlug/speakers/:eventSpeakerId", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = UpdateSpeakerInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_speaker", input.error.flatten().fieldErrors);
  try {
    return context.json(await updateSpeaker(database, context.get("actor"), context.req.param("eventSlug"), context.req.param("eventSpeakerId"), input.data));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.patch("/events/:eventSlug/speakers/:eventSpeakerId/status", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = UpdateSpeakerStatusInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_speaker_status", input.error.flatten().fieldErrors);
  try {
    return context.json(await updateSpeakerStatus(database, context.get("actor"), context.req.param("eventSlug"), context.req.param("eventSpeakerId"), input.data.status));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.get("/events/:eventSlug/tasks", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  try {
    return context.json(await getSpeakerTasksWorkspace(database, context.get("actor"), context.req.param("eventSlug")));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.post("/events/:eventSlug/tasks", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = CreateSpeakerTaskInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_speaker_task", input.error.flatten().fieldErrors);
  try {
    return context.json(await createSpeakerTask(database, context.get("actor"), context.req.param("eventSlug"), input.data), 201);
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.patch("/events/:eventSlug/task-assignments/:assignmentId/due-date", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = UpdateAssignmentDueDateInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_due_date", input.error.flatten().fieldErrors);
  try {
    return context.json(await updateAssignmentDueDate(database, context.get("actor"), context.req.param("eventSlug"), context.req.param("assignmentId"), input.data.dueAt));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.get("/events/:eventSlug/resources", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  try {
    return context.json(await listSpeakerResources(database, context.get("actor"), context.req.param("eventSlug")));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsOrganizerRoutes.put("/events/:eventSlug/resources/:resourceSlug", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const body = await context.req.json().catch(() => null);
  const input = SaveSpeakerResourceInputSchema.safeParse(
    typeof body === "object" && body !== null ? { ...body, slug: context.req.param("resourceSlug") } : body,
  );
  if (!input.success) return invalid(context, "invalid_speaker_resource", input.error.flatten().fieldErrors);
  try {
    return context.json(await saveSpeakerResource(database, context.get("actor"), context.req.param("eventSlug"), input.data));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsPortalRoutes.get("/events/:eventSlug", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  try {
    return context.json(await getSpeakerPortal(database, context.get("actor"), context.req.param("eventSlug")));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsPortalRoutes.patch("/events/:eventSlug/profile", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = UpdateSpeakerInputSchema.omit({ logistics: true }).safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_speaker_profile", input.error.flatten().fieldErrors);
  try {
    return context.json(await updateOwnSpeakerProfile(database, context.get("actor"), context.req.param("eventSlug"), input.data));
  } catch (error) {
    return speakerError(context, error);
  }
});

speakerOperationsPortalRoutes.post("/events/:eventSlug/task-assignments/:assignmentId/complete", async (context) => {
  const database = configuredDatabase(context);
  if (database instanceof Response) return database;
  const input = CompleteSpeakerTaskInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_task_response", input.error.flatten().fieldErrors);
  try {
    return context.json(await completeOwnSpeakerTask(database, context.get("actor"), context.req.param("eventSlug"), context.req.param("assignmentId"), input.data.response));
  } catch (error) {
    return speakerError(context, error);
  }
});

function configuredDatabase(context: Context<SpeakerContext>) {
  if (!context.env.DATABASE_URL) {
    return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  }
  return createDatabase(context.env.DATABASE_URL);
}

function invalid(context: Context<SpeakerContext>, code: string, fields: Record<string, string[] | undefined>) {
  return context.json({ error: { code, message: "The request is invalid.", fields } }, 400);
}

function speakerError(context: Context<SpeakerContext>, error: unknown) {
  if (!(error instanceof SpeakerOperationsError)) throw error;
  const status = error.code === "event_not_found" || error.code === "speaker_not_found" || error.code === "task_not_found"
    ? 404
    : error.code === "forbidden"
      ? 403
      : error.code === "conflict"
        ? 409
        : 400;
  return context.json({ error: { code: error.code, message: error.message } }, status);
}
