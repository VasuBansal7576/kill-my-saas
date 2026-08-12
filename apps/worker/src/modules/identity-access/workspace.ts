import { EventSetupInputSchema, WorkspaceSetupInputSchema, type EventSetupInput } from "@programflow/contracts";
import {
  createDatabase,
  eventFormats,
  eventMemberships,
  eventRooms,
  events,
  eventTracks,
  organizationMemberships,
  organizations,
} from "@programflow/database";
import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import type { ActorContext } from "./actor";

export const workspaceRoutes = new Hono<{ Bindings: Env } & ActorContext>();

workspaceRoutes.post("/onboarding", async (context) => {
  const parsed = WorkspaceSetupInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, parsed.error.flatten().fieldErrors);
  const actor = context.get("actor");
  if (actor.organizationRoles.length) {
    return context.json({ error: { code: "workspace_exists", message: "This account already belongs to an organization." } }, 409);
  }

  try {
    const database = createDatabase(context.env.DATABASE_URL!);
    const result = await database.transaction(async (transaction) => {
      const [organization] = await transaction.insert(organizations).values(parsed.data.organization).returning();
      if (!organization) throw new Error("Organization creation did not return a record.");
      const event = await insertEvent(transaction, organization.id, parsed.data.event);
      await transaction.insert(organizationMemberships).values({
        organizationId: organization.id,
        personId: actor.personId,
        role: "organizer",
      });
      await transaction.insert(eventMemberships).values({ eventId: event.id, personId: actor.personId, role: "organizer" });
      return { organization, event };
    });
    return context.json({ ...result, recommendedPath: `/organizer/events/${result.event.slug}/dashboard` }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return slugConflict(context);
    throw error;
  }
});

workspaceRoutes.post("/organizer/organizations/:organizationId/events", async (context) => {
  const parsed = EventSetupInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, parsed.error.flatten().fieldErrors);
  const actor = context.get("actor");
  const organizationId = context.req.param("organizationId");
  if (!actor.organizationRoles.some((membership) => membership.organizationId === organizationId && membership.role === "organizer")) {
    return context.json({ error: { code: "forbidden", message: "Organizer access is required for this organization." } }, 403);
  }

  try {
    const database = createDatabase(context.env.DATABASE_URL!);
    const event = await database.transaction(async (transaction) => {
      const [organization] = await transaction.select({ id: organizations.id }).from(organizations)
        .where(and(eq(organizations.id, organizationId))).limit(1);
      if (!organization) return null;
      const created = await insertEvent(transaction, organizationId, parsed.data);
      await transaction.insert(eventMemberships).values({ eventId: created.id, personId: actor.personId, role: "organizer" });
      return created;
    });
    if (!event) return context.json({ error: { code: "organization_not_found", message: "Organization not found." } }, 404);
    return context.json({ event, recommendedPath: `/organizer/events/${event.slug}/dashboard` }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return slugConflict(context);
    throw error;
  }
});

async function insertEvent(
  transaction: Parameters<Parameters<ReturnType<typeof createDatabase>["transaction"]>[0]>[0],
  organizationId: string,
  input: EventSetupInput,
) {
  const [event] = await transaction.insert(events).values({
    organizationId,
    slug: input.slug,
    name: input.name,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    timezone: input.timezone,
    location: input.location,
    branding: { primaryColor: input.primaryColor },
  }).returning();
  if (!event) throw new Error("Event creation did not return a record.");
  await transaction.insert(eventTracks).values({ eventId: event.id, name: "General", sortOrder: 0 });
  await transaction.insert(eventFormats).values({ eventId: event.id, name: "Talk", durationMinutes: 30, sortOrder: 0 });
  await transaction.insert(eventRooms).values({ eventId: event.id, name: "Main Stage", sortOrder: 0 });
  return event;
}

function invalid(context: Context, fields: unknown) {
  return context.json({ error: { code: "invalid_workspace", message: "Workspace details are invalid.", fields } }, 400);
}

function slugConflict(context: Context) {
  return context.json({ error: { code: "slug_taken", message: "That organization or event URL is already in use." } }, 409);
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && current !== null && "code" in current && current.code === "23505") return true;
    current = typeof current === "object" && current !== null && "cause" in current ? current.cause : null;
  }
  return false;
}
