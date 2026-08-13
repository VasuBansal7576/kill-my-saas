import type { Database } from "@programflow/database";
import {
  eventFormats,
  eventMemberships,
  eventRooms,
  eventSpeakers,
  eventTracks,
  events,
  organizations,
  people,
  placements,
  publications,
  scheduleRevisions,
  sessions,
  sessionSpeakers,
} from "@programflow/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
import type { Actor } from "../identity-access/actor";
import { SchedulingRepository, SchedulingRepositoryError } from "./repository";
import { SchedulingService } from "./service";

const databaseUrl = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("scheduling persisted placement and conflict round trip", () => {
  const ids = {
    organization: crypto.randomUUID(),
    event: crypto.randomUUID(),
    organizer: crypto.randomUUID(),
    priya: crypto.randomUUID(),
    marcus: crypto.randomUUID(),
    track: crypto.randomUUID(),
    format: crypto.randomUUID(),
    main: crypto.randomUUID(),
    roomTwo: crypto.randomUUID(),
    priyaSpeaker: crypto.randomUUID(),
    marcusSpeaker: crypto.randomUUID(),
    sessionOne: crypto.randomUUID(),
    sessionTwo: crypto.randomUUID(),
    sessionThree: crypto.randomUUID(),
  };
  const slug = `scheduling-${ids.event}`;
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const service = new SchedulingService(new SchedulingRepository(database));
  const organizer: Actor = {
    identityId: `organizer-${ids.organizer}`,
    personId: ids.organizer,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `schedule-org-${ids.organization}`, name: "Schedule Test" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug,
      name: "Schedule Test",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
    });
    await tooling.database.insert(people).values([
      { id: ids.organizer, stableKey: `organizer-${ids.organizer}`, displayName: "Jordan Organizer" },
      { id: ids.priya, stableKey: `priya-${ids.priya}`, displayName: "Priya Raman" },
      { id: ids.marcus, stableKey: `marcus-${ids.marcus}`, displayName: "Marcus Okafor" },
    ]);
    await tooling.database.insert(eventMemberships).values({ eventId: ids.event, personId: ids.organizer, role: "organizer" });
    await tooling.database.insert(eventTracks).values({ id: ids.track, eventId: ids.event, name: "Platform", sortOrder: 0 });
    await tooling.database.insert(eventFormats).values({ id: ids.format, eventId: ids.event, name: "Talk", durationMinutes: 30, sortOrder: 0 });
    await tooling.database.insert(eventRooms).values([
      { id: ids.main, eventId: ids.event, name: "Main Stage", sortOrder: 0 },
      { id: ids.roomTwo, eventId: ids.event, name: "Room 2A", sortOrder: 1 },
    ]);
    await tooling.database.insert(eventSpeakers).values([
      { id: ids.priyaSpeaker, eventId: ids.event, personId: ids.priya },
      { id: ids.marcusSpeaker, eventId: ids.event, personId: ids.marcus },
    ]);
    await tooling.database.insert(sessions).values([
      { id: ids.sessionOne, eventId: ids.event, trackId: ids.track, formatId: ids.format, title: "Taming CI", contentStatus: "approved" },
      { id: ids.sessionTwo, eventId: ids.event, trackId: ids.track, formatId: ids.format, title: "Pair Programmer", contentStatus: "approved" },
      { id: ids.sessionThree, eventId: ids.event, trackId: ids.track, formatId: ids.format, title: "Stateful Edge", contentStatus: "approved" },
    ]);
    await tooling.database.insert(sessionSpeakers).values([
      { sessionId: ids.sessionOne, eventSpeakerId: ids.priyaSpeaker },
      { sessionId: ids.sessionTwo, eventSpeakerId: ids.priyaSpeaker },
      { sessionId: ids.sessionThree, eventSpeakerId: ids.marcusSpeaker },
    ]);
  });

  afterAll(async () => {
    await tooling.database.delete(publications).where(eq(publications.eventId, ids.event));
    const revisions = await tooling.database.select({ id: scheduleRevisions.id }).from(scheduleRevisions).where(eq(scheduleRevisions.eventId, ids.event));
    if (revisions.length) await tooling.database.delete(placements).where(inArray(placements.revisionId, revisions.map((revision) => revision.id)));
    await tooling.database.delete(scheduleRevisions).where(eq(scheduleRevisions.eventId, ids.event));
    await tooling.database.delete(sessionSpeakers).where(inArray(sessionSpeakers.sessionId, [ids.sessionOne, ids.sessionTwo, ids.sessionThree]));
    await tooling.database.delete(sessions).where(eq(sessions.eventId, ids.event));
    await tooling.database.delete(eventSpeakers).where(eq(eventSpeakers.eventId, ids.event));
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    await tooling.database.delete(eventTracks).where(eq(eventTracks.eventId, ids.event));
    await tooling.database.delete(eventFormats).where(eq(eventFormats.eventId, ids.event));
    await tooling.database.delete(eventRooms).where(eq(eventRooms.eventId, ids.event));
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(inArray(people.id, [ids.organizer, ids.priya, ids.marcus]));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("blocks room overlap, shows and clears speaker conflicts, auto-places, reloads, and protects a handed-off revision", async () => {
    const created = await service.createDraftRevision(organizer, slug);
    const revisionId = created.revision!.id;
    const place = (sessionId: string, roomId: string, startsAt: string, endsAt: string) => service.placeSession(organizer, slug, {
      eventId: ids.event,
      revisionId,
      sessionId,
      roomId,
      startsAt,
      endsAt,
    });
    await place(ids.sessionOne, ids.main, "2027-05-12T16:00:00.000Z", "2027-05-12T16:30:00.000Z");
    await expect(place(ids.sessionThree, ids.main, "2027-05-12T16:15:00.000Z", "2027-05-12T16:45:00.000Z"))
      .rejects.toMatchObject({ code: "room_overlap" } satisfies Partial<SchedulingRepositoryError>);

    const conflicted = await place(ids.sessionTwo, ids.roomTwo, "2027-05-12T16:00:00.000Z", "2027-05-12T16:30:00.000Z");
    expect(conflicted.conflicts).toMatchObject([{ type: "speaker_double_booking", speaker: { displayName: "Priya Raman" } }]);
    expect(conflicted.repairSuggestions.length).toBeGreaterThan(0);
    expect(conflicted.repairSuggestions.length).toBeLessThanOrEqual(4);
    const suggestion = conflicted.repairSuggestions.find((candidate) => candidate.sessionId === ids.sessionTwo)!;
    const resolved = await place(suggestion.sessionId, suggestion.roomId, suggestion.startsAt, suggestion.endsAt);
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.repairSuggestions).toEqual([]);

    const autoPlaced = await service.autoPlace(organizer, slug, revisionId);
    expect(autoPlaced.placedSessionIds).toEqual([ids.sessionThree]);
    expect(autoPlaced.workspace.readiness.ready).toBe(true);
    const reloaded = await new SchedulingService(new SchedulingRepository(database)).getWorkspace(organizer, slug, revisionId);
    expect(reloaded.sessions.filter((session) => session.placement)).toHaveLength(3);
    await expect(service.getConflictFreeRevision(organizer, slug, revisionId)).resolves.toMatchObject({ placementCount: 3 });

    await tooling.database.insert(publications).values({ eventId: ids.event, state: "live", scheduleRevisionId: revisionId, publicRevision: 1, liveAt: new Date() });
    await expect(place(ids.sessionOne, ids.main, "2027-05-13T16:00:00.000Z", "2027-05-13T16:30:00.000Z"))
      .rejects.toMatchObject({ code: "revision_in_use" } satisfies Partial<SchedulingRepositoryError>);
    const branched = await service.createDraftRevision(organizer, slug);
    expect(branched.revision).toMatchObject({ version: 2, inUse: false });
    expect(branched.sessions.filter((session) => session.placement)).toHaveLength(3);
  });
});
