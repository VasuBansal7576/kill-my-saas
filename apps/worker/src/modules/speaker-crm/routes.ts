import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import {
  AddCrmNoteSchema,
  CreateCrmContactSchema,
  CreateCrmOutreachHandoffSchema,
  CrmDirectoryFilterSchema,
  ImportCrmCsvSchema,
  MergeCrmContactsSchema,
  MoveCrmPipelineContactSchema,
  PushCrmContactToEventCommandSchema,
  SaveCrmSegmentSchema,
  UpdateCrmContactSchema,
} from "./contracts";
import {
  SpeakerCrmError,
  addCrmContactNote,
  createCrmContact,
  createCrmOutreachHandoff,
  enrollCrmContact,
  getCrmContact,
  getCrmMetrics,
  getCrmPipeline,
  importCrmContacts,
  listCrmDirectory,
  listCrmSegments,
  listDuplicateCandidates,
  listOrganizationEvents,
  mergeCrmContacts,
  moveCrmPipelineContact,
  openCrmSegment,
  pushCrmContactToEvent,
  saveCrmSegment,
  updateCrmContact,
} from "./service";

type CrmContext = { Bindings: Env } & ActorContext;
export const speakerCrmRoutes = new Hono<CrmContext>();

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/contacts", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const filters = CrmDirectoryFilterSchema.safeParse({
    search: context.req.query("search"),
    company: context.req.query("company"),
    jobTitle: context.req.query("jobTitle"),
    tag: context.req.query("tag"),
    companies: splitQuery(context.req.query("companies")),
    jobTitles: splitQuery(context.req.query("jobTitles")),
    tags: splitQuery(context.req.query("tags")),
    metadata: parseMetadata(context.req.query("metadata")),
  });
  if (!filters.success) return invalid(context, "invalid_crm_filters", filters.error.flatten().fieldErrors);
  try { return context.json(await listCrmDirectory(database, context.get("actor"), organizationId(context), filters.data)); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/contacts", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = CreateCrmContactSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_contact", input.error.flatten().fieldErrors);
  try { return context.json(await createCrmContact(database, context.get("actor"), organizationId(context), input.data), 201); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/import", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = ImportCrmCsvSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_import", input.error.flatten().fieldErrors);
  try { return context.json(await importCrmContacts(database, context.get("actor"), organizationId(context), input.data.csv)); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/contacts/:contactId", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await getCrmContact(database, context.get("actor"), organizationId(context), context.req.param("contactId"))); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.patch("/organizations/:organizationId/speaker-crm/contacts/:contactId", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = UpdateCrmContactSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_contact", input.error.flatten().fieldErrors);
  try { return context.json(await updateCrmContact(database, context.get("actor"), organizationId(context), context.req.param("contactId"), input.data)); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/contacts/:contactId/notes", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = AddCrmNoteSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_note", input.error.flatten().fieldErrors);
  try { return context.json(await addCrmContactNote(database, context.get("actor"), organizationId(context), context.req.param("contactId"), input.data.body), 201); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/duplicates", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await listDuplicateCandidates(database, context.get("actor"), organizationId(context))); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/merge", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = MergeCrmContactsSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_merge", input.error.flatten().fieldErrors);
  try { return context.json(await mergeCrmContacts(database, context.get("actor"), organizationId(context), input.data)); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/segments", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await listCrmSegments(database, context.get("actor"), organizationId(context))); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/segments", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = SaveCrmSegmentSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_segment", input.error.flatten().fieldErrors);
  try { return context.json(await saveCrmSegment(database, context.get("actor"), organizationId(context), input.data), 201); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/segments/:segmentId", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await openCrmSegment(database, context.get("actor"), organizationId(context), context.req.param("segmentId"))); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/pipeline", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await getCrmPipeline(database, context.get("actor"), organizationId(context))); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/pipeline/:contactId/enroll", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await enrollCrmContact(database, context.get("actor"), organizationId(context), context.req.param("contactId")), 201); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/pipeline/:contactId/move", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = MoveCrmPipelineContactSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_pipeline_move", input.error.flatten().fieldErrors);
  try { return context.json(await moveCrmPipelineContact(database, context.get("actor"), organizationId(context), context.req.param("contactId"), input.data.stageId, input.data.note)); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/events", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await listOrganizationEvents(database, context.get("actor"), organizationId(context))); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/push-to-event", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = PushCrmContactToEventCommandSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_event_handoff", input.error.flatten().fieldErrors);
  if (input.data.organizationId !== organizationId(context)) return context.json({ error: { code: "organization_mismatch", message: "Route and command organization must match." } }, 400);
  try { return context.json(await pushCrmContactToEvent(database, context.get("actor"), input.data), 201); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.post("/organizations/:organizationId/speaker-crm/outreach-handoffs", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  const input = CreateCrmOutreachHandoffSchema.safeParse(await context.req.json().catch(() => null));
  if (!input.success) return invalid(context, "invalid_crm_outreach", input.error.flatten().fieldErrors);
  try { return context.json(await createCrmOutreachHandoff(database, context.get("actor"), organizationId(context), input.data), 202); }
  catch (error) { return crmError(context, error); }
});

speakerCrmRoutes.get("/organizations/:organizationId/speaker-crm/metrics", async (context) => {
  const database = configuredDatabase(context); if (database instanceof Response) return database;
  try { return context.json(await getCrmMetrics(database, context.get("actor"), organizationId(context))); }
  catch (error) { return crmError(context, error); }
});

function organizationId(context: Context<CrmContext>): string {
  const value = context.req.param("organizationId");
  if (!value) throw new SpeakerCrmError("invalid_contact", "Organization ID is required.");
  return value;
}
function configuredDatabase(context: Context<CrmContext>) {
  if (!context.env.DATABASE_URL) return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  return createDatabase(context.env.DATABASE_URL);
}
function invalid(context: Context<CrmContext>, code: string, fields: Record<string, string[] | undefined>) { return context.json({ error: { code, message: "The request is invalid.", fields } }, 400); }
function crmError(context: Context<CrmContext>, error: unknown) {
  if (!(error instanceof SpeakerCrmError)) throw error;
  const status = error.code === "forbidden" ? 403 : error.code.endsWith("not_found") ? 404 : error.code === "conflict" ? 409 : 400;
  return context.json({ error: { code: error.code, message: error.message } }, status);
}
function splitQuery(value: string | undefined) { return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? []; }
function parseMetadata(value: string | undefined) {
  if (!value) return {};
  try { const parsed: unknown = JSON.parse(value); return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}
