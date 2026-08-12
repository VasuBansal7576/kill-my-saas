import type { AcceptanceHandoff } from "@programflow/contracts";
import {
  decisionAuditEvents,
  decisions,
  eventFormats,
  eventMemberships,
  eventSpeakers,
  eventTracks,
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

export class AcceptanceError extends Error {
  constructor(
    readonly code: "submission_not_found" | "forbidden" | "invalid_state" | "decision_conflict" | "version_missing" | "idempotency_conflict",
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
  return database.transaction(async (transaction) => {
    const receiptKey = `decision-command:${command.idempotencyKey}`;
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
    if (decisionChanged && (existingDecision?.outcome !== "rejected" || command.outcome !== "accepted")) {
      throw new AcceptanceError("decision_conflict", "An accepted submission cannot be rejected without an explicit session-withdrawal workflow.");
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
        reason,
        actorPersonId: actor.personId,
        idempotencyKey: command.idempotencyKey,
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

    const sideEffects = command.outcome === "accepted"
      ? ["decision.notification.requested", "speaker.portal-invitation.requested", "speaker.tasks.requested", "dashboard.refresh.requested", "integration.eligibility.requested"]
      : ["decision.notification.requested", "dashboard.refresh.requested"];
    for (const eventType of sideEffects) {
      await transaction.insert(outboxEvents).values({
        aggregateType: "decision",
        aggregateId: decision.id,
        eventType,
        payload,
        idempotencyKey: decisionChanged
          ? `decision:${decision.id}:${eventType}:transition:${command.idempotencyKey}`
          : `decision:${decision.id}:${eventType}`,
      }).onConflictDoNothing();
    }

    return {
      decisionId: decision.id,
      submissionId: submission.id,
      sessionId,
      eventSpeakerIds,
      outboxEventId: receipt.id,
    };
  });
}
