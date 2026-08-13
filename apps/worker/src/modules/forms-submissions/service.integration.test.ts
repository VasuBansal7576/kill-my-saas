import type { Database } from "@programflow/database";
import {
  cfpForms,
  decisions,
  eventFormats,
  eventMemberships,
  eventTracks,
  events,
  organizations,
  outboxEvents,
  people,
  sessions,
  submissions,
} from "@programflow/database";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
import type { Actor } from "../identity-access/actor";
import type { FormConfigurationInput } from "./domain";
import {
  closeForm,
  createForm,
  createManualSubmission,
  createSpeakerSubmission,
  FormsSubmissionsError,
  getPublicForm,
  listOrganizerSubmissions,
  listSpeakerSubmissions,
  publishForm,
  updateSpeakerSubmission,
} from "./service";

const databaseUrl = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("forms and submissions persistence", () => {
  const ids = {
    organization: crypto.randomUUID(),
    event: crypto.randomUUID(),
    organizer: crypto.randomUUID(),
    speaker: crypto.randomUUID(),
  };
  const eventSlug = `forms-${ids.event}`;
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const organizer: Actor = {
    identityId: "forms-organizer",
    personId: ids.organizer,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };
  const speaker: Actor = {
    identityId: "forms-speaker",
    personId: ids.speaker,
    organizationRoles: [],
    eventRoles: [{ eventId: ids.event, role: "speaker" }],
  };
  const createdSubmissionIds: string[] = [];

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `forms-${ids.organization}`, name: "Forms Integration" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug: eventSlug,
      name: "Forms Conf",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
    });
    await tooling.database.insert(people).values([
      { id: ids.organizer, stableKey: `organizer-${ids.organizer}`, displayName: "Jordan Organizer", canonicalEmail: `organizer-${ids.organizer}@example.com` },
      { id: ids.speaker, stableKey: `speaker-${ids.speaker}`, displayName: "Priya Speaker", canonicalEmail: `speaker-${ids.speaker}@example.com` },
    ]);
    await tooling.database.insert(eventMemberships).values([
      { eventId: ids.event, personId: ids.organizer, role: "organizer" },
      { eventId: ids.event, personId: ids.speaker, role: "speaker" },
    ]);
    await tooling.database.insert(eventTracks).values({ eventId: ids.event, name: "Platform", sortOrder: 0 });
    await tooling.database.insert(eventFormats).values({ eventId: ids.event, name: "Talk", durationMinutes: 30, sortOrder: 0 });
  });

  afterAll(async () => {
    if (createdSubmissionIds.length > 0) {
      await tooling.database.delete(sessions).where(inArray(sessions.sourceSubmissionId, createdSubmissionIds));
      await tooling.database.delete(decisions).where(inArray(decisions.submissionId, createdSubmissionIds));
      await tooling.database.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, createdSubmissionIds));
      await tooling.database.delete(submissions).where(inArray(submissions.id, createdSubmissionIds));
    }
    await tooling.database.delete(cfpForms).where(eq(cfpForms.eventId, ids.event));
    await tooling.database.delete(eventTracks).where(eq(eventTracks.eventId, ids.event));
    await tooling.database.delete(eventFormats).where(eq(eventFormats.eventId, ids.event));
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(inArray(people.id, [ids.organizer, ids.speaker]));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("publishes an immutable form, resumes a draft, persists participants, and hands submitted state to Reviews", async () => {
    const formInput: FormConfigurationInput = {
      name: "Forms Conf CFP",
      target: "abstract",
      opensAt: "2027-01-01T00:00:00.000Z",
      closesAt: "2027-02-01T00:00:00.000Z",
      welcomeCopy: "Welcome",
      instructionsCopy: "Be specific",
      successCopy: "Received",
      allowDrafts: true,
      allowMultipleDrafts: true,
      draftsCountTowardLimit: false,
      allowSubmittedEdits: true,
      confirmationEmailEnabled: true,
      draftReminderEnabled: true,
      draftReminderLeadHours: 48,
      maxSubmissionsPerPerson: 3,
      minimumParticipants: 1,
      maximumParticipants: 4,
      participantRoleLabels: { author: "Primary author", co_author: "Co-author", presenter: "Presenter" },
      fields: [
        { key: "abstract", label: "Abstract", type: "long_text", required: true, settings: {}, condition: null },
        { key: "track", label: "Track", type: "select", required: true, settings: { catalog: "track", routeByValue: { Platform: "platform-reviewers" } }, condition: null },
        { key: "format", label: "Format", type: "select", required: true, settings: { catalog: "format" }, condition: null },
      ],
    };
    const workspace = await createForm(database, organizer, eventSlug, formInput);
    const formId = workspace.form!.id;
    await publishForm(database, organizer, eventSlug, formId);

    const publicForm = await getPublicForm(database, eventSlug, new Date("2027-01-15T00:00:00.000Z"));
    expect(publicForm.form.version).toBe(1);
    expect(publicForm.form.definition.fields.map((field) => field.key)).toEqual(["abstract", "track", "format"]);

    const draft = await createSpeakerSubmission(database, speaker, eventSlug, formId, {
      title: "Durable proposal",
      answers: {},
      participants: [],
      saveAsDraft: true,
    }, new Date("2027-01-15T00:00:00.000Z"));
    createdSubmissionIds.push(draft.id);
    expect(draft.state).toBe("draft");

    const submitted = await updateSpeakerSubmission(database, speaker, eventSlug, draft.id, {
      title: "Durable proposal, revised",
      answers: { abstract: "A real persisted workflow.", track: "Platform", format: "Talk (30 min)" },
      participants: [
        { name: "Priya Speaker", email: `speaker-${ids.speaker}@example.com`, role: "author" },
        { name: "Pat Coauthor", email: `coauthor-${ids.speaker}@example.com`, role: "co_author" },
      ],
      saveAsDraft: false,
    }, new Date("2027-01-16T00:00:00.000Z"));
    expect(submitted).toMatchObject({ state: "submitted", version: 2, routingKey: "platform-reviewers" });
    expect(submitted.participants.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: "Priya Speaker", role: "author" },
      { name: "Pat Coauthor", role: "co_author" },
    ]);

    const organizerInbox = await listOrganizerSubmissions(database, organizer, eventSlug);
    expect(organizerInbox[0]).toMatchObject({ id: draft.id, title: "Durable proposal, revised", state: "submitted" });
    await tooling.database.insert(decisions).values({
      submissionId: draft.id,
      outcome: "accepted",
      reason: "Strong fit",
      idempotencyKey: `forms-decision-${ids.event}`,
      decidedByPersonId: ids.organizer,
      releasedByPersonId: ids.organizer,
      releasedAt: new Date("2027-01-16T01:00:00.000Z"),
    });
    const [acceptedSession] = await tooling.database.insert(sessions).values({
      eventId: ids.event,
      sourceSubmissionId: draft.id,
      title: "Durable proposal, revised",
      abstract: "A real persisted workflow.",
    }).returning({ id: sessions.id, title: sessions.title });
    expect(acceptedSession).toBeDefined();
    const speakerProjection = await listSpeakerSubmissions(database, speaker, eventSlug);
    expect(speakerProjection[0]).toMatchObject({
      id: draft.id,
      decision: "accepted",
      acceptedSession: { id: acceptedSession!.id, title: "Durable proposal, revised" },
    });
    const [confirmation] = await tooling.database.select().from(outboxEvents).where(and(
      eq(outboxEvents.aggregateId, draft.id),
      eq(outboxEvents.eventType, "submission.confirmation_requested"),
    ));
    expect(confirmation?.eventType).toBe("submission.confirmation_requested");

    const manual = await createManualSubmission(database, organizer, eventSlug, formId, {
      title: "Organizer-entered abstract",
      answers: { abstract: "Entered from an offline application.", track: "Platform", format: "Talk (30 min)" },
      participants: [{ name: "Offline Speaker", email: `offline-${ids.event}@example.com`, role: "author" }],
      saveAsDraft: false,
    }, new Date("2027-01-16T12:00:00.000Z"));
    createdSubmissionIds.push(manual.id);
    expect(manual).toMatchObject({ state: "submitted", routingKey: "platform-reviewers" });
    const [manualEvidence] = await tooling.database.select().from(outboxEvents).where(and(
      eq(outboxEvents.aggregateId, manual.id),
      eq(outboxEvents.eventType, "submission.manually_entered"),
    ));
    expect(manualEvidence?.payload).toMatchObject({ submissionId: manual.id, eventId: ids.event });

    await closeForm(database, organizer, eventSlug, formId);
    await expect(updateSpeakerSubmission(database, speaker, eventSlug, draft.id, {
      title: "Locked edit",
      answers: submitted.answers,
      participants: submitted.participants.map(({ name, email, role }) => ({ name, email, role })),
      saveAsDraft: false,
    }, new Date("2027-01-17T00:00:00.000Z"))).rejects.toMatchObject({ code: "editing_locked" } satisfies Partial<FormsSubmissionsError>);
  });
});
