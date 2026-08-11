import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { createToolingDatabase } from "../packages/database/src/tooling-client";
import {
  eventMemberships,
  events,
  organizationMemberships,
  organizations,
  people,
  personEmailAliases,
} from "../packages/database/src/schema";
import { applyPersonaEmailOverrides, normalizeEmail } from "../packages/testkit/src/evaluation-fixture";

const databaseUrl = process.env.DATABASE_URL;
const appEnvironment = process.env.APP_ENV;
const confirmation = process.env.EVALUATION_SEED_CONFIRM;

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!appEnvironment || !["local", "preview", "evaluation"].includes(appEnvironment)) {
  throw new Error("Evaluation seed is allowed only in local, preview, or evaluation environments.");
}
if (confirmation !== "DevFlow Conf 2027") {
  throw new Error("Set EVALUATION_SEED_CONFIRM=\"DevFlow Conf 2027\" to seed intentionally.");
}

const fixtureJson = JSON.parse(await readFile("docs/fixtures/evaluator-personas.json", "utf8")) as unknown;
const overrides = process.env.EVALUATOR_PERSONA_EMAILS_JSON
  ? JSON.parse(process.env.EVALUATOR_PERSONA_EMAILS_JSON) as Record<string, string>
  : {};
const fixture = applyPersonaEmailOverrides(fixtureJson, overrides);
const { database, close } = createToolingDatabase(databaseUrl);

const organizationId = deterministicUuid("fixture-organization-programflow");
const eventId = deterministicUuid("fixture-event-devflow-conf-2027");

await database.transaction(async (transaction) => {
  await transaction.insert(organizations).values({
    id: organizationId,
    slug: "programflow-evaluation",
    name: "ProgramFlow Evaluation",
  }).onConflictDoUpdate({
    target: organizations.slug,
    set: { name: "ProgramFlow Evaluation", updatedAt: new Date() },
  });

  await transaction.insert(events).values({
    id: eventId,
    organizationId,
    slug: "devflow-conf-2027",
    name: fixture.event.name,
    startsOn: fixture.event.starts_on,
    endsOn: fixture.event.ends_on,
    timezone: fixture.event.timezone,
    location: fixture.event.location,
  }).onConflictDoUpdate({
    target: [events.organizationId, events.slug],
    set: {
      name: fixture.event.name,
      startsOn: fixture.event.starts_on,
      endsOn: fixture.event.ends_on,
      timezone: fixture.event.timezone,
      location: fixture.event.location,
      updatedAt: new Date(),
    },
  });

  for (const persona of fixture.personas) {
    if (!persona.canonical_person_key) continue;
    const personId = deterministicUuid(persona.canonical_person_key);
    await transaction.insert(people).values({
      id: personId,
      stableKey: persona.canonical_person_key,
      displayName: persona.name,
      canonicalEmail: persona.canonical_email,
    }).onConflictDoUpdate({
      target: people.stableKey,
      set: { displayName: persona.name, canonicalEmail: persona.canonical_email, updatedAt: new Date() },
    });

    for (const [index, email] of [persona.canonical_email, ...persona.aliases].filter((value): value is string => Boolean(value)).entries()) {
      const normalizedEmail = normalizeEmail(email);
      await transaction.insert(personEmailAliases).values({
        id: deterministicUuid(`${persona.canonical_person_key}:email:${normalizedEmail}`),
        personId,
        email,
        normalizedEmail,
        isCanonical: index === 0,
      }).onConflictDoUpdate({
        target: personEmailAliases.normalizedEmail,
        set: { personId, email, isCanonical: index === 0, updatedAt: new Date() },
      });
    }

    for (const membership of persona.memberships) {
      if (membership.scope === "organization" && membership.role === "organizer") {
        await transaction.insert(organizationMemberships).values({
          id: deterministicUuid(`${persona.canonical_person_key}:organization:organizer`),
          organizationId,
          personId,
          role: "organizer",
        }).onConflictDoNothing();
      }
      if (membership.scope === "event") {
        await transaction.insert(eventMemberships).values({
          id: deterministicUuid(`${persona.canonical_person_key}:event:${membership.role}`),
          eventId,
          personId,
          role: membership.role,
        }).onConflictDoNothing();
      }
    }
  }
});

const [organization] = await database.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, "programflow-evaluation"));
const [event] = await database.select({ id: events.id }).from(events).where(and(eq(events.organizationId, organizationId), eq(events.slug, "devflow-conf-2027")));
if (!organization || !event) throw new Error("Evaluation seed verification failed.");
await close();

console.info(JSON.stringify({
  fixtureVersion: fixture.schema_version,
  organizationId: organization.id,
  eventId: event.id,
  personas: fixture.personas.filter((persona) => persona.canonical_person_key).length,
}));

function deterministicUuid(key: string): string {
  const hex = createHash("sha256").update(`programflow:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
