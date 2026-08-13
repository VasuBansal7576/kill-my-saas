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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
import { provisionFirstLogin, sessionTokenFromCookie, sessionUserFromAuthProxy } from "./resolve-actor";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("first-login identity provisioning", () => {
  const ids = { organization: crypto.randomUUID(), event: crypto.randomUUID(), knownPerson: crypto.randomUUID() };
  const eventSlug = `identity-${ids.event}`;
  const knownEmail = `known-${ids.knownPerson}@example.com`;
  const knownAliasEmail = `known-alias-${ids.knownPerson}@example.com`;
  const newEmail = `new-${crypto.randomUUID()}@example.com`;
  const organizerEmail = `organizer-${crypto.randomUUID()}@example.com`;
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
    await tooling.database.insert(personEmailAliases).values({ personId: ids.knownPerson, email: knownAliasEmail, normalizedEmail: knownAliasEmail, isCanonical: false });
    await tooling.database.insert(eventMemberships).values({ eventId: ids.event, personId: ids.knownPerson, role: "reviewer" });
  });

  afterAll(async () => {
    const createdPeople = await tooling.database.select({ id: people.id }).from(people)
      .where(inArray(people.canonicalEmail, [knownEmail, newEmail, organizerEmail]));
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
    await expect(provisionFirstLogin(database, { id: "known-alias-auth-subject", email: knownAliasEmail, name: "Known Reviewer" }, "/api/v1/reviewer/rounds/anything"))
      .resolves.toBe(ids.knownPerson);

    const knownRoles = await tooling.database.select({ role: eventMemberships.role }).from(eventMemberships)
      .where(eq(eventMemberships.personId, ids.knownPerson));
    expect(knownRoles).toEqual([{ role: "reviewer" }]);

    const newPersonId = await provisionFirstLogin(database, { id: "new-auth-subject", email: newEmail, name: "New Speaker" }, `/api/v1/speaker/events/${eventSlug}/submissions`);
    expect(newPersonId).toBeTruthy();
    const roles = await tooling.database.select({ role: eventMemberships.role }).from(eventMemberships)
      .where(eq(eventMemberships.personId, newPersonId!));
    expect(roles).toEqual([{ role: "speaker" }]);
  });

  it("provisions a real account before first-run workspace creation without granting a role", async () => {
    const personId = await provisionFirstLogin(database, {
      id: "new-organizer-auth-subject",
      email: organizerEmail,
      name: "New Organizer",
    }, "/api/v1/session");
    expect(personId).toBeTruthy();
    const roles = await tooling.database.select({ role: eventMemberships.role }).from(eventMemberships)
      .where(eq(eventMemberships.personId, personId!));
    expect(roles).toEqual([]);
  });
});

describe("session cookie parsing", () => {
  it("extracts only a well-formed Neon bearer token", () => {
    expect(sessionTokenFromCookie("theme=dark; __Secure-neon-auth.session_token=bearer-token-value-12345.signature"))
      .toBe("bearer-token-value-12345");
    expect(sessionTokenFromCookie("__Secure-neon-auth.session_token=short.signature")).toBeNull();
    expect(sessionTokenFromCookie("__Secure-neon-auth.session_token=%E0%A4%A")).toBeNull();
  });

  it("resolves the authenticated user through the configured auth service", async () => {
    const request = new Request("https://programflow.example/api/v1/session", {
      headers: { cookie: "__Secure-neon-auth.session_token=bearer-token-value-12345.signature" },
    });
    const proxy = vi.fn().mockResolvedValue(Response.json({
      session: {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      user: {
        id: "auth-user-1",
        email: "organizer@example.com",
        name: "Jordan Alvarez",
      },
    }));

    await expect(sessionUserFromAuthProxy(request, "https://auth.example.com", "x".repeat(32), proxy))
      .resolves.toEqual({ id: "auth-user-1", email: "organizer@example.com", name: "Jordan Alvarez" });
    expect(proxy).toHaveBeenCalledWith(expect.objectContaining({
      path: "get-session",
      baseUrl: "https://auth.example.com",
      cookieSecret: "x".repeat(32),
    }));
  });

  it("rejects missing, expired, and malformed auth sessions", async () => {
    const noCookie = new Request("https://programflow.example/api/v1/session");
    const proxy = vi.fn();
    await expect(sessionUserFromAuthProxy(noCookie, "https://auth.example.com", "x".repeat(32), proxy))
      .resolves.toBeNull();
    expect(proxy).not.toHaveBeenCalled();

    const request = new Request("https://programflow.example/api/v1/session", {
      headers: { cookie: "__Secure-neon-auth.session_token=bearer-token-value-12345.signature" },
    });
    proxy.mockResolvedValueOnce(Response.json({
      session: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
      user: { id: "auth-user-1", email: "organizer@example.com", name: "Jordan Alvarez" },
    })).mockResolvedValueOnce(Response.json({ nope: true }));
    await expect(sessionUserFromAuthProxy(request, "https://auth.example.com", "x".repeat(32), proxy))
      .resolves.toBeNull();
    await expect(sessionUserFromAuthProxy(request, "https://auth.example.com", "x".repeat(32), proxy))
      .resolves.toBeNull();
  });
});
