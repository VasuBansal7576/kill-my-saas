import {
  cfpForms,
  createDatabase,
  eventMemberships,
  events,
  identities,
  organizationMemberships,
  people,
  personEmailAliases,
  type Database,
} from "@programflow/database";
import { and, eq, sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Env } from "../../env";
import type { Actor, ActorContext, EventRole, OrganizationRole } from "./actor";

const SessionUserSchema = z.object({ id: z.string(), email: z.email(), name: z.string().optional() });

export const resolveActor = createMiddleware<{ Bindings: Env } & ActorContext>(async (context, next) => {
  if (!context.env.NEON_AUTH_BASE_URL || !context.env.DATABASE_URL) {
    return context.json(
      { error: { code: "identity_not_configured", message: "Authentication and database configuration are required." } },
      503,
    );
  }

  const database = createDatabase(context.env.DATABASE_URL);
  const user = await activeSessionUser(database, context.req.header("cookie"));
  if (!user) {
    return context.json({ error: { code: "unauthorized", message: "Sign in is required." } }, 401);
  }
  const providerSubject = user.id;
  let [identity] = await database.select({ personId: identities.personId })
    .from(identities)
    .where(eq(identities.providerSubject, providerSubject))
    .limit(1);
  if (!identity) {
    const personId = await provisionFirstLogin(database, user, context.req.path);
    if (!personId) {
      return context.json(
        { error: { code: "identity_not_provisioned", message: "This identity has not been linked to a ProgramFlow person." } },
        403,
      );
    }
    identity = { personId };
  }

  const [organizationRows, eventRows] = await Promise.all([
    database.select({ organizationId: organizationMemberships.organizationId, role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.personId, identity.personId)),
    database.select({ eventId: eventMemberships.eventId, role: eventMemberships.role })
      .from(eventMemberships)
      .where(eq(eventMemberships.personId, identity.personId)),
  ]);
  const actor: Actor = {
    identityId: providerSubject,
    personId: identity.personId,
    organizationRoles: organizationRows.map((row) => ({ ...row, role: row.role as OrganizationRole })),
    eventRoles: eventRows.map((row) => ({ ...row, role: row.role as EventRole })),
  };
  context.set("actor", actor);
  await next();
});

async function activeSessionUser(database: Database, cookieHeader: string | undefined) {
  const token = sessionTokenFromCookie(cookieHeader);
  if (!token) return null;
  const result = await database.execute(sql`
    select auth_user.id::text as id, auth_user.email, auth_user.name
    from neon_auth.session as auth_session
    inner join neon_auth.user as auth_user on auth_user.id = auth_session."userId"
    where auth_session.token = ${token}
      and auth_session."expiresAt" > now()
      and coalesce(auth_user.banned, false) = false
    limit 1
  `);
  return SessionUserSchema.safeParse(result.rows[0]).data ?? null;
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
