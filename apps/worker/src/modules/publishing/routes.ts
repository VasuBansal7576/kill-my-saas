import {
  EmbedOutputFormatSchema,
  PublishProgramCommandSchema,
} from "@programflow/contracts";
import { createDatabase, type Database } from "@programflow/database";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { NeonS3PrivateFileStore } from "../files-deliverables/storage";
import { SchedulingRepository, SchedulingService } from "../scheduling";
import {
  PausePublicationSchema,
  PublicProgramQuerySchema,
  SaveWidgetConfigurationSchema,
} from "./contracts";
import { PublicationRuleError } from "./rules";
import { serializeBasicHtml, serializeCalendar, serializeStyledHtml, serializeXml } from "./serializers";
import {
  addItinerarySession,
  getPublishedProgram,
  getPublishingWorkspace,
  getPublicHeadshot,
  getWidgetConfiguration,
  pausePublication,
  PublishingError,
  publishProgram,
  removeItinerarySession,
  resolveItinerary,
  saveWidgetConfiguration,
} from "./service";

type OrganizerPublishingContext = { Bindings: Env } & ActorContext;
type PublicPublishingContext = { Bindings: Env };

export const publishingOrganizerRoutes = new Hono<OrganizerPublishingContext>();
export const publishingPublicRoutes = new Hono<PublicPublishingContext>();

publishingOrganizerRoutes.get("/events/:eventSlug/publish", async (context) => organizerRun(context, async (database) => {
  const workspace = await getPublishingWorkspace(database, context.get("actor"), context.req.param("eventSlug"));
  return context.json({
    ...workspace,
    widgets: workspace.widgets.map((widget) => widgetWithUrls(context, context.req.param("eventSlug"), widget)),
  });
}));

publishingOrganizerRoutes.post("/events/:eventSlug/publish", async (context) => {
  const parsed = PublishProgramCommandSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_publish_program", parsed.error.flatten().fieldErrors);
  return organizerRun(context, async (database) => {
    const scheduling = new SchedulingService(new SchedulingRepository(database));
    const handoff = await scheduling.getConflictFreeRevision(
      context.get("actor"),
      context.req.param("eventSlug"),
      parsed.data.scheduleRevisionId,
    );
    return context.json(await publishProgram(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      parsed.data,
      handoff,
    ));
  });
});

publishingOrganizerRoutes.post("/events/:eventSlug/publish/pause", async (context) => {
  const parsed = PausePublicationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_pause_publication", parsed.error.flatten().fieldErrors);
  return organizerRun(context, async (database) => context.json(await pausePublication(
    database,
    context.get("actor"),
    context.req.param("eventSlug"),
    parsed.data.idempotencyKey,
  )));
});

publishingOrganizerRoutes.put("/events/:eventSlug/publish/widgets/:widgetSlug", async (context) => {
  const parsed = SaveWidgetConfigurationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "invalid_widget_configuration", parsed.error.flatten().fieldErrors);
  if (parsed.data.slug !== context.req.param("widgetSlug")) {
    return context.json({ error: { code: "invalid_widget_configuration", message: "The route and configuration slugs must match." } }, 400);
  }
  return organizerRun(context, async (database) => {
    const widget = await saveWidgetConfiguration(database, context.get("actor"), context.req.param("eventSlug"), parsed.data);
    return context.json(widgetWithUrls(context, context.req.param("eventSlug"), widget));
  });
});

for (const suffix of ["", "/sessions", "/speakers", "/agenda", "/itinerary", "/gallery"] as const) {
  publishingPublicRoutes.get(`/:eventSlug${suffix}`, async (context) => publicRun(context, async (database) => {
    const parsed = PublicProgramQuerySchema.safeParse({
      search: context.req.query("search"),
      track: context.req.query("track"),
      format: context.req.query("format"),
      location: context.req.query("location"),
      day: context.req.query("day"),
    });
    if (!parsed.success) return invalid(context, "invalid_public_program_query", parsed.error.flatten().fieldErrors);
    return cachedProgramResponse(context, await getPublishedProgram(database, context.req.param("eventSlug"), parsed.data));
  }));
}

publishingPublicRoutes.get("/:eventSlug/speakers/:personId/headshot", async (context) => publicRun(context, async (database) => {
  const parsed = z.uuid().safeParse(context.req.param("personId"));
  if (!parsed.success) return context.json({ error: { code: "headshot_not_found", message: "Headshot not found." } }, 404);
  const file = await getPublicHeadshot(database, context.req.param("eventSlug"), parsed.data);
  const bytes = await new NeonS3PrivateFileStore(context.env).read(file.storageKey);
  if (!bytes) return context.json({ error: { code: "headshot_not_found", message: "Headshot not found." } }, 404);
  const headers = new Headers({
    "content-type": file.mediaType,
    "cache-control": "public, max-age=3600, immutable",
    etag: `"${file.checksumSha256}"`,
    "content-disposition": "inline",
  });
  return new Response(Uint8Array.from(bytes).buffer, { headers });
}));

publishingPublicRoutes.get("/:eventSlug/anonymous-itinerary", async (context) => publicRun(context, async (database) => {
  const itinerary = await resolveRequestItinerary(context, database);
  setItineraryCookie(context, itinerary.itineraryId);
  return context.json({
    selectedSessionIds: itinerary.selectedSessionIds,
    recoveryToken: itinerary.recoveryToken,
  });
}));

publishingPublicRoutes.put("/:eventSlug/anonymous-itinerary/sessions/:sessionId", async (context) => publicRun(context, async (database) => {
  const sessionId = z.uuid().safeParse(context.req.param("sessionId"));
  if (!sessionId.success) return invalid(context, "invalid_session", { sessionId: sessionId.error.issues.map((issue) => issue.message) });
  const itinerary = await resolveRequestItinerary(context, database);
  setItineraryCookie(context, itinerary.itineraryId);
  const updated = await addItinerarySession(database, context.req.param("eventSlug"), itinerary.itineraryId, sessionId.data);
  return context.json({ selectedSessionIds: updated.selectedSessionIds });
}));

publishingPublicRoutes.delete("/:eventSlug/anonymous-itinerary/sessions/:sessionId", async (context) => publicRun(context, async (database) => {
  const sessionId = z.uuid().safeParse(context.req.param("sessionId"));
  if (!sessionId.success) return invalid(context, "invalid_session", { sessionId: sessionId.error.issues.map((issue) => issue.message) });
  const itinerary = await resolveRequestItinerary(context, database);
  setItineraryCookie(context, itinerary.itineraryId);
  const updated = await removeItinerarySession(database, context.req.param("eventSlug"), itinerary.itineraryId, sessionId.data);
  return context.json({ selectedSessionIds: updated.selectedSessionIds });
}));

publishingPublicRoutes.get("/:eventSlug/anonymous-itinerary/calendar.ics", async (context) => publicRun(context, async (database) => {
  const itinerary = await resolveRequestItinerary(context, database);
  setItineraryCookie(context, itinerary.itineraryId);
  const program = await getPublishedProgram(database, context.req.param("eventSlug"));
  const selected = new Set(itinerary.selectedSessionIds);
  return new Response(serializeCalendar(program, program.sessions.filter((session) => selected.has(session.id))), {
    headers: downloadHeaders(`${program.event.slug}-my-schedule.ics`, "text/calendar; charset=utf-8"),
  });
}));

publishingPublicRoutes.get("/:eventSlug/embeds/:widgetSlug/:format", async (context) => publicRun(context, async (database) => {
  const format = EmbedOutputFormatSchema.safeParse(context.req.param("format"));
  if (!format.success) return context.json({ error: { code: "output_not_found", message: "That widget output format does not exist." } }, 404);
  const widget = await getWidgetConfiguration(database, context.req.param("eventSlug"), context.req.param("widgetSlug"));
  if (!widget.outputFormats.includes(format.data)) {
    return context.json({ error: { code: "output_not_enabled", message: "That output is not enabled for this widget." } }, 404);
  }
  const program = await getPublishedProgram(database, context.req.param("eventSlug"), {}, widget.slug);
  const presentation = { widgetType: widget.widgetType, branding: widget.branding, fields: widget.fields };
  if (format.data === "styled") return new Response(serializeStyledHtml(program, presentation), { headers: publicHeaders("text/html; charset=utf-8") });
  if (format.data === "basic") return new Response(serializeBasicHtml(program, presentation), { headers: publicHeaders("text/html; charset=utf-8") });
  if (format.data === "xml") return new Response(serializeXml(program), { headers: publicHeaders("application/xml; charset=utf-8") });
  if (format.data === "ical") {
    return new Response(serializeCalendar(program), { headers: downloadHeaders(`${program.event.slug}-${widget.slug}.ics`, "text/calendar; charset=utf-8") });
  }
  return new Response(JSON.stringify(program), { headers: publicHeaders("application/json; charset=utf-8") });
}));

function databaseFrom<T extends OrganizerPublishingContext | PublicPublishingContext>(context: Context<T>): Database {
  if (!context.env.DATABASE_URL) throw new PublishingHttpError("database_not_configured", "Database configuration is required.");
  return createDatabase(context.env.DATABASE_URL);
}

async function organizerRun(
  context: Context<OrganizerPublishingContext>,
  operation: (database: Database) => Promise<Response>,
) {
  try {
    return await operation(databaseFrom(context));
  } catch (error) {
    return publishingError(context, error);
  }
}

async function publicRun(
  context: Context<PublicPublishingContext>,
  operation: (database: Database) => Promise<Response>,
) {
  try {
    return await operation(databaseFrom(context));
  } catch (error) {
    return publishingError(context, error);
  }
}

async function resolveRequestItinerary(context: Context<PublicPublishingContext>, database: Database) {
  const cookie = getCookie(context, "programflow_itinerary");
  const itineraryId = cookie && z.uuid().safeParse(cookie).success ? cookie : undefined;
  const recoveryToken = context.req.header("x-itinerary-recovery");
  return resolveItinerary(database, context.req.param("eventSlug") ?? "", itineraryId, recoveryToken);
}

function setItineraryCookie(context: Context<PublicPublishingContext>, itineraryId: string): void {
  setCookie(context, "programflow_itinerary", itineraryId, {
    httpOnly: true,
    secure: new URL(context.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function widgetWithUrls(
  context: Context<OrganizerPublishingContext>,
  eventSlug: string,
  widget: Awaited<ReturnType<typeof saveWidgetConfiguration>>,
) {
  const origin = new URL(context.req.url).origin;
  const surface = widget.widgetType === "speaker_gallery" ? "speaker-gallery" : widget.widgetType;
  const publicUrl = `${origin}/program/${encodeURIComponent(eventSlug)}/${surface}`;
  const base = `${origin}/api/v1/public/program/${encodeURIComponent(eventSlug)}/embeds/${encodeURIComponent(widget.slug)}`;
  const styledUrl = `${base}/styled`;
  return {
    ...widget,
    publicUrl,
    styledIframeSnippet: `<iframe src="${styledUrl}" title="${escapeAttribute(widget.name)}" loading="lazy" style="width:100%;min-height:640px;border:0"></iframe>`,
    styledScriptSnippet: `<script>(function(){var f=document.createElement('iframe');f.src=${JSON.stringify(styledUrl)};f.title=${JSON.stringify(widget.name)};f.loading='lazy';f.style='width:100%;min-height:640px;border:0';document.currentScript.parentNode.insertBefore(f,document.currentScript)})()</script>`,
    outputUrls: Object.fromEntries(widget.outputFormats.map((format) => [format, `${base}/${format}`])),
  };
}

function cachedProgramResponse(context: Context<PublicPublishingContext>, program: Awaited<ReturnType<typeof getPublishedProgram>>) {
  const etag = `"program-${program.publication.id}-${program.publication.publicRevision}"`;
  if (context.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  return context.json(program, 200, {
    etag,
    "cache-control": "public, max-age=30, stale-while-revalidate=60",
    "access-control-allow-origin": "*",
  });
}

function publicHeaders(contentType: string): Headers {
  return new Headers({
    "content-type": contentType,
    "cache-control": "public, max-age=30, stale-while-revalidate=60",
    "access-control-allow-origin": "*",
  });
}

function downloadHeaders(filename: string, contentType: string): Headers {
  const headers = publicHeaders(contentType);
  headers.set("content-disposition", `attachment; filename="${filename.replaceAll('"', "")}"`);
  return headers;
}

function invalid<T extends OrganizerPublishingContext | PublicPublishingContext>(
  context: Context<T>,
  code: string,
  fields: Record<string, string[] | undefined>,
) {
  return context.json({ error: { code, message: "The publishing request is invalid.", fields } }, 400);
}

function publishingError<T extends OrganizerPublishingContext | PublicPublishingContext>(
  context: Context<T>,
  error: unknown,
) {
  if (error instanceof PublishingHttpError) return context.json({ error: { code: error.code, message: error.message } }, 503);
  if (error instanceof PublicationRuleError) return context.json({ error: { code: error.code, message: error.message } }, 409);
  if (error instanceof PublishingError) {
    const status = error.code === "forbidden"
      ? 403
      : error.code.endsWith("not_found") || error.code === "event_not_found"
        ? 404
        : error.code === "publication_not_live"
          ? 409
          : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
  throw error;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

class PublishingHttpError extends Error {
  constructor(readonly code: "database_not_configured", message: string) { super(message); }
}
