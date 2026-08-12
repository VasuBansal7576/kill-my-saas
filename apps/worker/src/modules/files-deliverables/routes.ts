import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import {
  CommentSchema,
  CreateFileRequestSchema,
  ProfileHeadshotUploadSchema,
  RequestBundleExportSchema,
  RestoreVersionSchema,
  ReviewDeliverableSchema,
  SessionApprovalSchema,
  UpdateSessionContentSchema,
  UpdateSpeakerContentSchema,
} from "./contracts";
import {
  FilesDeliverablesError,
  addFileComment,
  createFileRequest,
  downloadBundle,
  downloadVersion,
  downloadOwnHeadshot,
  finalizeUpload,
  getSessionContent,
  getSpeakerContent,
  listBundleExports,
  listOrganizerDeliverables,
  listOwnDeliverables,
  processBundleExport,
  requestBundleExport,
  requestUpload,
  requestProfileHeadshotUpload,
  restoreSessionVersion,
  restoreSpeakerVersion,
  reviewDeliverable,
  setSessionApproval,
  updateSessionContent,
  updateSpeakerContent,
  uploadQuarantineObject,
} from "./service";
import { NeonS3PrivateFileStore } from "./storage";

type FileContext = { Bindings: Env } & ActorContext;

export const filesDeliverablesOrganizerRoutes = new Hono<FileContext>();
export const filesDeliverablesSpeakerRoutes = new Hono<FileContext>();

filesDeliverablesOrganizerRoutes.get("/events/:eventSlug/files", handle(async (context, database) =>
  context.json(await listOrganizerDeliverables(database, context.get("actor"), parameter(context, "eventSlug")))));

filesDeliverablesOrganizerRoutes.post("/events/:eventSlug/file-requests", validated(CreateFileRequestSchema, async (context, database, input) =>
  context.json(await createFileRequest(database, context.get("actor"), parameter(context, "eventSlug"), input), 201)));

filesDeliverablesOrganizerRoutes.post("/events/:eventSlug/deliverables/:deliverableId/review", validated(ReviewDeliverableSchema, async (context, database, input) =>
  context.json(await reviewDeliverable(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "deliverableId"), input.status, input.reason))));

filesDeliverablesOrganizerRoutes.post("/events/:eventSlug/files/versions/:versionId/comments", validated(CommentSchema, async (context, database, input) =>
  context.json(await addFileComment(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "versionId"), input.body), 201)));

filesDeliverablesOrganizerRoutes.get("/events/:eventSlug/files/versions/:versionId/download", handle(async (context, database) =>
  downloadVersion(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "versionId"), storage(context))));

filesDeliverablesOrganizerRoutes.get("/events/:eventSlug/content/sessions/:sessionId", handle(async (context, database) =>
  context.json(await getSessionContent(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "sessionId")))));

filesDeliverablesOrganizerRoutes.put("/events/:eventSlug/content/sessions/:sessionId", validated(UpdateSessionContentSchema, async (context, database, input) =>
  context.json(await updateSessionContent(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "sessionId"), input))));

filesDeliverablesOrganizerRoutes.post("/events/:eventSlug/content/sessions/:sessionId/approval", validated(SessionApprovalSchema, async (context, database, input) =>
  context.json(await setSessionApproval(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "sessionId"), input.status, input.expectedRevision))));

filesDeliverablesOrganizerRoutes.post("/events/:eventSlug/content/sessions/:sessionId/versions/:version/restore", validated(RestoreVersionSchema, async (context, database, input) =>
  context.json(await restoreSessionVersion(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "sessionId"), Number(parameter(context, "version")), input.expectedRevision))));

filesDeliverablesOrganizerRoutes.get("/events/:eventSlug/content/speakers/:eventSpeakerId", handle(async (context, database) =>
  context.json(await getSpeakerContent(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "eventSpeakerId")))));

filesDeliverablesOrganizerRoutes.put("/events/:eventSlug/content/speakers/:eventSpeakerId", validated(UpdateSpeakerContentSchema, async (context, database, input) =>
  context.json(await updateSpeakerContent(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "eventSpeakerId"), input))));

filesDeliverablesOrganizerRoutes.post("/events/:eventSlug/content/speakers/:eventSpeakerId/versions/:version/restore", validated(RestoreVersionSchema, async (context, database, input) =>
  context.json(await restoreSpeakerVersion(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "eventSpeakerId"), Number(parameter(context, "version")), input.expectedRevision))));

filesDeliverablesOrganizerRoutes.get("/events/:eventSlug/file-exports", handle(async (context, database) =>
  context.json(await listBundleExports(database, context.get("actor"), parameter(context, "eventSlug")))));

filesDeliverablesOrganizerRoutes.post("/events/:eventSlug/file-exports", validated(RequestBundleExportSchema, async (context, database, input) => {
  const fileStore = storage(context);
  const record = await requestBundleExport(database, context.get("actor"), parameter(context, "eventSlug"), input.deliverableIds, input.grouping, fileStore);
  if (record.status === "pending") context.executionCtx.waitUntil(processBundleExport(database, record.id, fileStore));
  return context.json(record, 202);
}));

filesDeliverablesOrganizerRoutes.get("/events/:eventSlug/file-exports/:exportId/download", handle(async (context, database) =>
  downloadBundle(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "exportId"), storage(context))));

filesDeliverablesOrganizerRoutes.post("/files/uploads", handle(async (context, database) =>
  context.json(await requestUpload(database, context.get("actor"), await context.req.json().catch(() => null), storage(context)), 201)));

filesDeliverablesOrganizerRoutes.put("/files/uploads/:authorizationId/content", handle(async (context, database) =>
  context.json(await uploadQuarantineObject(database, context.get("actor"), parameter(context, "authorizationId"), context.req.raw.body, storage(context)))));

filesDeliverablesOrganizerRoutes.post("/files/uploads/:authorizationId/finalize", handle(async (context, database) =>
  context.json(await finalizeUpload(database, context.get("actor"), parameter(context, "authorizationId"), storage(context)))));

filesDeliverablesSpeakerRoutes.get("/events/:eventSlug/files", handle(async (context, database) =>
  context.json(await listOwnDeliverables(database, context.get("actor"), parameter(context, "eventSlug")))));

filesDeliverablesSpeakerRoutes.post("/events/:eventSlug/profile/headshot-uploads", validated(ProfileHeadshotUploadSchema, async (context, database, input) =>
  context.json(await requestProfileHeadshotUpload(database, context.get("actor"), parameter(context, "eventSlug"), input, storage(context)), 201)));

filesDeliverablesSpeakerRoutes.get("/events/:eventSlug/profile/headshot", handle(async (context, database) =>
  downloadOwnHeadshot(database, context.get("actor"), parameter(context, "eventSlug"), storage(context))));

filesDeliverablesSpeakerRoutes.post("/files/uploads", handle(async (context, database) =>
  context.json(await requestUpload(database, context.get("actor"), await context.req.json().catch(() => null), storage(context)), 201)));

filesDeliverablesSpeakerRoutes.put("/files/uploads/:authorizationId/content", handle(async (context, database) =>
  context.json(await uploadQuarantineObject(database, context.get("actor"), parameter(context, "authorizationId"), context.req.raw.body, storage(context)))));

filesDeliverablesSpeakerRoutes.post("/files/uploads/:authorizationId/finalize", handle(async (context, database) =>
  context.json(await finalizeUpload(database, context.get("actor"), parameter(context, "authorizationId"), storage(context)))));

filesDeliverablesSpeakerRoutes.post("/events/:eventSlug/files/versions/:versionId/comments", validated(CommentSchema, async (context, database, input) =>
  context.json(await addFileComment(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "versionId"), input.body), 201)));

filesDeliverablesSpeakerRoutes.get("/events/:eventSlug/files/versions/:versionId/download", handle(async (context, database) =>
  downloadVersion(database, context.get("actor"), parameter(context, "eventSlug"), parameter(context, "versionId"), storage(context))));

function handle(handler: (context: Context<FileContext>, database: ReturnType<typeof createDatabase>) => Promise<Response>) {
  return async (context: Context<FileContext>) => {
    const database = configuredDatabase(context);
    if (database instanceof Response) return database;
    try { return await handler(context, database); }
    catch (error) { return fileError(context, error); }
  };
}

function validated<TSchema extends z.ZodType>(schema: TSchema, handler: (context: Context<FileContext>, database: ReturnType<typeof createDatabase>, input: z.output<TSchema>) => Promise<Response>) {
  return handle(async (context, database) => {
    const parsed = schema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: { code: "invalid_request", message: "The request is invalid.", fields: parsed.error.flatten().fieldErrors } }, 400);
    return handler(context, database, parsed.data);
  });
}

function configuredDatabase(context: Context<FileContext>) {
  if (!context.env.DATABASE_URL) return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  return createDatabase(context.env.DATABASE_URL);
}

function parameter(context: Context<FileContext>, name: string): string {
  const value = context.req.param(name);
  if (!value) throw new FilesDeliverablesError("invalid_file", `Missing route parameter: ${name}.`);
  return value;
}

function storage(context: Context<FileContext>) {
  return new NeonS3PrivateFileStore(context.env);
}

function fileError(context: Context<FileContext>, error: unknown) {
  if (error instanceof z.ZodError) return context.json({ error: { code: "invalid_request", message: "The request is invalid.", fields: error.flatten().fieldErrors } }, 400);
  if (!(error instanceof FilesDeliverablesError)) throw error;
  const status = error.code === "forbidden" ? 403
    : ["event_not_found", "file_not_found", "task_not_found"].includes(error.code) ? 404
      : error.code === "conflict" ? 409
        : error.code === "storage_unavailable" ? 503 : 400;
  return context.json({ error: { code: error.code, message: error.message } }, status);
}
