import type { AcceptanceHandoff } from "@programflow/contracts";
import {
  decisionAuditEvents,
  decisionNotifications,
  decisions,
  eventFormats,
  eventMemberships,
  eventSpeakers,
  eventTracks,
  outboxEvents,
  placements,
  publications,
  people,
  personEmailAliases,
  sessionSpeakers,
  sessions,
  sessionVersions,
  speakerProfiles,
  submissionParticipants,
  submissions,
  submissionVersions,
  type Database,
} from "@programflow/database";
import { and, asc, eq, or, sql } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";

export interface DecideSubmissionCommand {
  submissionId: string;
  outcome: "accepted" | "rejected";
  idempotencyKey: string;
  reason?: string;
}

export interface ChangeDecisionCommand extends DecideSubmissionCommand {
  changeReason: string;
}

export interface DecisionNotificationDraft {
  id: string;
  decisionId: string;
  status: "draft" | "reviewed" | "queued" | "handed_off";
  revision: number;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  communicationId: string | null;
  queuedAt: string | null;
  handedOffAt: string | null;
}

export interface DecisionReleaseResult {
  decisionId: string;
  submissionId: string;
  outcome: "accepted" | "rejected";
  releasedAt: string;
  notification: DecisionNotificationDraft;
  outboxEventIds: string[];
  idempotent: boolean;
}

export class AcceptanceError extends Error {
  constructor(
    readonly code:
      | "submission_not_found"
      | "decision_not_found"
      | "notification_not_found"
      | "forbidden"
      | "invalid_state"
      | "decision_conflict"
      | "unsafe_decision_reversal"
      | "stale_notification"
      | "version_missing"
      | "idempotency_conflict",
    message: string,
  ) {
    super(message);
  }
}

function answerText(answers: Record<string, unknown>, keys: ReadonlyArray<string>): string {
  for (const key of keys) {
    const value = answers[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function decideSubmission(
  database: Database,
  actor: Actor,
  command: DecideSubmissionCommand,
): Promise<AcceptanceHandoff> {
  return persistDecision(database, actor, command, false);
}

export async function changeSubmissionDecision(
  database: Database,
  actor: Actor,
  command: ChangeDecisionCommand,
): Promise<AcceptanceHandoff> {
  if (!command.changeReason.trim()) {
    throw new AcceptanceError("invalid_state", "An audited reason is required to change a final decision.");
  }
  return persistDecision(database, actor, command, true);
}

async function persistDecision(
  database: Database,
  actor: Actor,
  command: DecideSubmissionCommand | ChangeDecisionCommand,
  explicitChange: boolean,
): Promise<AcceptanceHandoff> {
  return database.transaction(async (transaction) => {
    const receiptKey = `${explicitChange ? "decision-change" : "decision-command"}:${command.idempotencyKey}`;
    const [priorReceipt] = await transaction.select().from(outboxEvents)
      .where(eq(outboxEvents.idempotencyKey, receiptKey)).limit(1);
    if (priorReceipt) {
      const payload = priorReceipt.payload as Partial<AcceptanceHandoff> & { outcome?: string };
      if (payload.submissionId !== command.submissionId || payload.outcome !== command.outcome || !payload.decisionId) {
        throw new AcceptanceError("idempotency_conflict", "That idempotency key was already used for another decision command.");
      }
      return {
        decisionId: payload.decisionId,
        submissionId: command.submissionId,
        sessionId: payload.sessionId ?? null,
        eventSpeakerIds: payload.eventSpeakerIds ?? [],
        outboxEventId: priorReceipt.id,
      };
    }

    await transaction.execute(sql`select id from submissions where id = ${command.submissionId} for update`);
    const [submission] = await transaction.select().from(submissions)
      .where(eq(submissions.id, command.submissionId)).limit(1);
    if (!submission) throw new AcceptanceError("submission_not_found", "Submission not found.");
    if (!actorCanAccessEvent(actor, submission.eventId, "organizer")) {
      throw new AcceptanceError("forbidden", "Organizer access is required to decide this submission.");
    }
    if (submission.state !== "submitted") {
      throw new AcceptanceError("invalid_state", "Only submitted proposals can be decided.");
    }

    const [existingDecision] = await transaction.select().from(decisions)
      .where(eq(decisions.submissionId, submission.id)).limit(1);
    const decisionChanged = Boolean(existingDecision && existingDecision.outcome !== command.outcome);
    if (explicitChange && !existingDecision) {
      throw new AcceptanceError("decision_not_found", "Record a final decision before using the audited change-decision path.");
    }
    if (!explicitChange && decisionChanged) {
      throw new AcceptanceError("decision_conflict", "A different final decision already exists. Use the audited change-decision action.");
    }
    if (explicitChange && existingDecision && !decisionChanged) {
      throw new AcceptanceError("decision_conflict", "The requested outcome already is the authoritative decision.");
    }
    if (decisionChanged && existingDecision?.outcome === "accepted") {
      const [linkedSession] = await transaction.select({ id: sessions.id }).from(sessions)
        .where(eq(sessions.sourceSubmissionId, submission.id)).limit(1);
      const [livePublication] = await transaction.select({ id: publications.id }).from(publications)
        .where(and(eq(publications.eventId, submission.eventId), eq(publications.state, "live"))).limit(1);
      const scheduled = linkedSession
        ? await transaction.select({ id: placements.id }).from(placements).where(eq(placements.sessionId, linkedSession.id)).limit(1)
        : [];
      const consequences = [
        linkedSession ? "linked Session" : null,
        scheduled.length ? "schedule placement" : null,
        livePublication ? "live Publication" : null,
      ].filter(Boolean).join(", ");
      throw new AcceptanceError(
        "unsafe_decision_reversal",
        `Accepted cannot be changed to Rejected because the acceptance handoff has ${consequences || "downstream program state"}. Use a dedicated withdrawal workflow so that state is not silently deleted.`,
      );
    }

    const reason = command.reason?.trim() ?? "";
    const decision = existingDecision
      ? decisionChanged
        ? (await transaction.update(decisions).set({
          outcome: command.outcome,
          reason,
          idempotencyKey: command.idempotencyKey,
          decidedByPersonId: actor.personId,
          decidedAt: new Date(),
          releasedByPersonId: null,
          releasedAt: null,
          notifiedAt: null,
          updatedAt: new Date(),
        }).where(eq(decisions.id, existingDecision.id)).returning())[0]
        : existingDecision
      : (await transaction.insert(decisions).values({
        submissionId: submission.id,
        outcome: command.outcome,
        reason,
        idempotencyKey: command.idempotencyKey,
        decidedByPersonId: actor.personId,
      }).returning())[0];

    if (!decision) throw new AcceptanceError("decision_conflict", "The decision could not be recorded.");
    if (!existingDecision || decisionChanged) {
      await transaction.insert(decisionAuditEvents).values({
        decisionId: decision.id,
        outcome: command.outcome,
        previousOutcome: decisionChanged ? existingDecision?.outcome : null,
        action: decisionChanged ? "changed" : "recorded",
        reason: decisionChanged ? (command as ChangeDecisionCommand).changeReason.trim() : reason,
        metadata: decisionChanged ? { decisionReason: reason } : {},
        actorPersonId: actor.personId,
        idempotencyKey: `decision-audit:${command.idempotencyKey}`,
      }).onConflictDoNothing({ target: decisionAuditEvents.idempotencyKey });
    }

    let sessionId: string | null = null;
    const eventSpeakerIds: string[] = [];

    if (command.outcome === "accepted") {
      const [version] = await transaction.select().from(submissionVersions).where(and(
        eq(submissionVersions.submissionId, submission.id),
        eq(submissionVersions.version, submission.currentVersion),
      )).limit(1);
      if (!version) throw new AcceptanceError("version_missing", "The current submitted version is missing.");

      const participants = await transaction.select().from(submissionParticipants)
        .where(eq(submissionParticipants.submissionId, submission.id))
        .orderBy(asc(submissionParticipants.sortOrder));

      for (const participant of participants) {
        const normalizedEmail = participant.email.trim().toLowerCase();
        let personId = participant.personId;
        if (!personId) {
          const stableKey = `email:${normalizedEmail}`;
          const [knownPerson] = await transaction.select({ id: people.id }).from(people).where(or(
            eq(people.stableKey, stableKey),
            eq(people.canonicalEmail, normalizedEmail),
          )).limit(1);
          personId = knownPerson?.id ?? null;
          if (!personId) {
            const [createdPerson] = await transaction.insert(people).values({
              stableKey,
              displayName: participant.name,
              canonicalEmail: normalizedEmail,
            }).onConflictDoNothing().returning({ id: people.id });
            personId = createdPerson?.id ?? null;
          }
          if (!personId) {
            const [concurrentPerson] = await transaction.select({ id: people.id }).from(people).where(or(
              eq(people.stableKey, stableKey),
              eq(people.canonicalEmail, normalizedEmail),
            )).limit(1);
            personId = concurrentPerson?.id ?? null;
          }
          if (!personId) throw new AcceptanceError("decision_conflict", "A participant identity could not be resolved.");
          await transaction.update(submissionParticipants).set({ personId, updatedAt: new Date() })
            .where(eq(submissionParticipants.id, participant.id));
        }

        await transaction.insert(personEmailAliases).values({
          personId,
          email: participant.email,
          normalizedEmail,
          isCanonical: true,
        }).onConflictDoNothing();
        await transaction.insert(speakerProfiles).values({ personId }).onConflictDoNothing();
        await transaction.insert(eventMemberships).values({
          eventId: submission.eventId,
          personId,
          role: "speaker",
        }).onConflictDoNothing();
        await transaction.insert(eventSpeakers).values({
          eventId: submission.eventId,
          personId,
          status: "invited",
        }).onConflictDoNothing();
        const [eventSpeaker] = await transaction.select({ id: eventSpeakers.id }).from(eventSpeakers).where(and(
          eq(eventSpeakers.eventId, submission.eventId),
          eq(eventSpeakers.personId, personId),
        )).limit(1);
        if (!eventSpeaker) throw new AcceptanceError("decision_conflict", "An event speaker could not be resolved.");
        eventSpeakerIds.push(eventSpeaker.id);
      }

      const requestedTrack = answerText(version.answers, ["trackId", "track_id", "track"]);
      const requestedFormat = answerText(version.answers, ["formatId", "format_id", "format"]);
      const [trackCatalog, formatCatalog] = await Promise.all([
        transaction.select({ id: eventTracks.id, name: eventTracks.name }).from(eventTracks)
          .where(eq(eventTracks.eventId, submission.eventId)),
        transaction.select({ id: eventFormats.id, name: eventFormats.name, durationMinutes: eventFormats.durationMinutes }).from(eventFormats)
          .where(eq(eventFormats.eventId, submission.eventId)),
      ]);
      const track = trackCatalog.find((candidate) => candidate.id === requestedTrack || candidate.name === requestedTrack);
      const format = formatCatalog.find((candidate) =>
        candidate.id === requestedFormat
        || candidate.name === requestedFormat
        || `${candidate.name} (${candidate.durationMinutes} min)` === requestedFormat,
      );

      const [existingSession] = await transaction.select().from(sessions)
        .where(eq(sessions.sourceSubmissionId, submission.id)).limit(1);
      const session = existingSession ?? (await transaction.insert(sessions).values({
        eventId: submission.eventId,
        sourceSubmissionId: submission.id,
        trackId: track?.id,
        formatId: format?.id,
        title: version.title,
        abstract: answerText(version.answers, ["abstract", "description", "summary"]),
        contentStatus: "draft",
      }).returning())[0];
      if (!session) throw new AcceptanceError("decision_conflict", "The accepted session could not be created.");
      sessionId = session.id;

      await transaction.insert(sessionVersions).values({
        sessionId: session.id,
        version: 1,
        title: session.title,
        abstract: session.abstract,
        contentStatus: session.contentStatus,
        createdByPersonId: actor.personId,
      }).onConflictDoNothing();
      for (const eventSpeakerId of eventSpeakerIds) {
        await transaction.insert(sessionSpeakers).values({ sessionId: session.id, eventSpeakerId }).onConflictDoNothing();
      }
    }

    const payload = {
      decisionId: decision.id,
      submissionId: submission.id,
      outcome: command.outcome,
      sessionId,
      eventSpeakerIds,
    };
    const [receipt] = await transaction.insert(outboxEvents).values({
      aggregateType: "decision",
      aggregateId: decision.id,
      eventType: "decision.recorded",
      payload,
      idempotencyKey: receiptKey,
    }).returning();
    if (!receipt) throw new AcceptanceError("decision_conflict", "The decision outbox receipt could not be created.");

    if (!existingDecision || decisionChanged) {
      const notificationCopy = defaultDecisionNotification(command.outcome);
      await transaction.insert(decisionNotifications).values({
        decisionId: decision.id,
        ...notificationCopy,
      }).onConflictDoUpdate({
        target: decisionNotifications.decisionId,
        set: {
          status: "draft",
          revision: sql`${decisionNotifications.revision} + 1`,
          ...notificationCopy,
          communicationId: null,
          queuedAt: null,
          handedOffAt: null,
          updatedAt: new Date(),
        },
      });
    }
    await transaction.insert(outboxEvents).values({
      aggregateType: "decision",
      aggregateId: decision.id,
      eventType: "dashboard.refresh.requested",
      payload,
      idempotencyKey: `decision:${decision.id}:dashboard:${command.idempotencyKey}`,
    }).onConflictDoNothing();

    return {
      decisionId: decision.id,
      submissionId: submission.id,
      sessionId,
      eventSpeakerIds,
      outboxEventId: receipt.id,
    };
  });
}

export async function updateDecisionNotification(
  database: Database,
  actor: Actor,
  command: {
    decisionId: string;
    revision: number;
    subjectTemplate: string;
    htmlTemplate: string;
    textTemplate: string;
  },
): Promise<DecisionNotificationDraft> {
  return database.transaction(async (transaction) => {
    const context = await requireDecisionContext(transaction, command.decisionId);
    if (!actorCanAccessEvent(actor, context.eventId, "organizer")) {
      throw new AcceptanceError("forbidden", "Organizer access is required to edit a decision notification.");
    }
    const [current] = await transaction.select().from(decisionNotifications)
      .where(eq(decisionNotifications.decisionId, command.decisionId)).limit(1);
    if (!current) throw new AcceptanceError("notification_not_found", "Decision notification draft not found.");
    if (!["draft", "reviewed"].includes(current.status) || context.releasedAt) {
      throw new AcceptanceError("invalid_state", "A released decision notification is immutable; create a new communication for follow-up.");
    }
    if (current.revision !== command.revision) {
      throw new AcceptanceError("stale_notification", "The notification changed since it was opened. Reload before saving.");
    }
    const [updated] = await transaction.update(decisionNotifications).set({
      subjectTemplate: command.subjectTemplate.trim(),
      htmlTemplate: command.htmlTemplate,
      textTemplate: command.textTemplate,
      status: "reviewed",
      revision: current.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(decisionNotifications.id, current.id), eq(decisionNotifications.revision, current.revision))).returning();
    if (!updated) throw new AcceptanceError("stale_notification", "The notification changed while it was being saved.");
    await transaction.insert(decisionAuditEvents).values({
      decisionId: context.decisionId,
      outcome: context.outcome,
      action: "notification_updated",
      reason: "Decision communication reviewed and updated.",
      metadata: { notificationId: updated.id, revision: updated.revision },
      actorPersonId: actor.personId,
      idempotencyKey: `decision-notification:${updated.id}:revision:${updated.revision}`,
    });
    return serializeNotification(updated);
  });
}

export async function releaseDecision(
  database: Database,
  actor: Actor,
  command: { decisionId: string; idempotencyKey: string },
): Promise<DecisionReleaseResult> {
  return database.transaction(async (transaction) => {
    const receiptKey = `decision-release:${command.idempotencyKey}`;
    const [prior] = await transaction.select().from(outboxEvents).where(eq(outboxEvents.idempotencyKey, receiptKey)).limit(1);
    if (prior) {
      const payload = prior.payload as Partial<DecisionReleaseResult>;
      if (payload.decisionId !== command.decisionId || !payload.submissionId || !payload.outcome || !payload.releasedAt) {
        throw new AcceptanceError("idempotency_conflict", "That idempotency key was already used for another decision release.");
      }
      const [notification] = await transaction.select().from(decisionNotifications)
        .where(eq(decisionNotifications.decisionId, command.decisionId)).limit(1);
      if (!notification) throw new AcceptanceError("notification_not_found", "Decision notification draft not found.");
      return { ...payload as DecisionReleaseResult, notification: serializeNotification(notification), outboxEventIds: [prior.id], idempotent: true };
    }

    await transaction.execute(sql`select id from decisions where id = ${command.decisionId} for update`);
    const context = await requireDecisionContext(transaction, command.decisionId);
    if (!actorCanAccessEvent(actor, context.eventId, "organizer")) {
      throw new AcceptanceError("forbidden", "Organizer access is required to release a decision.");
    }
    if (context.releasedAt) throw new AcceptanceError("invalid_state", "This decision has already been released.");
    const [notification] = await transaction.select().from(decisionNotifications)
      .where(eq(decisionNotifications.decisionId, command.decisionId)).limit(1);
    if (!notification) throw new AcceptanceError("notification_not_found", "Decision notification draft not found.");
    if (notification.status !== "reviewed") throw new AcceptanceError("invalid_state", "Review and save the decision communication before releasing it.");

    const releasedAt = new Date();
    await transaction.update(decisions).set({
      releasedByPersonId: actor.personId,
      releasedAt,
      updatedAt: releasedAt,
    }).where(eq(decisions.id, context.decisionId));
    const [queuedNotification] = await transaction.update(decisionNotifications).set({
      status: "queued",
      queuedAt: releasedAt,
      updatedAt: releasedAt,
    }).where(eq(decisionNotifications.id, notification.id)).returning();
    if (!queuedNotification) throw new AcceptanceError("notification_not_found", "Decision notification draft not found.");

    const [linkedSession] = await transaction.select({ id: sessions.id }).from(sessions)
      .where(eq(sessions.sourceSubmissionId, context.submissionId)).limit(1);
    if (context.outcome === "accepted" && !linkedSession) {
      throw new AcceptanceError("invalid_state", "An accepted decision cannot be released until its linked Session exists.");
    }
    const eventSpeakerIds = linkedSession
      ? (await transaction.select({ id: sessionSpeakers.eventSpeakerId }).from(sessionSpeakers)
        .where(eq(sessionSpeakers.sessionId, linkedSession.id))).map((row) => row.id)
      : [];
    const notificationEvent = await transaction.insert(outboxEvents).values({
      aggregateType: "decision",
      aggregateId: context.decisionId,
      eventType: "decision.notification.released",
      payload: {
        decisionId: context.decisionId,
        notificationId: queuedNotification.id,
        submissionId: context.submissionId,
        eventId: context.eventId,
        outcome: context.outcome,
        subjectTemplate: queuedNotification.subjectTemplate,
        htmlTemplate: queuedNotification.htmlTemplate,
        textTemplate: queuedNotification.textTemplate,
      },
      idempotencyKey: `decision:${context.decisionId}:notification:release:${command.idempotencyKey}`,
    }).returning({ id: outboxEvents.id });
    const sideEffectIds = notificationEvent[0] ? [notificationEvent[0].id] : [];
    if (context.outcome === "accepted") {
      for (const eventType of ["speaker.portal-invitation.requested", "speaker.tasks.requested", "integration.eligibility.requested"] as const) {
        const [event] = await transaction.insert(outboxEvents).values({
          aggregateType: "decision",
          aggregateId: context.decisionId,
          eventType,
          payload: { decisionId: context.decisionId, submissionId: context.submissionId, eventSpeakerIds },
          idempotencyKey: `decision:${context.decisionId}:${eventType}:release:${command.idempotencyKey}`,
        }).returning({ id: outboxEvents.id });
        if (event) sideEffectIds.push(event.id);
      }
    }
    await transaction.insert(decisionAuditEvents).values({
      decisionId: context.decisionId,
      outcome: context.outcome,
      action: "released",
      reason: "Decision released to the submitter with its reviewed communication.",
      metadata: { notificationId: queuedNotification.id, notificationRevision: queuedNotification.revision },
      actorPersonId: actor.personId,
      idempotencyKey: `decision-release-audit:${command.idempotencyKey}`,
    });
    const response: DecisionReleaseResult = {
      decisionId: context.decisionId,
      submissionId: context.submissionId,
      outcome: context.outcome,
      releasedAt: releasedAt.toISOString(),
      notification: serializeNotification(queuedNotification),
      outboxEventIds: sideEffectIds,
      idempotent: false,
    };
    const [receipt] = await transaction.insert(outboxEvents).values({
      aggregateType: "decision",
      aggregateId: context.decisionId,
      eventType: "decision.released",
      payload: { ...response },
      idempotencyKey: receiptKey,
    }).returning({ id: outboxEvents.id });
    if (!receipt) throw new AcceptanceError("invalid_state", "Decision release receipt could not be recorded.");
    return response;
  });
}

function defaultDecisionNotification(outcome: "accepted" | "rejected") {
  const decisionLabel = outcome === "accepted" ? "Accepted" : "Not selected";
  return {
    subjectTemplate: `Decision for {{ submission_title }}: ${decisionLabel}`,
    htmlTemplate: `<p>Hello {{first_name}},</p><p>The decision for <strong>{{submission_title}}</strong> is <strong>${decisionLabel}</strong>.</p>`,
    textTemplate: `Hello {{first_name}}, the decision for {{submission_title}} is ${decisionLabel}.`,
  };
}

async function requireDecisionContext(transaction: Parameters<Parameters<Database["transaction"]>[0]>[0], decisionId: string) {
  const [context] = await transaction.select({
    decisionId: decisions.id,
    outcome: decisions.outcome,
    releasedAt: decisions.releasedAt,
    submissionId: submissions.id,
    eventId: submissions.eventId,
  }).from(decisions).innerJoin(submissions, eq(submissions.id, decisions.submissionId))
    .where(eq(decisions.id, decisionId)).limit(1);
  if (!context) throw new AcceptanceError("decision_not_found", "Decision not found.");
  return context;
}

function serializeNotification(notification: typeof decisionNotifications.$inferSelect): DecisionNotificationDraft {
  return {
    id: notification.id,
    decisionId: notification.decisionId,
    status: notification.status,
    revision: notification.revision,
    subjectTemplate: notification.subjectTemplate,
    htmlTemplate: notification.htmlTemplate,
    textTemplate: notification.textTemplate,
    communicationId: notification.communicationId,
    queuedAt: notification.queuedAt?.toISOString() ?? null,
    handedOffAt: notification.handedOffAt?.toISOString() ?? null,
  };
}
