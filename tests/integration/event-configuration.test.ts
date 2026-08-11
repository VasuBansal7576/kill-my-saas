import { randomUUID } from "node:crypto";
import type { EventConfigurationInput } from "@programflow/contracts";
import type { Database } from "@programflow/database";
import { eventMemberships, eventFormats, eventRooms, events, eventTracks, organizations, people } from "@programflow/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEventConfiguration, updateEventConfiguration } from "../../apps/worker/src/modules/event-configuration/service";
import type { Actor } from "../../apps/worker/src/modules/identity-access/actor";
import { createToolingDatabase } from "../../packages/database/src/tooling-client";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("event configuration persistence", () => {
  const ids = { organization: randomUUID(), event: randomUUID(), person: randomUUID() };
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const actor: Actor = {
    identityId: "integration-organizer",
    personId: ids.person,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `integration-${ids.organization}`, name: "Integration Test" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug: `event-${ids.event}`,
      name: "Before",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
    });
    await tooling.database.insert(people).values({ id: ids.person, stableKey: `person-${ids.person}`, displayName: "Test Organizer" });
    await tooling.database.insert(eventMemberships).values({ eventId: ids.event, personId: ids.person, role: "organizer" });
  });

  afterAll(async () => {
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    await tooling.database.delete(eventTracks).where(eq(eventTracks.eventId, ids.event));
    await tooling.database.delete(eventFormats).where(eq(eventFormats.eventId, ids.event));
    await tooling.database.delete(eventRooms).where(eq(eventRooms.eventId, ids.event));
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(eq(people.id, ids.person));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("round-trips event settings and ordered catalogs", async () => {
    const input: EventConfigurationInput = {
      name: "DevFlow Integration",
      startsOn: "2027-06-01",
      endsOn: "2027-06-03",
      timezone: "America/New_York",
      location: "Javits Center",
      primaryColor: "#6c94f9",
      tracks: ["Platform", "AI"],
      formats: [{ name: "Talk", durationMinutes: 30 }, { name: "Workshop", durationMinutes: 120 }],
      rooms: ["Main", "Lab"],
    };

    await updateEventConfiguration(database, actor, `event-${ids.event}`, input);
    const persisted = await getEventConfiguration(database, actor, `event-${ids.event}`);
    expect(persisted).toMatchObject(input);
  });
});

