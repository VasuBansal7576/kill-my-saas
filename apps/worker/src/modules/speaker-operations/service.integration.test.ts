import type { Database } from "@programflow/database";
import {
  eventMemberships,
  eventSpeakers,
  events,
  organizations,
  people,
  personEmailAliases,
  sessions,
  sessionSpeakers,
  speakerProfiles,
  speakerResources,
  speakerTaskAssignments,
  speakerTasks,
} from "@programflow/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
import type { Actor } from "../identity-access/actor";
import {
  SpeakerOperationsError,
  addSpeaker,
  completeOwnSpeakerTask,
  createSpeakerTask,
  getSpeakerPortal,
  listSpeakerRoster,
  saveSpeakerResource,
  updateOwnSpeakerProfile,
  updateSpeakerStatus,
} from "./service";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("speaker operations persisted role round trip", () => {
  const ids = { organization: crypto.randomUUID(), event: crypto.randomUUID(), organizer: crypto.randomUUID() };
  const slug = `speaker-operations-${ids.event}`;
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const organizer: Actor = {
    identityId: `organizer-${ids.organizer}`,
    personId: ids.organizer,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };
  const createdPersonIds: string[] = [];

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `speaker-org-${ids.organization}`, name: "Speaker Test" });
    await tooling.database.insert(events).values({
      id: ids.event, organizationId: ids.organization, slug, name: "Speaker Operations Test", startsOn: "2027-05-12", endsOn: "2027-05-14", timezone: "America/Los_Angeles", location: "San Francisco",
    });
    await tooling.database.insert(people).values({ id: ids.organizer, stableKey: `organizer-${ids.organizer}`, displayName: "Test Organizer" });
    await tooling.database.insert(eventMemberships).values({ eventId: ids.event, personId: ids.organizer, role: "organizer" });
  });

  afterAll(async () => {
    const speakers = await tooling.database.select({ id: eventSpeakers.id, personId: eventSpeakers.personId }).from(eventSpeakers).where(eq(eventSpeakers.eventId, ids.event));
    const speakerIds = speakers.map((speaker) => speaker.id);
    createdPersonIds.push(...speakers.map((speaker) => speaker.personId));
    const eventSessions = await tooling.database.select({ id: sessions.id }).from(sessions).where(eq(sessions.eventId, ids.event));
    if (speakerIds.length) await tooling.database.delete(speakerTaskAssignments).where(inArray(speakerTaskAssignments.eventSpeakerId, speakerIds));
    if (eventSessions.length) await tooling.database.delete(sessionSpeakers).where(inArray(sessionSpeakers.sessionId, eventSessions.map((session) => session.id)));
    await tooling.database.delete(speakerTasks).where(eq(speakerTasks.eventId, ids.event));
    await tooling.database.delete(speakerResources).where(eq(speakerResources.eventId, ids.event));
    await tooling.database.delete(sessions).where(eq(sessions.eventId, ids.event));
    await tooling.database.delete(eventSpeakers).where(eq(eventSpeakers.eventId, ids.event));
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    if (createdPersonIds.length) {
      await tooling.database.delete(speakerProfiles).where(inArray(speakerProfiles.personId, createdPersonIds));
      await tooling.database.delete(personEmailAliases).where(inArray(personEmailAliases.personId, createdPersonIds));
      await tooling.database.delete(people).where(inArray(people.id, createdPersonIds));
    }
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(eq(people.id, ids.organizer));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("persists explicit roster/task/profile/resource transitions and consumes a Program session handoff", async () => {
    const priya = await addSpeaker(database, organizer, slug, {
      displayName: "Priya Raman", email: `priya-${ids.event}@example.com`, jobTitle: "Principal Engineer", company: "Latticework Systems", biography: "Initial biography", socialLinks: {}, logistics: {},
    });
    const marcus = await addSpeaker(database, organizer, slug, {
      displayName: "Marcus Okafor", email: `marcus-${ids.event}@example.com`, jobTitle: "Staff Developer Advocate", company: "Cloudreach Labs", biography: "Initial biography", socialLinks: {}, logistics: {},
    });
    await updateSpeakerStatus(database, organizer, slug, priya.eventSpeakerId, "onboarding");
    const task = await createSpeakerTask(database, organizer, slug, {
      title: "Confirm participation", description: "Confirm attendance", kind: "action", required: true, dueAt: "2027-04-01T17:00:00.000Z", configuration: {}, eventSpeakerIds: [priya.eventSpeakerId, marcus.eventSpeakerId], idempotencyKey: `task-${ids.event}`,
    });
    expect(task.assignments).toHaveLength(2);
    expect((await createSpeakerTask(database, organizer, slug, {
      title: "Confirm participation", description: "Confirm attendance", kind: "action", required: true, dueAt: "2027-04-01T17:00:00.000Z", configuration: {}, eventSpeakerIds: [priya.eventSpeakerId, marcus.eventSpeakerId], idempotencyKey: `task-${ids.event}`,
    })).id).toBe(task.id);

    const [session] = await tooling.database.insert(sessions).values({ eventId: ids.event, title: "Taming 40-Minute CI", abstract: "Incremental builds", contentStatus: "approved" }).returning({ id: sessions.id });
    if (!session) throw new Error("Session fixture was not created.");
    await tooling.database.insert(sessionSpeakers).values({ sessionId: session.id, eventSpeakerId: priya.eventSpeakerId, role: "speaker" });
    await saveSpeakerResource(database, organizer, slug, {
      slug: "speaker-handbook", title: "Speaker handbook", summary: "Arrival and AV", contentHtml: '<script>bad()</script><h2>Welcome</h2><iframe src="https://scheduler.example.com/book"></iframe>', status: "published", visibleToStatuses: ["invited", "onboarding", "ready"], allowedEmbedOrigins: ["https://scheduler.example.com"],
    });

    const priyaActor: Actor = { identityId: "priya", personId: priya.personId, organizationRoles: [], eventRoles: [{ eventId: ids.event, role: "speaker" }] };
    const marcusActor: Actor = { identityId: "marcus", personId: marcus.personId, organizationRoles: [], eventRoles: [{ eventId: ids.event, role: "speaker" }] };
    const assignment = task.assignments.find((candidate) => candidate.eventSpeakerId === priya.eventSpeakerId);
    if (!assignment) throw new Error("Priya assignment fixture was not created.");
    await updateOwnSpeakerProfile(database, priyaActor, slug, { biography: "SBEK-PORTAL-BIO-01", socialLinks: { linkedin: "https://example.com/priya" } });
    await completeOwnSpeakerTask(database, priyaActor, slug, assignment.id, null);

    const portal = await getSpeakerPortal(database, priyaActor, slug);
    expect(portal.speaker.biography).toContain("SBEK-PORTAL-BIO-01");
    expect(portal.speaker.assignedSessions.map((candidate) => candidate.title)).toEqual(["Taming 40-Minute CI"]);
    expect(portal.speaker.tasks).toMatchObject([{ status: "complete", title: "Confirm participation" }]);
    expect(portal.resources[0]?.contentHtml).toContain('sandbox="allow-forms allow-popups allow-same-origin"');
    expect(portal.resources[0]?.contentHtml).not.toContain("script");
    expect(JSON.stringify(portal)).not.toContain("Marcus Okafor");

    await expect(completeOwnSpeakerTask(database, marcusActor, slug, assignment.id, null))
      .rejects.toMatchObject({ code: "task_not_found" } satisfies Partial<SpeakerOperationsError>);
    const progress = await listSpeakerRoster(database, organizer, slug, { search: "Priya", taskStatus: "all" });
    expect(progress).toMatchObject([{ displayName: "Priya Raman", status: "onboarding", taskProgress: { complete: 1, total: 1 } }]);
  });
});
