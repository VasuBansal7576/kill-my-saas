import type { Database } from "@programflow/database";
import {
  cfpForms,
  cfpFormVersions,
  decisions,
  deliverables,
  deliverableVersions,
  eventSpeakers,
  events,
  fileObjects,
  organizations,
  people,
  sessions,
  sessionSpeakers,
  submissions,
} from "@programflow/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../packages/database/src/tooling-client";
import {
  createFileRequest,
  downloadVersion,
  FilesDeliverablesError,
  listOrganizerDeliverables,
  listOwnDeliverables,
  requestUpload,
} from "./files-deliverables/service";
import type { PrivateFileStore, StoredObjectMetadata } from "./files-deliverables/storage";
import type { Actor } from "./identity-access/actor";
import { getSpeakerPortal } from "./speaker-operations/service";
import { queueDueTaskReminders } from "./communications/service";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("speaker session release privacy across operations and files", () => {
  const ids = {
    organization: crypto.randomUUID(),
    event: crypto.randomUUID(),
    organizer: crypto.randomUUID(),
    speaker: crypto.randomUUID(),
    otherSpeaker: crypto.randomUUID(),
  };
  const slug = `speaker-privacy-${ids.event}`;
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const organizer: Actor = {
    identityId: `organizer-${ids.organizer}`,
    personId: ids.organizer,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };
  const speaker: Actor = {
    identityId: `speaker-${ids.speaker}`,
    personId: ids.speaker,
    organizationRoles: [],
    eventRoles: [{ eventId: ids.event, role: "speaker" }],
  };
  const otherSpeaker: Actor = {
    identityId: `speaker-${ids.otherSpeaker}`,
    personId: ids.otherSpeaker,
    organizationRoles: [],
    eventRoles: [{ eventId: ids.event, role: "speaker" }],
  };
  const storage = new MemoryFileStore();

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `privacy-org-${ids.organization}`, name: "Privacy Test" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug,
      name: "Speaker Privacy Test",
      startsOn: "2027-08-12",
      endsOn: "2027-08-14",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
    });
    await tooling.database.insert(people).values([
      { id: ids.organizer, stableKey: `organizer-${ids.organizer}`, displayName: "Test Organizer" },
      { id: ids.speaker, stableKey: `speaker-${ids.speaker}`, displayName: "Marcus Test" },
      { id: ids.otherSpeaker, stableKey: `speaker-${ids.otherSpeaker}`, displayName: "Priya Test" },
    ]);
  });

  afterAll(async () => {
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(inArray(people.id, [ids.organizer, ids.speaker, ids.otherSpeaker]));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("reveals one accepted session, its task, and its file metadata only when the decision is released", async () => {
    const [form] = await tooling.database.insert(cfpForms).values({
      eventId: ids.event,
      name: "Private accepted proposal",
      target: "session",
      status: "published",
    }).returning({ id: cfpForms.id });
    if (!form) throw new Error("CFP form fixture was not created.");
    const [formVersion] = await tooling.database.insert(cfpFormVersions).values({
      formId: form.id,
      version: 1,
      definition: {
        target: "session",
        opensAt: null,
        closesAt: null,
        welcomeCopy: "",
        instructionsCopy: "",
        successCopy: "",
        allowDrafts: true,
        allowMultipleDrafts: true,
        draftsCountTowardLimit: false,
        allowSubmittedEdits: true,
        confirmationEmailEnabled: true,
        draftReminderEnabled: true,
        draftReminderLeadHours: 48,
        maxSubmissionsPerPerson: null,
        minimumParticipants: 1,
        maximumParticipants: 4,
        participantRoleLabels: { author: "Primary author", co_author: "Co-author", presenter: "Presenter" },
        fields: [],
      },
      publishedByPersonId: ids.organizer,
    }).returning({ id: cfpFormVersions.id });
    if (!formVersion) throw new Error("CFP form version fixture was not created.");
    const [submission] = await tooling.database.insert(submissions).values({
      eventId: ids.event,
      formId: form.id,
      formVersionId: formVersion.id,
      submitterPersonId: ids.speaker,
      title: "Lightning: Agents in Production Q&A",
      state: "submitted",
      submittedAt: new Date(),
    }).returning({ id: submissions.id });
    if (!submission) throw new Error("Submission fixture was not created.");
    const [decision] = await tooling.database.insert(decisions).values({
      submissionId: submission.id,
      outcome: "accepted",
      reason: "Accepted but private",
      idempotencyKey: `privacy-decision-${ids.event}`,
      decidedByPersonId: ids.organizer,
    }).returning({ id: decisions.id });
    if (!decision) throw new Error("Decision fixture was not created.");
    const eventSpeakerRows = await tooling.database.insert(eventSpeakers).values([
      { eventId: ids.event, personId: ids.speaker },
      { eventId: ids.event, personId: ids.otherSpeaker },
    ]).returning({ id: eventSpeakers.id, personId: eventSpeakers.personId });
    const eventSpeaker = eventSpeakerRows.find((row) => row.personId === ids.speaker);
    const unrelatedEventSpeaker = eventSpeakerRows.find((row) => row.personId === ids.otherSpeaker);
    if (!eventSpeaker || !unrelatedEventSpeaker) throw new Error("Speaker fixtures were not created.");
    const [session] = await tooling.database.insert(sessions).values({
      eventId: ids.event,
      sourceSubmissionId: submission.id,
      title: "Lightning: Agents in Production Q&A",
      abstract: "Private until the decision release.",
      contentStatus: "approved",
    }).returning({ id: sessions.id });
    if (!session) throw new Error("Session fixture was not created.");
    await tooling.database.insert(sessionSpeakers).values({ sessionId: session.id, eventSpeakerId: eventSpeaker.id, role: "speaker" });

    const [organizerDeliverable] = await createFileRequest(database, organizer, slug, {
      title: "Upload Session Presentation · Lightning: Agents in Production Q&A",
      instructions: "Upload the private session deck.",
      dueAt: "2027-08-01T17:00:00.000Z",
      eventSpeakerIds: [eventSpeaker.id],
      acceptedMediaTypes: ["application/pdf"],
      maxByteSize: 10 * 1024 * 1024,
      handoff: "session_file",
      idempotencyKey: `private-file-request-${ids.event}`,
    });
    if (!organizerDeliverable) throw new Error("Deliverable fixture was not created.");
    const storageKey = `events/${ids.event}/private/session-deck.pdf`;
    const [file] = await tooling.database.insert(fileObjects).values({
      eventId: ids.event,
      ownerPersonId: ids.speaker,
      storageKey,
      originalName: "agents-in-production.pdf",
      mediaType: "application/pdf",
      byteSize: 12,
      checksumSha256: "a".repeat(64),
      verificationStatus: "verified",
      verifiedAt: new Date(),
    }).returning({ id: fileObjects.id });
    if (!file) throw new Error("File fixture was not created.");
    const [version] = await tooling.database.insert(deliverableVersions).values({
      deliverableId: organizerDeliverable.id,
      version: 1,
      fileObjectId: file.id,
      uploadedByPersonId: ids.organizer,
    }).returning({ id: deliverableVersions.id });
    if (!version) throw new Error("File version fixture was not created.");
    await tooling.database.update(deliverables).set({ latestVersion: 1, status: "submitted" }).where(eq(deliverables.id, organizerDeliverable.id));
    storage.objects.set(storageKey, new TextEncoder().encode("private deck"));

    const beforeRelease = await getSpeakerPortal(database, speaker, slug);
    expect(beforeRelease.speaker).toMatchObject({ sessionCount: 0, taskProgress: { complete: 0, total: 0 } });
    expect(beforeRelease.speaker.assignedSessions).toEqual([]);
    expect(beforeRelease.speaker.tasks).toEqual([]);
    expect(await listOwnDeliverables(database, speaker, slug)).toEqual([]);
    expect(await listOwnDeliverables(database, otherSpeaker, slug)).toEqual([]);
    expect(await listOrganizerDeliverables(database, organizer, slug)).toMatchObject([{
      taskTitle: "Upload Session Presentation · Lightning: Agents in Production Q&A",
      sessionTitle: "Lightning: Agents in Production Q&A",
      versions: [{ originalName: "agents-in-production.pdf" }],
    }]);
    await expect(downloadVersion(database, speaker, slug, version.id, storage))
      .rejects.toMatchObject({ code: "file_not_found" } satisfies Partial<FilesDeliverablesError>);
    await expect(downloadVersion(database, otherSpeaker, slug, version.id, storage))
      .rejects.toMatchObject({ code: "file_not_found" } satisfies Partial<FilesDeliverablesError>);
    await expect(requestUpload(database, speaker, uploadCommand(ids.event, organizerDeliverable.taskAssignmentId!), storage))
      .rejects.toMatchObject({ code: "file_not_found" } satisfies Partial<FilesDeliverablesError>);
    await expect(queueDueTaskReminders(database, {
      eventId: ids.event,
      dueBefore: new Date("2027-08-10T17:00:00.000Z"),
      idempotencyKey: `private-task-reminder-before-${ids.event}`,
    })).resolves.toBeNull();

    await tooling.database.update(decisions).set({ releasedAt: new Date(), releasedByPersonId: ids.organizer }).where(eq(decisions.id, decision.id));

    const afterRelease = await getSpeakerPortal(database, speaker, slug);
    const ownFiles = await listOwnDeliverables(database, speaker, slug);
    expect(afterRelease.speaker).toMatchObject({ sessionCount: 1, taskProgress: { complete: 0, total: 1 } });
    expect(afterRelease.speaker.assignedSessions).toMatchObject([{ id: session.id, title: "Lightning: Agents in Production Q&A" }]);
    expect(afterRelease.speaker.tasks).toMatchObject([{ id: organizerDeliverable.taskAssignmentId, title: "Upload Session Presentation · Lightning: Agents in Production Q&A" }]);
    expect(ownFiles).toMatchObject([{
      id: organizerDeliverable.id,
      sessionId: session.id,
      sessionTitle: "Lightning: Agents in Production Q&A",
      taskTitle: "Upload Session Presentation · Lightning: Agents in Production Q&A",
      versions: [{ id: version.id, originalName: "agents-in-production.pdf" }],
    }]);
    expect(afterRelease.speaker.sessionCount).toBe(ownFiles.length);
    await expect(queueDueTaskReminders(database, {
      eventId: ids.event,
      dueBefore: new Date("2027-08-10T17:00:00.000Z"),
      idempotencyKey: `private-task-reminder-after-${ids.event}`,
    })).resolves.not.toBeNull();
    expect(await (await downloadVersion(database, speaker, slug, version.id, storage)).text()).toBe("private deck");
    await expect(requestUpload(database, otherSpeaker, uploadCommand(ids.event, organizerDeliverable.taskAssignmentId!), storage))
      .rejects.toMatchObject({ code: "file_not_found" } satisfies Partial<FilesDeliverablesError>);
    await expect(requestUpload(database, speaker, uploadCommand(ids.event, organizerDeliverable.taskAssignmentId!), storage))
      .resolves.toMatchObject({ status: "authorized" });
  });
});

function uploadCommand(eventId: string, taskAssignmentId: string) {
  return {
    eventId,
    taskAssignmentId,
    originalName: "new-deck.pdf",
    mediaType: "application/pdf",
    byteSize: 12,
    checksumSha256: "b".repeat(64),
    idempotencyKey: `privacy-upload-${eventId}`,
  };
}

class MemoryFileStore implements PrivateFileStore {
  readonly configured = true;
  readonly objects = new Map<string, Uint8Array>();

  async putQuarantine(storageKey: string, body: ReadableStream | null): Promise<void> {
    this.objects.set(storageKey, new Uint8Array(await new Response(body).arrayBuffer()));
  }

  async inspect(storageKey: string): Promise<StoredObjectMetadata | null> {
    const bytes = this.objects.get(storageKey);
    return bytes ? { byteSize: bytes.byteLength, mediaType: "application/pdf", checksumSha256: "a".repeat(64) } : null;
  }

  async read(storageKey: string): Promise<Uint8Array | null> {
    return this.objects.get(storageKey) ?? null;
  }

  async putBundle(storageKey: string, contents: Uint8Array): Promise<void> {
    this.objects.set(storageKey, contents);
  }

  async download(storageKey: string, filename: string, mediaType: string): Promise<Response | null> {
    const bytes = this.objects.get(storageKey);
    return bytes ? new Response(Uint8Array.from(bytes).buffer, { headers: { "content-disposition": `attachment; filename="${filename}"`, "content-type": mediaType } }) : null;
  }
}
