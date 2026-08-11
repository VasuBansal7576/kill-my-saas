import { createDatabase, eventMemberships, identities, organizationMemberships } from "@programflow/database";
import { handleAuthRequest } from "@neondatabase/auth/server";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Env } from "../../env";
import type { Actor, ActorContext, EventRole, OrganizationRole } from "./actor";

const SessionResponseSchema = z.union([
  z.object({ user: z.object({ id: z.string() }) }),
  z.object({ data: z.object({ user: z.object({ id: z.string() }) }) }),
]);

export const resolveActor = createMiddleware<{ Bindings: Env } & ActorContext>(async (context, next) => {
  if (!context.env.NEON_AUTH_BASE_URL || !context.env.DATABASE_URL) {
    return context.json(
      { error: { code: "identity_not_configured", message: "Authentication and database configuration are required." } },
      503,
    );
  }

  const sessionResponse = await handleAuthRequest(
    context.env.NEON_AUTH_BASE_URL,
    context.req.raw,
    "get-session",
  );
  if (!sessionResponse.ok) {
    return context.json({ error: { code: "unauthorized", message: "Sign in is required." } }, 401);
  }

  const parsed = SessionResponseSchema.safeParse(await sessionResponse.json());
  if (!parsed.success) {
    return context.json({ error: { code: "unauthorized", message: "The session is invalid or expired." } }, 401);
  }
  const providerSubject = "data" in parsed.data ? parsed.data.data.user.id : parsed.data.user.id;
  const database = createDatabase(context.env.DATABASE_URL);
  const [identity] = await database.select({ personId: identities.personId })
    .from(identities)
    .where(eq(identities.providerSubject, providerSubject))
    .limit(1);
  if (!identity) {
    return context.json(
      { error: { code: "identity_not_provisioned", message: "This identity has not been linked to a ProgramFlow person." } },
      403,
    );
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

