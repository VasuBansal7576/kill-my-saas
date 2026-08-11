import { randomUUID } from "node:crypto";
import type { Database } from "@programflow/database";
import {
  cfpForms,
  decisions,
  eventMemberships,
  eventSpeakers,
  events,
  organizations,
  outboxEvents,
  people,
  personEmailAliases,
  sessionSpeakers,
  sessions,
  sessionVersions,
  speakerProfiles,
  submissionParticipants,
  submissions,
  submissionVersions,
} from "@programflow/database";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AcceptanceError, decideSubmission } from "../../apps/worker/src/modules/program/acceptance";
import type { Actor } from "../../apps/worker/src/modules/identity-access/actor";
import { createToolingDatabase } from "../../packages/database/src/tooling-client";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("atomic acceptance handoff", () => {
  const ids = {
    organization: randomUUID(),
    event: randomUUID(),
    organizer: randomUUID(),
    form: randomUUID(),
    submission: randomUUID(),
  };
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const actor: Actor = {
    identityId: "acceptance-organizer",
    personId: ids.organizer,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };
  let createdSpeakerPersonId: string | null = null;

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `acceptance-${ids.organization}`, name: "Acceptance Test" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug: `acceptance-event-${ids.event}`,
      name: "Acceptance Event",
      startsOn: "2027-08-10",
      endsOn: "2027-08-12",
      timezone: "UTC",
      location: "Online",
    });
    await tooling.database.insert(people).values({ id: ids.organizer, stableKey: `organizer-${ids.organizer}`, displayName: "Organizer" });
    await tooling.database.insert(eventMemberships).values({ eventId: ids.event, personId: ids.organizer, role: "organizer" });
    await tooling.database.insert(cfpForms).values({ id: ids.form, eventId: ids.event, name: "CFP", target: "session", status: "published" });
    await tooling.database.insert(submissions).values({
      id: ids.submission,
      eventId: ids.event,
      formId: ids.form,
      title: "Reliable systems without re-entry",
      state: "submitted",
      submittedAt: new Date(),
    });
    await tooling.database.insert(submissionVersions).values({
      submissionId: ids.submission,
      version: 1,
      title: "Reliable systems without re-entry",
      answers: { abstract: "One canonical lifecycle from proposal to program." },
      createdByPersonId: ids.organizer,
    });
    await tooling.database.insert(submissionParticipants).values({
      submissionId: ids.submission,
      name: "Ada Speaker",
      email: `ada-${ids.submission}@example.test`,
      role: "presenter",
      sortOrder: 0,
    });
  });

  afterAll(async () => {
    const [decision] = await tooling.database.select({ id: decisions.id }).from(decisions).where(eq(decisions.submissionId, ids.submission));
    if (decision) await tooling.database.delete(outboxEvents).where(eq(outboxEvents.aggregateId, decision.id));
    const acceptedSessions = await tooling.database.select({ id: sessions.id }).from(sessions).where(eq(sessions.sourceSubmissionId, ids.submission));
    const sessionIds = acceptedSessions.map((session) => session.id);
    if (sessionIds.length) {
      await tooling.database.delete(sessionSpeakers).where(inArray(sessionSpeakers.sessionId, sessionIds));
      await tooling.database.delete(sessionVersions).where(inArray(sessionVersions.sessionId, sessionIds));
      await tooling.database.delete(sessions).where(inArray(sessions.id, sessionIds));
    }
    await tooling.database.delete(decisions).where(eq(decisions.submissionId, ids.submission));
    await tooling.database.delete(submissionParticipants).where(eq(submissionParticipants.submissionId, ids.submission));
    await tooling.database.delete(submissionVersions).where(eq(submissionVersions.submissionId, ids.submission));
    await tooling.database.delete(submissions).where(eq(submissions.id, ids.submission));
    await tooling.database.delete(cfpForms).where(eq(cfpForms.id, ids.form));
    if (createdSpeakerPersonId) {
      await tooling.database.delete(eventSpeakers).where(and(eq(eventSpeakers.eventId, ids.event), eq(eventSpeakers.personId, createdSpeakerPersonId)));
      await tooling.database.delete(speakerProfiles).where(eq(speakerProfiles.personId, createdSpeakerPersonId));
      await tooling.database.delete(eventMemberships).where(and(eq(eventMemberships.eventId, ids.event), eq(eventMemberships.personId, createdSpeakerPersonId)));
      await tooling.database.delete(personEmailAliases).where(eq(personEmailAliases.personId, createdSpeakerPersonId));
      await tooling.database.delete(people).where(eq(people.id, createdSpeakerPersonId));
    }
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(eq(people.id, ids.organizer));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("creates one linked program record and remains idempotent", async () => {
    const command = { submissionId: ids.submission, outcome: "accepted" as const, idempotencyKey: `accept-${ids.submission}` };
    const first = await decideSubmission(database, actor, command);
    const retry = await decideSubmission(database, actor, command);

    expect(retry).toEqual(first);
    expect(first.sessionId).not.toBeNull();
    expect(first.eventSpeakerIds).toHaveLength(1);

    const [session] = await tooling.database.select().from(sessions).where(eq(sessions.id, first.sessionId!));
    expect(session).toMatchObject({
      sourceSubmissionId: ids.submission,
      title: "Reliable systems without re-entry",
      abstract: "One canonical lifecycle from proposal to program.",
    });
    const [participant] = await tooling.database.select().from(submissionParticipants).where(eq(submissionParticipants.submissionId, ids.submission));
    createdSpeakerPersonId = participant?.personId ?? null;
    expect(createdSpeakerPersonId).not.toBeNull();

    await expect(decideSubmission(database, actor, {
      submissionId: ids.submission,
      outcome: "rejected",
      idempotencyKey: `reject-${ids.submission}`,
    })).rejects.toMatchObject<Partial<AcceptanceError>>({ code: "decision_conflict" });
  });
});
