import {
  cfpForms,
  eventMemberships,
  events,
  identities,
  organizations,
  people,
  personEmailAliases,
  type Database,
} from "@programflow/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
import { provisionFirstLogin, sessionTokenFromCookie } from "./resolve-actor";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("first-login identity provisioning", () => {
  const ids = { organization: crypto.randomUUID(), event: crypto.randomUUID(), knownPerson: crypto.randomUUID() };
  const eventSlug = `identity-${ids.event}`;
  const knownEmail = `known-${ids.knownPerson}@example.com`;
  const newEmail = `new-${crypto.randomUUID()}@example.com`;
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `identity-${ids.organization}`, name: "Identity Test" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug: eventSlug,
      name: "Open CFP",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
    });
    await tooling.database.insert(cfpForms).values({ eventId: ids.event, name: "Talks", target: "session", status: "published" });
    await tooling.database.insert(people).values({ id: ids.knownPerson, stableKey: `known-${ids.knownPerson}`, displayName: "Known Reviewer", canonicalEmail: knownEmail });
    await tooling.database.insert(personEmailAliases).values({ personId: ids.knownPerson, email: knownEmail, normalizedEmail: knownEmail, isCanonical: true });
    await tooling.database.insert(eventMemberships).values({ eventId: ids.event, personId: ids.knownPerson, role: "reviewer" });
  });

  afterAll(async () => {
    const createdPeople = await tooling.database.select({ id: people.id }).from(people)
      .where(inArray(people.canonicalEmail, [knownEmail, newEmail]));
    const personIds = createdPeople.map((person) => person.id);
    if (personIds.length) {
      await tooling.database.delete(identities).where(inArray(identities.personId, personIds));
      await tooling.database.delete(eventMemberships).where(inArray(eventMemberships.personId, personIds));
      await tooling.database.delete(personEmailAliases).where(inArray(personEmailAliases.personId, personIds));
      await tooling.database.delete(people).where(inArray(people.id, personIds));
    }
    await tooling.database.delete(cfpForms).where(eq(cfpForms.eventId, ids.event));
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("links seeded personas and enrolls only new speakers through an open CFP", async () => {
    await expect(provisionFirstLogin(database, { id: "known-auth-subject", email: knownEmail, name: "Known Reviewer" }, "/api/v1/organizer/events/anything"))
      .resolves.toBe(ids.knownPerson);

    const newPersonId = await provisionFirstLogin(database, { id: "new-auth-subject", email: newEmail, name: "New Speaker" }, `/api/v1/speaker/events/${eventSlug}/submissions`);
    expect(newPersonId).toBeTruthy();
    const roles = await tooling.database.select({ role: eventMemberships.role }).from(eventMemberships)
      .where(eq(eventMemberships.personId, newPersonId!));
    expect(roles).toEqual([{ role: "speaker" }]);
  });
});

describe("session cookie parsing", () => {
  it("extracts only a well-formed Neon bearer token", () => {
    expect(sessionTokenFromCookie("theme=dark; __Secure-neon-auth.session_token=bearer-token-value-12345.signature"))
      .toBe("bearer-token-value-12345");
    expect(sessionTokenFromCookie("__Secure-neon-auth.session_token=short.signature")).toBeNull();
    expect(sessionTokenFromCookie("__Secure-neon-auth.session_token=%E0%A4%A")).toBeNull();
  });
});
