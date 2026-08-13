import {
  decisions,
  eventSpeakers,
  events,
  sessionChangeRequests,
  sessionSpeakers,
  sessions,
  sessionVersions,
  type Database,
} from "@programflow/database";
import { and, eq, sql } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";

export class SessionChangeRequestError extends Error {
  constructor(
    readonly code:
      | "session_not_found"
      | "change_request_not_found"
      | "forbidden"
      | "decision_not_released"
      | "invalid_state"
      | "idempotency_conflict",
    message: string,
  ) {
    super(message);
  }
}

export interface SessionChangeRequestRecord {
  id: string;
  sessionId: string;
  requestedByPersonId: string;
  proposedTitle: string;
  proposedAbstract: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export async function requestSessionChange(
  database: Database,
  actor: Actor,
  eventSlug: string,
  sessionId: string,
  input: { title: string; abstract: string; reason: string; idempotencyKey: string },
): Promise<SessionChangeRequestRecord> {
  const context = await requireSpeakerSession(database, actor, eventSlug, sessionId);
  const [prior] = await database.select().from(sessionChangeRequests)
    .where(eq(sessionChangeRequests.idempotencyKey, input.idempotencyKey)).limit(1);
  if (prior) {
    if (prior.sessionId !== sessionId || prior.proposedTitle !== input.title.trim() || prior.proposedAbstract !== input.abstract.trim()) {
      throw new SessionChangeRequestError("idempotency_conflict", "That idempotency key was already used for another Session change request.");
    }
    return serialize(prior);
  }
  const [created] = await database.insert(sessionChangeRequests).values({
    eventId: context.eventId,
    sessionId,
    requestedByPersonId: actor.personId,
    proposedTitle: input.title.trim(),
    proposedAbstract: input.abstract.trim(),
    reason: input.reason.trim(),
    idempotencyKey: input.idempotencyKey,
  }).returning();
  if (!created) throw new SessionChangeRequestError("invalid_state", "The Session change request could not be recorded.");
  return serialize(created);
}

export async function resolveSessionChange(
  database: Database,
  actor: Actor,
  eventSlug: string,
  requestId: string,
  input: { resolution: "approved" | "rejected"; note: string; idempotencyKey: string },
): Promise<SessionChangeRequestRecord> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select id from session_change_requests where id = ${requestId} for update`);
    const [request] = await transaction.select().from(sessionChangeRequests)
      .where(eq(sessionChangeRequests.id, requestId)).limit(1);
    if (!request) throw new SessionChangeRequestError("change_request_not_found", "Session change request not found.");
    const [session] = await transaction.select({ id: sessions.id, eventId: sessions.eventId, revision: sessions.revision, contentStatus: sessions.contentStatus })
      .from(sessions).where(eq(sessions.id, request.sessionId)).limit(1);
    if (!session) throw new SessionChangeRequestError("session_not_found", "The linked Session no longer exists.");
    const [event] = await transaction.select({ id: events.id, slug: events.slug }).from(events)
      .where(eq(events.id, session.eventId)).limit(1);
    if (!event || event.slug !== eventSlug) throw new SessionChangeRequestError("session_not_found", "Session not found in this Event.");
    if (!actorCanAccessEvent(actor, session.eventId, "organizer")) {
      throw new SessionChangeRequestError("forbidden", "Organizer access is required to resolve a Session change request.");
    }
    if (request.status !== "pending") {
      if (request.status === input.resolution && request.resolutionIdempotencyKey === input.idempotencyKey) return serialize(request);
      throw new SessionChangeRequestError("invalid_state", "This Session change request has already been resolved.");
    }

    const resolvedAt = new Date();
    if (input.resolution === "approved") {
      const nextRevision = session.revision + 1;
      const nextContentStatus = session.contentStatus === "approved" ? "in_review" : session.contentStatus;
      const [updated] = await transaction.update(sessions).set({
        title: request.proposedTitle,
        abstract: request.proposedAbstract,
        contentStatus: nextContentStatus,
        revision: nextRevision,
        updatedAt: resolvedAt,
      }).where(and(eq(sessions.id, session.id), eq(sessions.revision, session.revision))).returning();
      if (!updated) throw new SessionChangeRequestError("invalid_state", "The Session changed while the request was being approved.");
      await transaction.insert(sessionVersions).values({
        sessionId: session.id,
        version: nextRevision,
        title: request.proposedTitle,
        abstract: request.proposedAbstract,
        contentStatus: nextContentStatus,
        createdByPersonId: actor.personId,
      });
    }
    const [resolved] = await transaction.update(sessionChangeRequests).set({
      status: input.resolution,
      resolutionIdempotencyKey: input.idempotencyKey,
      resolvedByPersonId: actor.personId,
      resolutionNote: input.note.trim(),
      resolvedAt,
      updatedAt: resolvedAt,
    }).where(eq(sessionChangeRequests.id, request.id)).returning();
    if (!resolved) throw new SessionChangeRequestError("invalid_state", "The Session change request could not be resolved.");
    return serialize(resolved);
  });
}

async function requireSpeakerSession(database: Database, actor: Actor, eventSlug: string, sessionId: string) {
  const [context] = await database.select({
    eventId: sessions.eventId,
    sourceSubmissionId: sessions.sourceSubmissionId,
    outcome: decisions.outcome,
    releasedAt: decisions.releasedAt,
  }).from(sessions)
    .leftJoin(decisions, eq(decisions.submissionId, sessions.sourceSubmissionId))
    .where(eq(sessions.id, sessionId)).limit(1);
  if (!context) throw new SessionChangeRequestError("session_not_found", "Session not found.");
  const [event] = await database.select({ slug: events.slug }).from(events).where(eq(events.id, context.eventId)).limit(1);
  if (event?.slug !== eventSlug) {
    throw new SessionChangeRequestError("session_not_found", "Session not found in this Event.");
  }
  if (!actorCanAccessEvent(actor, context.eventId, "speaker")) {
    throw new SessionChangeRequestError("forbidden", "Speaker access is required to request a Session change.");
  }
  const [assignment] = await database.select({ id: sessionSpeakers.sessionId }).from(sessionSpeakers)
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
    .where(and(eq(sessionSpeakers.sessionId, sessionId), eq(eventSpeakers.personId, actor.personId))).limit(1);
  if (!assignment) throw new SessionChangeRequestError("forbidden", "You can only request changes to your own assigned Sessions.");
  if (context.sourceSubmissionId && (context.outcome !== "accepted" || !context.releasedAt)) {
    throw new SessionChangeRequestError("decision_not_released", "Session changes open after the accepted Decision has been released.");
  }
  return context;
}

function serialize(request: typeof sessionChangeRequests.$inferSelect): SessionChangeRequestRecord {
  return {
    id: request.id,
    sessionId: request.sessionId,
    requestedByPersonId: request.requestedByPersonId,
    proposedTitle: request.proposedTitle,
    proposedAbstract: request.proposedAbstract,
    reason: request.reason,
    status: request.status,
    resolutionNote: request.resolutionNote,
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}
