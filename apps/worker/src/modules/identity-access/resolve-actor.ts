import {
  cfpForms,
  createDatabase,
  eventMemberships,
  events,
  identities,
  people,
  personEmailAliases,
  rowsFromExecuteResult,
  type Database,
} from "@programflow/database";
import { handleAuthProxyRequest } from "@neondatabase/auth/server";
import { and, eq, sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Env } from "../../env";
import type { Actor, ActorContext } from "./actor";

const SessionUserSchema = z.object({ id: z.string(), email: z.email(), name: z.string().nullish() });
const AuthSessionSchema = z.object({
  session: z.object({ expiresAt: z.coerce.date() }),
  user: SessionUserSchema,
});
const SessionActorSchema = SessionUserSchema.extend({
  personId: z.string().uuid().nullable(),
  organizationRoles: z.array(z.object({
    organizationId: z.string().uuid(),
    role: z.literal("organizer"),
  })),
  eventRoles: z.array(z.object({
    eventId: z.string().uuid(),
    role: z.enum(["organizer", "speaker", "reviewer"]),
  })),
});
const actorCache = new Map<string, { actor: Actor; expiresAt: number }>();
const actorCacheTtlMs = 15_000;

export const resolveActor = createMiddleware<{ Bindings: Env } & ActorContext>(async (context, next) => {
  if (!context.env.NEON_AUTH_BASE_URL || !context.env.DATABASE_URL) {
    return context.json(
      { error: { code: "identity_not_configured", message: "Authentication and database configuration are required." } },
      503,
    );
  }

  const database = createDatabase(context.env.DATABASE_URL);
  const sessionToken = sessionTokenFromCookie(context.req.header("cookie"));
  if (!sessionToken) {
    return context.json({ error: { code: "unauthorized", message: "Sign in is required." } }, 401);
  }
  const cached = actorCache.get(sessionToken);
  if (cached && cached.expiresAt > Date.now()) {
    context.set("actor", cached.actor);
    await next();
    return;
  }
  actorCache.delete(sessionToken);
  const authenticatedUser = await sessionUserFromAuthProxy(
    context.req.raw,
    context.env.NEON_AUTH_BASE_URL,
    context.env.NEON_AUTH_COOKIE_SECRET,
  );
  if (!authenticatedUser) {
    return context.json({ error: { code: "unauthorized", message: "Sign in is required." } }, 401);
  }
  let session = await activeIdentityActor(database, authenticatedUser);
  if (!session) {
    session = {
      ...authenticatedUser,
      personId: null,
      organizationRoles: [],
      eventRoles: [],
    };
  }
  if (!session.personId) {
    const personId = await provisionFirstLogin(database, session, context.req.path);
    if (!personId) {
      return context.json(
        { error: { code: "identity_not_provisioned", message: "This identity has not been linked to a ProgramFlow person." } },
        403,
      );
    }
    session = await activeIdentityActor(database, authenticatedUser);
    if (!session?.personId) {
      return context.json(
        { error: { code: "identity_not_provisioned", message: "This identity has not been linked to a ProgramFlow person." } },
        403,
      );
    }
  }

  const actor: Actor = {
    identityId: session.id,
    personId: session.personId,
    organizationRoles: session.organizationRoles,
    eventRoles: session.eventRoles,
  };
  if (actor.organizationRoles.length > 0 || actor.eventRoles.length > 0) {
    actorCache.set(sessionToken, { actor, expiresAt: Date.now() + actorCacheTtlMs });
    if (actorCache.size > 500) {
      const oldest = actorCache.keys().next().value as string | undefined;
      if (oldest) actorCache.delete(oldest);
    }
  }
  context.set("actor", actor);
  await next();
});

async function activeIdentityActor(database: Database, user: z.infer<typeof SessionUserSchema>) {
  const result = await database.execute(sql`
    select
      ${user.id}::text as id,
      ${user.email}::text as email,
      ${user.name ?? null}::text as name,
      identity.person_id::text as "personId",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'organizationId', membership.organization_id::text,
          'role', membership.role
        ) order by membership.organization_id)
        from organization_memberships as membership
        where membership.person_id = identity.person_id
      ), '[]'::jsonb) as "organizationRoles",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'eventId', membership.event_id::text,
          'role', membership.role
        ) order by membership.event_id, membership.role)
        from event_memberships as membership
        where membership.person_id = identity.person_id
      ), '[]'::jsonb) as "eventRoles"
    from identities as identity
    where identity.provider = 'neon_auth'
      and identity.provider_subject = ${user.id}
    limit 1
  `);
  return SessionActorSchema.safeParse(rowsFromExecuteResult(result)[0]).data ?? null;
}

type AuthProxy = typeof handleAuthProxyRequest;

export async function sessionUserFromAuthProxy(
  request: Request,
  baseUrl: string,
  cookieSecret: string | undefined,
  proxy: AuthProxy = handleAuthProxyRequest,
): Promise<z.infer<typeof SessionUserSchema> | null> {
  if (!cookieSecret || !sessionTokenFromCookie(request.headers.get("cookie") ?? undefined)) return null;
  const response = await proxy({
    request: new Request(request.url, {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        origin: new URL(request.url).origin,
      },
    }),
    path: "get-session",
    baseUrl,
    cookieSecret,
    sameSite: "lax",
  });
  if (!response.ok) return null;
  const parsed = AuthSessionSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.session.expiresAt <= new Date()) return null;
  return parsed.data.user;
}

export function invalidateActorCache(cookieHeader: string | undefined) {
  const token = sessionTokenFromCookie(cookieHeader);
  if (token) actorCache.delete(token);
}

export function sessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  const encoded = cookieHeader?.split(";").map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("__Secure-neon-auth.session_token="))
    ?.slice("__Secure-neon-auth.session_token=".length);
  if (!encoded || encoded.length > 1024) return null;
  try {
    const token = decodeURIComponent(encoded).split(".", 1)[0]?.trim();
    return token && token.length >= 20 ? token : null;
  } catch {
    return null;
  }
}

export async function provisionFirstLogin(
  database: Database,
  user: z.infer<typeof SessionUserSchema>,
  requestPath: string,
): Promise<string | null> {
  const normalizedEmail = normalizeEmail(user.email);
  const [knownAlias] = await database.select({ personId: personEmailAliases.personId })
    .from(personEmailAliases).where(eq(personEmailAliases.normalizedEmail, normalizedEmail)).limit(1);
  if (knownAlias) return linkIdentity(database, knownAlias.personId, user.id);

  if (requestPath === "/api/v1/session" || requestPath === "/api/v1/onboarding") {
    return provisionAccount(database, user, normalizedEmail);
  }

  const eventSlug = speakerEnrollmentSlug(requestPath);
  if (!eventSlug) return null;
  const now = new Date();
  const forms = await database.select({
    eventId: events.id,
    status: cfpForms.status,
    opensAt: cfpForms.opensAt,
    closesAt: cfpForms.closesAt,
  }).from(cfpForms).innerJoin(events, eq(events.id, cfpForms.eventId)).where(eq(events.slug, eventSlug));
  const openForm = forms.find((form) => form.status === "published"
    && (!form.opensAt || form.opensAt <= now)
    && (!form.closesAt || form.closesAt >= now));
  if (!openForm) return null;

  return database.transaction(async (transaction) => {
    const [created] = await transaction.insert(people).values({
      stableKey: `neon-auth:${user.id}`,
      displayName: (user.name?.trim() || user.email.split("@")[0] || "Speaker").slice(0, 200),
      canonicalEmail: user.email,
    }).onConflictDoNothing({ target: people.canonicalEmail }).returning({ id: people.id });
    const [person] = created ? [created] : await transaction.select({ id: people.id })
      .from(people).where(eq(people.canonicalEmail, user.email)).limit(1);
    if (!person) return null;
    await transaction.insert(personEmailAliases).values({
      personId: person.id,
      email: user.email,
      normalizedEmail,
      isCanonical: true,
    }).onConflictDoNothing({ target: personEmailAliases.normalizedEmail });
    await transaction.insert(identities).values({
      personId: person.id,
      provider: "neon_auth",
      providerSubject: user.id,
    }).onConflictDoNothing();
    await transaction.insert(eventMemberships).values({
      eventId: openForm.eventId,
      personId: person.id,
      role: "speaker",
    }).onConflictDoNothing();
    return person.id;
  });
}

async function provisionAccount(
  database: Database,
  user: z.infer<typeof SessionUserSchema>,
  normalizedEmail: string,
): Promise<string | null> {
  return database.transaction(async (transaction) => {
    const [created] = await transaction.insert(people).values({
      stableKey: `neon-auth:${user.id}`,
      displayName: (user.name?.trim() || user.email.split("@")[0] || "Organizer").slice(0, 200),
      canonicalEmail: user.email,
    }).onConflictDoNothing({ target: people.canonicalEmail }).returning({ id: people.id });
    const [person] = created ? [created] : await transaction.select({ id: people.id })
      .from(people).where(eq(people.canonicalEmail, user.email)).limit(1);
    if (!person) return null;
    await transaction.insert(personEmailAliases).values({
      personId: person.id,
      email: user.email,
      normalizedEmail,
      isCanonical: true,
    }).onConflictDoNothing({ target: personEmailAliases.normalizedEmail });
    await transaction.insert(identities).values({
      personId: person.id,
      provider: "neon_auth",
      providerSubject: user.id,
    }).onConflictDoNothing();
    return person.id;
  });
}

async function linkIdentity(database: Database, personId: string, providerSubject: string): Promise<string | null> {
  await database.insert(identities).values({ personId, provider: "neon_auth", providerSubject }).onConflictDoNothing();
  const [linked] = await database.select({ personId: identities.personId }).from(identities)
    .where(and(eq(identities.provider, "neon_auth"), eq(identities.providerSubject, providerSubject))).limit(1);
  return linked?.personId === personId ? personId : null;
}

function speakerEnrollmentSlug(path: string): string | null {
  const encoded = /^\/api\/v1\/speaker\/events\/([^/]+)/.exec(path)?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}
