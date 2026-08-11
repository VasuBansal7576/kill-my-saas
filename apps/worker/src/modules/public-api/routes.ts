import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import type { PublishedProgram } from "../publishing/contracts";
import { getPublishedProgram, PublishingError } from "../publishing/service";
import { AgendaQuerySchema, SessionListQuerySchema, SpeakerListQuerySchema } from "./contracts";
import { openApiDocument } from "./openapi";
import {
  agendaCollection,
  eventResource,
  PublicApiError,
  sessionCollection,
  sessionResource,
  speakerCollection,
  speakerResource,
} from "./service";

type PublicApiContext = { Bindings: Env };

export interface PublicApiDependencies {
  loadPublishedProgram(environment: Env, eventSlug: string): Promise<PublishedProgram>;
}

const defaultDependencies: PublicApiDependencies = {
  async loadPublishedProgram(environment, eventSlug) {
    if (!environment.DATABASE_URL) throw new PublicApiError("database_not_configured", "Database configuration is required.");
    return getPublishedProgram(createDatabase(environment.DATABASE_URL), eventSlug);
  },
};

export function createPublicApiRoutes(dependencies: PublicApiDependencies = defaultDependencies) {
  const routes = new Hono<PublicApiContext>();

  routes.get("/openapi.json", async (context) => cachedJson(context, openApiDocument, "public, max-age=3600, stale-while-revalidate=86400"));

  routes.get("/public/events/:eventSlug", (context) => run(context, dependencies, async (program) => {
    const base = `/api/v1/public/events/${encodeURIComponent(program.event.slug)}`;
    return {
      data: eventResource(program),
      links: { sessions: `${base}/sessions`, speakers: `${base}/speakers`, agenda: `${base}/agenda` },
    };
  }));

  routes.get("/public/events/:eventSlug/sessions", (context) => run(context, dependencies, async (program) => {
    const query = parseQuery(context, SessionListQuerySchema);
    return sessionCollection(program, query);
  }));

  routes.get("/public/events/:eventSlug/sessions/:sessionId", (context) => run(context, dependencies, async (program) => ({
    data: sessionResource(program, context.req.param("sessionId")),
  })));

  routes.get("/public/events/:eventSlug/speakers", (context) => run(context, dependencies, async (program) => {
    const query = parseQuery(context, SpeakerListQuerySchema);
    return speakerCollection(program, query);
  }));

  routes.get("/public/events/:eventSlug/speakers/:speakerId", (context) => run(context, dependencies, async (program) => ({
    data: speakerResource(program, context.req.param("speakerId")),
  })));

  routes.get("/public/events/:eventSlug/agenda", (context) => run(context, dependencies, async (program) => {
    const query = parseQuery(context, AgendaQuerySchema);
    return {
      ...agendaCollection(program, query),
      meta: { eventId: program.event.id, timezone: program.event.timezone, days: program.days },
    };
  }));

  return routes;
}

export const publicApiRoutes = createPublicApiRoutes();

async function run(
  context: Context<PublicApiContext>,
  dependencies: PublicApiDependencies,
  operation: (program: PublishedProgram) => Promise<unknown>,
) {
  try {
    const eventSlug = context.req.param("eventSlug");
    if (!eventSlug) {
      return context.json(
        { error: { code: "event_not_found", message: "Event not found." } },
        404,
        noStoreHeaders(),
      );
    }
    const program = await dependencies.loadPublishedProgram(context.env, eventSlug);
    return cachedJson(context, await operation(program), "public, max-age=30, stale-while-revalidate=60");
  } catch (error) {
    return publicApiError(context, error);
  }
}

function parseQuery<T>(context: Context<PublicApiContext>, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } } } }): T {
  const parsed = schema.safeParse(context.req.query());
  if (!parsed.success) throw new InvalidQueryError(parsed.error.flatten().fieldErrors);
  return parsed.data;
}

async function cachedJson(context: Context<PublicApiContext>, body: unknown, cacheControl: string) {
  const serialized = JSON.stringify(body);
  const etag = `"${await sha256(serialized)}"`;
  const headers = {
    etag,
    "cache-control": cacheControl,
    "content-type": "application/json; charset=UTF-8",
    "access-control-allow-origin": "*",
  };
  if (matchesIfNoneMatch(context.req.header("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return new Response(serialized, { status: 200, headers });
}

function publicApiError(context: Context<PublicApiContext>, error: unknown) {
  if (error instanceof InvalidQueryError) {
    return context.json({ error: { code: "invalid_query", message: "The public API query is invalid.", fields: error.fields } }, 400, noStoreHeaders());
  }
  if (error instanceof PublicApiError) {
    const status: 400 | 404 | 503 = error.code === "database_not_configured" ? 503 : error.code.endsWith("not_found") ? 404 : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status, noStoreHeaders());
  }
  if (error instanceof PublishingError) {
    const status: 400 | 404 | 409 = error.code === "event_not_found" ? 404 : error.code === "publication_not_live" ? 409 : 400;
    return context.json({ error: { code: error.code, message: error.message } }, status, noStoreHeaders());
  }
  throw error;
}

function noStoreHeaders() {
  return { "cache-control": "no-store", "access-control-allow-origin": "*" } as const;
}

function matchesIfNoneMatch(value: string | undefined, etag: string): boolean {
  if (!value) return false;
  return value.split(",").some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, "");
    return normalized === "*" || normalized === etag;
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

class InvalidQueryError extends Error {
  constructor(readonly fields: Record<string, string[] | undefined>) {
    super("The public API query is invalid.");
  }
}
