import { randomUUID } from "node:crypto";
import type { Database } from "@programflow/database";
import {
  cfpForms,
  cfpFormVersions,
  decisionAuditEvents,
  decisionNotifications,
  decisions,
  eventMemberships,
  eventSpeakers,
  events,
  organizations,
  outboxEvents,
  people,
  personEmailAliases,
  sessionChangeRequests,
  sessionSpeakers,
  sessions,
  sessionVersions,
  speakerProfiles,
  submissionParticipants,
  submissions,
  submissionVersions,
} from "@programflow/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AcceptanceError,
  changeSubmissionDecision,
  decideSubmission,
  releaseDecision,
  updateDecisionNotification,
} from "../../apps/worker/src/modules/program/acceptance";
import {
  requestSessionChange,
  resolveSessionChange,
} from "../../apps/worker/src/modules/program/change-requests";
import {
  listOrganizerSubmissions,
  listSpeakerSubmissions,
  updateSpeakerSubmission,
} from "../../apps/worker/src/modules/forms-submissions/service";
import type { Actor } from "../../apps/worker/src/modules/identity-access/actor";
import { createToolingDatabase } from "../../packages/database/src/tooling-client";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Decision truth, release staging, and accepted Session changes", () => {
  const ids = {
    organization: randomUUID(),
    event: randomUUID(),
    organizer: randomUUID(),
    speaker: randomUUID(),
    form: randomUUID(),
    formVersion: randomUUID(),
    acceptedSubmission: randomUUID(),
    rejectedSubmission: randomUUID(),
  };
  const slug = `decision-workflows-${ids.event}`;
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const organizer: Actor = actor(ids.organizer, "organizer");
  const speaker: Actor = actor(ids.speaker, "speaker");

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `decision-org-${ids.organization}`, name: "Decision Workflow Test" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug,
      name: "Decision Workflow Event",
      startsOn: "2027-08-10",
      endsOn: "2027-08-12",
      timezone: "UTC",
      location: "Online",
    });
    await tooling.database.insert(people).values([
      { id: ids.organizer, stableKey: `organizer-${ids.organizer}`, displayName: "Organizer" },
      { id: ids.speaker, stableKey: `speaker-${ids.speaker}`, displayName: "Speaker", canonicalEmail: `speaker-${ids.speaker}@example.test` },
    ]);
    await tooling.database.insert(eventMemberships).values([
      { eventId: ids.event, personId: ids.organizer, role: "organizer" },
      { eventId: ids.event, personId: ids.speaker, role: "speaker" },
    ]);
    await tooling.database.insert(cfpForms).values({ id: ids.form, eventId: ids.event, name: "CFP", target: "session", status: "published" });
    await tooling.database.insert(cfpFormVersions).values({
      id: ids.formVersion,
      formId: ids.form,
      version: 1,
      publishedByPersonId: ids.organizer,
      definition: {
        target: "session",
        opensAt: null,
        closesAt: null,
        welcomeCopy: "",
        instructionsCopy: "",
        successCopy: "Submitted",
        allowDrafts: true,
        allowMultipleDrafts: true,
        draftsCountTowardLimit: false,
        allowSubmittedEdits: true,
        confirmationEmailEnabled: false,
        draftReminderEnabled: false,
        draftReminderLeadHours: 48,
        maxSubmissionsPerPerson: null,
        minimumParticipants: 1,
        maximumParticipants: 4,
        participantRoleLabels: { author: "Author", co_author: "Co-author", presenter: "Presenter" },
        fields: [],
      },
    });
    await tooling.database.insert(submissions).values([
      submitted(ids.acceptedSubmission, "Canonical acceptance"),
      submitted(ids.rejectedSubmission, "Initially rejected"),
    ]);
    await tooling.database.insert(submissionVersions).values([
      version(ids.acceptedSubmission, "Canonical acceptance", "Original accepted abstract"),
      version(ids.rejectedSubmission, "Initially rejected", "Original rejected abstract"),
    ]);
    await tooling.database.insert(submissionParticipants).values([
      participant(ids.acceptedSubmission),
      participant(ids.rejectedSubmission),
    ]);
  });

  afterAll(async () => {
    const decisionRows = await tooling.database.select({ id: decisions.id }).from(decisions)
      .where(inArray(decisions.submissionId, [ids.acceptedSubmission, ids.rejectedSubmission]));
    const decisionIds = decisionRows.map((row) => row.id);
    const sessionRows = await tooling.database.select({ id: sessions.id }).from(sessions)
      .where(inArray(sessions.sourceSubmissionId, [ids.acceptedSubmission, ids.rejectedSubmission]));
    const sessionIds = sessionRows.map((row) => row.id);
    if (sessionIds.length) {
      await tooling.database.delete(sessionChangeRequests).where(inArray(sessionChangeRequests.sessionId, sessionIds));
      await tooling.database.delete(sessionSpeakers).where(inArray(sessionSpeakers.sessionId, sessionIds));
      await tooling.database.delete(sessionVersions).where(inArray(sessionVersions.sessionId, sessionIds));
      await tooling.database.delete(sessions).where(inArray(sessions.id, sessionIds));
    }
    if (decisionIds.length) {
      await tooling.database.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, decisionIds));
      await tooling.database.delete(decisionNotifications).where(inArray(decisionNotifications.decisionId, decisionIds));
      await tooling.database.delete(decisionAuditEvents).where(inArray(decisionAuditEvents.decisionId, decisionIds));
      await tooling.database.delete(decisions).where(inArray(decisions.id, decisionIds));
    }
    await tooling.database.delete(eventSpeakers).where(eq(eventSpeakers.eventId, ids.event));
    await tooling.database.delete(submissionParticipants).where(inArray(submissionParticipants.submissionId, [ids.acceptedSubmission, ids.rejectedSubmission]));
    await tooling.database.delete(submissionVersions).where(inArray(submissionVersions.submissionId, [ids.acceptedSubmission, ids.rejectedSubmission]));
    await tooling.database.delete(submissions).where(inArray(submissions.id, [ids.acceptedSubmission, ids.rejectedSubmission]));
    await tooling.database.delete(cfpForms).where(eq(cfpForms.id, ids.form));
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(speakerProfiles).where(eq(speakerProfiles.personId, ids.speaker));
    await tooling.database.delete(personEmailAliases).where(eq(personEmailAliases.personId, ids.speaker));
    await tooling.database.delete(people).where(inArray(people.id, [ids.organizer, ids.speaker]));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("keeps an accepted Decision private until its reviewed communication is explicitly released", async () => {
    const handoff = await decideSubmission(database, organizer, {
      submissionId: ids.acceptedSubmission,
      outcome: "accepted",
      reason: "Strong program fit",
      idempotencyKey: `accept-private-${ids.acceptedSubmission}`,
    });
    expect(handoff.sessionId).not.toBeNull();

    const organizerView = await listOrganizerSubmissions(database, organizer, slug);
    expect(organizerView.find((row) => row.id === ids.acceptedSubmission)).toMatchObject({
      decision: "accepted",
      decisionReleasedAt: null,
      acceptedSession: { id: handoff.sessionId, title: "Canonical acceptance" },
      decisionNotification: { status: "draft", revision: 1 },
    });
    const speakerPrivateView = await listSpeakerSubmissions(database, speaker, slug);
    expect(speakerPrivateView.find((row) => row.id === ids.acceptedSubmission)).toMatchObject({
      decision: null,
      acceptedSession: null,
    });
    await expect(updateSpeakerSubmission(database, speaker, slug, ids.acceptedSubmission, {
      title: "Silent divergence",
      answers: { abstract: "This must not overwrite the Session." },
      participants: [{ name: "Speaker", email: `speaker-${ids.speaker}@example.test`, role: "author" }],
      saveAsDraft: false,
    })).rejects.toMatchObject({ code: "editing_locked" });

    await expect(releaseDecision(database, organizer, {
      decisionId: handoff.decisionId,
      idempotencyKey: `release-before-review-${ids.acceptedSubmission}`,
    })).rejects.toMatchObject<Partial<AcceptanceError>>({ code: "invalid_state" });

    const [draft] = await tooling.database.select().from(decisionNotifications)
      .where(eq(decisionNotifications.decisionId, handoff.decisionId));
    const reviewed = await updateDecisionNotification(database, organizer, {
      decisionId: handoff.decisionId,
      revision: draft!.revision,
      subjectTemplate: "Your ProgramFlow Decision for {{ submission_title }}",
      htmlTemplate: "<p>Hello {{first_name}}, your proposal <strong>{{submission_title}}</strong> is accepted.</p>",
      textTemplate: "Hello {{first_name}}, your proposal {{submission_title}} is accepted.",
    });
    expect(reviewed.status).toBe("reviewed");

    const releaseKey = `release-accepted-${ids.acceptedSubmission}`;
    const released = await releaseDecision(database, organizer, { decisionId: handoff.decisionId, idempotencyKey: releaseKey });
    const retry = await releaseDecision(database, organizer, { decisionId: handoff.decisionId, idempotencyKey: releaseKey });
    expect(released).toMatchObject({ outcome: "accepted", idempotent: false, notification: { status: "queued" } });
    expect(retry).toMatchObject({ outcome: "accepted", idempotent: true });
    const speakerReleasedView = await listSpeakerSubmissions(database, speaker, slug);
    expect(speakerReleasedView.find((row) => row.id === ids.acceptedSubmission)).toMatchObject({
      decision: "accepted",
      acceptedSession: { id: handoff.sessionId },
    });
  });

  it("supports audited Rejected to Accepted correction while guarding an accepted linked Session reversal", async () => {
    const rejected = await decideSubmission(database, organizer, {
      submissionId: ids.rejectedSubmission,
      outcome: "rejected",
      reason: "Initial capacity limit",
      idempotencyKey: `reject-private-${ids.rejectedSubmission}`,
    });
    const [draft] = await tooling.database.select().from(decisionNotifications)
      .where(eq(decisionNotifications.decisionId, rejected.decisionId));
    await updateDecisionNotification(database, organizer, {
      decisionId: rejected.decisionId,
      revision: draft!.revision,
      subjectTemplate: draft!.subjectTemplate,
      htmlTemplate: draft!.htmlTemplate,
      textTemplate: draft!.textTemplate,
    });
    await releaseDecision(database, organizer, { decisionId: rejected.decisionId, idempotencyKey: `release-rejected-${ids.rejectedSubmission}` });
    expect((await listSpeakerSubmissions(database, speaker, slug)).find((row) => row.id === ids.rejectedSubmission)?.decision).toBe("rejected");

    const corrected = await changeSubmissionDecision(database, organizer, {
      submissionId: ids.rejectedSubmission,
      outcome: "accepted",
      reason: "A program place opened",
      changeReason: "Capacity was corrected after the first release",
      idempotencyKey: `change-accepted-${ids.rejectedSubmission}`,
    });
    expect(corrected.sessionId).not.toBeNull();
    expect((await listSpeakerSubmissions(database, speaker, slug)).find((row) => row.id === ids.rejectedSubmission)).toMatchObject({ decision: null, acceptedSession: null });
    const audit = await tooling.database.select().from(decisionAuditEvents)
      .where(eq(decisionAuditEvents.decisionId, corrected.decisionId));
    expect(audit.map((row) => row.action)).toContain("changed");
    expect(audit.find((row) => row.action === "changed")).toMatchObject({ previousOutcome: "rejected", outcome: "accepted" });

    await expect(changeSubmissionDecision(database, organizer, {
      submissionId: ids.acceptedSubmission,
      outcome: "rejected",
      reason: "Reverse acceptance",
      changeReason: "Attempt unsafe reversal",
      idempotencyKey: `unsafe-reversal-${ids.acceptedSubmission}`,
    })).rejects.toMatchObject<Partial<AcceptanceError>>({ code: "unsafe_decision_reversal" });
  });

  it("records a speaker change request and applies approval only as a new audited Session version", async () => {
    const [session] = await tooling.database.select().from(sessions)
      .where(eq(sessions.sourceSubmissionId, ids.acceptedSubmission));
    const requestKey = `session-change-${ids.acceptedSubmission}`;
    const requested = await requestSessionChange(database, speaker, slug, session!.id, {
      title: "Canonical acceptance — revised",
      abstract: "An approved and audited Session revision.",
      reason: "Clarify the attendee outcome",
      idempotencyKey: requestKey,
    });
    const duplicate = await requestSessionChange(database, speaker, slug, session!.id, {
      title: "Canonical acceptance — revised",
      abstract: "An approved and audited Session revision.",
      reason: "Clarify the attendee outcome",
      idempotencyKey: requestKey,
    });
    expect(duplicate.id).toBe(requested.id);

    const resolutionKey = `approve-session-change-${requested.id}`;
    const approved = await resolveSessionChange(database, organizer, slug, requested.id, {
      resolution: "approved",
      note: "Approved after program review",
      idempotencyKey: resolutionKey,
    });
    const retry = await resolveSessionChange(database, organizer, slug, requested.id, {
      resolution: "approved",
      note: "Approved after program review",
      idempotencyKey: resolutionKey,
    });
    expect(approved.status).toBe("approved");
    expect(retry.id).toBe(approved.id);

    const [updatedSession] = await tooling.database.select().from(sessions).where(eq(sessions.id, session!.id));
    const proposalVersions = await tooling.database.select().from(submissionVersions)
      .where(eq(submissionVersions.submissionId, ids.acceptedSubmission));
    const acceptedSessionVersions = await tooling.database.select().from(sessionVersions)
      .where(eq(sessionVersions.sessionId, session!.id));
    expect(updatedSession).toMatchObject({ title: "Canonical acceptance — revised", abstract: "An approved and audited Session revision.", revision: 2 });
    expect(proposalVersions).toHaveLength(1);
    expect(proposalVersions[0]?.title).toBe("Canonical acceptance");
    expect(acceptedSessionVersions).toHaveLength(2);
  });

  function actor(personId: string, role: "organizer" | "speaker"): Actor {
    return { identityId: `${role}-${personId}`, personId, organizationRoles: [], eventRoles: [{ eventId: ids.event, role }] };
  }

  function submitted(id: string, title: string) {
    return {
      id,
      eventId: ids.event,
      formId: ids.form,
      formVersionId: ids.formVersion,
      submitterPersonId: ids.speaker,
      title,
      state: "submitted" as const,
      submittedAt: new Date(),
    };
  }

  function version(submissionId: string, title: string, abstract: string) {
    return { submissionId, version: 1, title, answers: { abstract }, createdByPersonId: ids.speaker };
  }

  function participant(submissionId: string) {
    return {
      submissionId,
      personId: ids.speaker,
      name: "Speaker",
      email: `speaker-${ids.speaker}@example.test`,
      role: "author" as const,
      sortOrder: 0,
    };
  }
});
