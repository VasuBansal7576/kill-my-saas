import {
  acceleventsConfigurations,
  acceleventsSyncRuns,
  airtableConfigurations,
  airtableSyncRuns,
  cfpForms,
  communicationRecipients,
  communications,
  decisions,
  deliverables,
  eventRooms,
  eventMemberships,
  eventSpeakers,
  events,
  outboxEvents,
  people,
  personEmailAliases,
  placements,
  publications,
  reviewAssignments,
  reviewConflicts,
  reviewRounds,
  scheduleRevisions,
  sessions,
  sessionSpeakers,
  speakerTaskAssignments,
  speakerTasks,
  submissions,
  type Database,
} from "@programflow/database";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import { deriveScheduleConflicts } from "../scheduling/rules";
import type { SchedulePlacement, ScheduleRoom, ScheduleSession } from "../scheduling/types";
import type { DashboardRows, DashboardSnapshot, ProgramReadinessException } from "./types";

export class DashboardError extends Error {
  constructor(readonly code: "event_not_found" | "forbidden", message: string) {
    super(message);
  }
}

export async function getOrganizerDashboard(
  database: Database,
  actor: Actor,
  eventSlug: string,
  now = new Date(),
): Promise<DashboardSnapshot> {
  const candidates = await database.select({
    id: events.id,
    organizationId: events.organizationId,
    slug: events.slug,
    name: events.name,
    startsOn: events.startsOn,
    endsOn: events.endsOn,
    timezone: events.timezone,
  }).from(events).where(eq(events.slug, eventSlug));
  if (candidates.length === 0) throw new DashboardError("event_not_found", "Event not found.");
  const event = candidates.find((candidate) => actorCanAccessEvent(actor, candidate.id, "organizer"));
  if (!event) throw new DashboardError("forbidden", "Organizer access to this event is required.");

  const [
    formRows,
    submissionRows,
    assignmentRows,
    conflictRows,
    decisionRows,
    speakerRows,
    taskRows,
    deliverableRows,
    recipientRows,
    sessionRows,
    revisionRows,
    latestReadyRevisionRows,
    publicationRows,
    portalInvitationRows,
    speakerIdentityRows,
    publicationHandoffRows,
    acceleventsRows,
    successfulAcceleventsRows,
    airtableRows,
  ] = await Promise.all([
    database.select({ status: cfpForms.status, opensAt: cfpForms.opensAt, closesAt: cfpForms.closesAt })
      .from(cfpForms).where(eq(cfpForms.eventId, event.id)),
    database.select({ id: submissions.id, title: submissions.title, state: submissions.state, submittedAt: submissions.submittedAt, updatedAt: submissions.updatedAt })
      .from(submissions).where(eq(submissions.eventId, event.id)),
    database.select({ id: reviewAssignments.id, status: reviewAssignments.status, updatedAt: reviewAssignments.updatedAt })
      .from(reviewAssignments).innerJoin(reviewRounds, eq(reviewRounds.id, reviewAssignments.roundId))
      .where(eq(reviewRounds.eventId, event.id)),
    database.select({ id: reviewConflicts.id }).from(reviewConflicts)
      .where(and(eq(reviewConflicts.eventId, event.id), isNull(reviewConflicts.resolvedAt))),
    database.select({ id: decisions.id, outcome: decisions.outcome, notifiedAt: decisions.notifiedAt, decidedAt: decisions.decidedAt })
      .from(decisions).innerJoin(submissions, eq(submissions.id, decisions.submissionId))
      .where(eq(submissions.eventId, event.id)),
    database.select({
      id: eventSpeakers.id,
      displayName: people.displayName,
      status: eventSpeakers.status,
      employerApprovalStatus: eventSpeakers.employerApprovalStatus,
    })
      .from(eventSpeakers).innerJoin(people, eq(people.id, eventSpeakers.personId))
      .where(eq(eventSpeakers.eventId, event.id)),
    database.select({
      id: speakerTaskAssignments.id,
      eventSpeakerId: speakerTaskAssignments.eventSpeakerId,
      displayName: people.displayName,
      status: speakerTaskAssignments.status,
      dueAt: speakerTasks.dueAt,
      dueAtOverride: speakerTaskAssignments.dueAtOverride,
      completedAt: speakerTaskAssignments.completedAt,
    }).from(speakerTaskAssignments)
      .innerJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
      .innerJoin(eventSpeakers, eq(eventSpeakers.id, speakerTaskAssignments.eventSpeakerId))
      .innerJoin(people, eq(people.id, eventSpeakers.personId))
      .where(and(eq(speakerTasks.eventId, event.id), eq(eventSpeakers.eventId, event.id))),
    database.select({ id: deliverables.id, status: deliverables.status, dueAt: deliverables.dueAt, updatedAt: deliverables.updatedAt })
      .from(deliverables).where(eq(deliverables.eventId, event.id)),
    database.select({
      id: communicationRecipients.id,
      status: communicationRecipients.status,
      updatedAt: communicationRecipients.updatedAt,
      lastOutcomeAt: communicationRecipients.lastOutcomeAt,
    }).from(communicationRecipients)
      .innerJoin(communications, eq(communications.id, communicationRecipients.communicationId))
      .where(eq(communications.eventId, event.id)),
    database.select({ id: sessions.id }).from(sessions).where(eq(sessions.eventId, event.id)),
    database.select({ id: scheduleRevisions.id, version: scheduleRevisions.version, status: scheduleRevisions.status })
      .from(scheduleRevisions).where(eq(scheduleRevisions.eventId, event.id)).orderBy(desc(scheduleRevisions.version)).limit(1),
    database.select({ id: scheduleRevisions.id, version: scheduleRevisions.version, status: scheduleRevisions.status })
      .from(scheduleRevisions).where(and(eq(scheduleRevisions.eventId, event.id), eq(scheduleRevisions.status, "ready")))
      .orderBy(desc(scheduleRevisions.version)).limit(1),
    database.select({ state: publications.state, scheduleRevisionId: publications.scheduleRevisionId, publicRevision: publications.publicRevision, liveAt: publications.liveAt, updatedAt: publications.updatedAt })
      .from(publications).where(eq(publications.eventId, event.id)).limit(1),
    database.select({
      id: communicationRecipients.id,
      personId: communicationRecipients.personId,
      displayName: people.displayName,
      status: communicationRecipients.status,
      attemptCount: communicationRecipients.attemptCount,
      lastErrorCode: communicationRecipients.lastErrorCode,
      lastOutcomeAt: communicationRecipients.lastOutcomeAt,
      communicationCreatedAt: communications.createdAt,
    }).from(communicationRecipients)
      .innerJoin(communications, eq(communications.id, communicationRecipients.communicationId))
      .innerJoin(people, eq(people.id, communicationRecipients.personId))
      .where(and(eq(communications.eventId, event.id), eq(communications.name, "Speaker portal invitation")))
      .orderBy(desc(communications.createdAt)),
    database.select({
      eventSpeakerId: eventSpeakers.id,
      personId: eventSpeakers.personId,
      displayName: people.displayName,
      canonicalEmail: people.canonicalEmail,
      aliasPersonId: personEmailAliases.personId,
      membershipId: eventMemberships.id,
    }).from(eventSpeakers)
      .innerJoin(people, eq(people.id, eventSpeakers.personId))
      .leftJoin(personEmailAliases, sql`${personEmailAliases.normalizedEmail} = lower(trim(${people.canonicalEmail}))`)
      .leftJoin(eventMemberships, and(
        eq(eventMemberships.eventId, event.id),
        eq(eventMemberships.personId, eventSpeakers.personId),
        eq(eventMemberships.role, "speaker"),
      ))
      .where(and(eq(eventSpeakers.eventId, event.id), sql`${eventSpeakers.status} <> 'withdrawn'`)),
    database.select({
      id: outboxEvents.id,
      status: outboxEvents.status,
      attempts: outboxEvents.attempts,
      createdAt: outboxEvents.createdAt,
      updatedAt: outboxEvents.updatedAt,
    }).from(outboxEvents)
      .innerJoin(publications, eq(publications.id, outboxEvents.aggregateId))
      .where(and(eq(publications.eventId, event.id), eq(outboxEvents.eventType, "publication.went_live")))
      .orderBy(desc(outboxEvents.createdAt)),
    database.select({
      configurationId: acceleventsConfigurations.id,
      enabled: acceleventsConfigurations.enabled,
      runId: acceleventsSyncRuns.id,
      mode: acceleventsSyncRuns.mode,
      status: acceleventsSyncRuns.status,
      failedCount: acceleventsSyncRuns.failedCount,
      providerResponded: acceleventsSyncRuns.providerResponded,
      failureCode: acceleventsSyncRuns.failureCode,
      createdAt: acceleventsSyncRuns.createdAt,
      completedAt: acceleventsSyncRuns.completedAt,
    }).from(acceleventsConfigurations)
      .leftJoin(acceleventsSyncRuns, eq(acceleventsSyncRuns.configurationId, acceleventsConfigurations.id))
      .where(eq(acceleventsConfigurations.eventId, event.id))
      .orderBy(desc(acceleventsSyncRuns.createdAt)).limit(1),
    database.select({ id: acceleventsSyncRuns.id, createdAt: acceleventsSyncRuns.createdAt })
      .from(acceleventsSyncRuns)
      .innerJoin(acceleventsConfigurations, eq(acceleventsConfigurations.id, acceleventsSyncRuns.configurationId))
      .where(and(
        eq(acceleventsConfigurations.eventId, event.id),
        eq(acceleventsSyncRuns.status, "succeeded"),
        inArray(acceleventsSyncRuns.mode, ["manual", "retry"]),
      )).orderBy(desc(acceleventsSyncRuns.createdAt)).limit(1),
    database.select({
      configurationId: airtableConfigurations.id,
      enabled: airtableConfigurations.enabled,
      runId: airtableSyncRuns.id,
      direction: airtableSyncRuns.direction,
      status: airtableSyncRuns.status,
      failedCount: airtableSyncRuns.failedCount,
      providerResponded: airtableSyncRuns.providerResponded,
      failureCode: airtableSyncRuns.failureCode,
      createdAt: airtableSyncRuns.createdAt,
      completedAt: airtableSyncRuns.completedAt,
    }).from(airtableConfigurations)
      .leftJoin(airtableSyncRuns, eq(airtableSyncRuns.configurationId, airtableConfigurations.id))
      .where(eq(airtableConfigurations.eventId, event.id))
      .orderBy(desc(airtableSyncRuns.createdAt)).limit(1),
  ]);

  const latestRevision = revisionRows[0] ?? null;
  const [placementRows, roomRows, sessionSpeakerRows] = latestRevision ? await Promise.all([
    database.select({
      id: placements.id,
      revisionId: placements.revisionId,
      sessionId: placements.sessionId,
      roomId: placements.roomId,
      startsAt: placements.startsAt,
      endsAt: placements.endsAt,
    }).from(placements).where(eq(placements.revisionId, latestRevision.id)),
    database.select({ id: eventRooms.id, name: eventRooms.name }).from(eventRooms).where(eq(eventRooms.eventId, event.id)),
    database.select({ sessionId: sessionSpeakers.sessionId, personId: eventSpeakers.personId, displayName: people.displayName })
      .from(sessionSpeakers)
      .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
      .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
      .innerJoin(people, eq(people.id, eventSpeakers.personId))
      .where(eq(sessions.eventId, event.id)),
  ]) : [[], [], []];

  return deriveDashboardSnapshot({
    id: event.id,
    organizationId: event.organizationId,
    slug: event.slug,
    name: event.name,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    timezone: event.timezone,
  }, {
    forms: formRows,
    submissions: submissionRows,
    reviewAssignments: assignmentRows,
    activeReviewConflicts: conflictRows,
    decisions: decisionRows,
    speakers: speakerRows,
    taskAssignments: taskRows,
    deliverables: deliverableRows,
    recipients: recipientRows,
    sessions: sessionRows,
    latestRevision,
    latestReadyRevision: latestReadyRevisionRows[0]
      ? { id: latestReadyRevisionRows[0].id, version: latestReadyRevisionRows[0].version, status: "ready" as const }
      : null,
    placements: placementRows,
    rooms: roomRows,
    sessionSpeakers: sessionSpeakerRows,
    publication: publicationRows[0] ?? null,
    portalInvitationRecipients: latestByPerson(portalInvitationRows),
    speakerIdentities: speakerIdentityRows.map((row) => ({
      eventSpeakerId: row.eventSpeakerId,
      personId: row.personId,
      displayName: row.displayName,
      canonicalEmail: row.canonicalEmail,
      aliasPersonId: row.aliasPersonId,
      hasSpeakerMembership: row.membershipId !== null,
    })),
    publicationHandoffs: publicationHandoffRows,
    accelevents: acceleventsRows[0] ? {
      enabled: acceleventsRows[0].enabled,
      latestRun: acceleventsRows[0].runId && acceleventsRows[0].mode && acceleventsRows[0].status && acceleventsRows[0].createdAt
        ? {
            id: acceleventsRows[0].runId,
            mode: acceleventsRows[0].mode,
            status: acceleventsRows[0].status,
            failedCount: acceleventsRows[0].failedCount ?? 0,
            providerResponded: acceleventsRows[0].providerResponded ?? false,
            failureCode: acceleventsRows[0].failureCode,
            createdAt: acceleventsRows[0].createdAt,
            completedAt: acceleventsRows[0].completedAt,
          }
        : null,
      latestSuccessfulLiveRun: successfulAcceleventsRows[0] ?? null,
    } : null,
    airtable: airtableRows[0] ? {
      enabled: airtableRows[0].enabled,
      latestRun: airtableRows[0].runId && airtableRows[0].direction && airtableRows[0].status && airtableRows[0].createdAt
        ? {
            id: airtableRows[0].runId,
            direction: airtableRows[0].direction,
            status: airtableRows[0].status,
            failedCount: airtableRows[0].failedCount ?? 0,
            providerResponded: airtableRows[0].providerResponded ?? false,
            failureCode: airtableRows[0].failureCode,
            createdAt: airtableRows[0].createdAt,
            completedAt: airtableRows[0].completedAt,
          }
        : null,
    } : null,
  }, now);
}

function latestByPerson<T extends { personId: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) if (!latest.has(row.personId)) latest.set(row.personId, row);
  return [...latest.values()];
}

export function deriveDashboardSnapshot(
  event: DashboardSnapshot["event"],
  rows: DashboardRows,
  now: Date,
): DashboardSnapshot {
  const submitted = rows.submissions.filter((submission) => submission.state === "submitted");
  const completedReviews = rows.reviewAssignments.filter((assignment) => assignment.status === "submitted").length;
  const recusedReviews = rows.reviewAssignments.filter((assignment) => assignment.status === "recused").length;
  const completableReviews = rows.reviewAssignments.length - recusedReviews;
  const outstandingReviews = rows.reviewAssignments.filter((assignment) => assignment.status === "assigned" || assignment.status === "in_progress").length;
  const overdue = (dueAt: Date | null, complete: boolean) => !complete && Boolean(dueAt && dueAt.getTime() < now.getTime());

  const taskProgress = new Map<string, { eventSpeakerId: string; displayName: string; completed: number; total: number; overdue: number }>();
  for (const assignment of rows.taskAssignments) {
    const progress = taskProgress.get(assignment.eventSpeakerId) ?? {
      eventSpeakerId: assignment.eventSpeakerId,
      displayName: assignment.displayName,
      completed: 0,
      total: 0,
      overdue: 0,
    };
    progress.total += 1;
    if (assignment.status === "complete") progress.completed += 1;
    if (overdue(assignment.dueAtOverride ?? assignment.dueAt, assignment.status === "complete")) progress.overdue += 1;
    taskProgress.set(assignment.eventSpeakerId, progress);
  }
  const attention = [...taskProgress.values()]
    .filter((speaker) => speaker.completed < speaker.total)
    .sort((left, right) => right.overdue - left.overdue || (right.total - right.completed) - (left.total - left.completed) || left.displayName.localeCompare(right.displayName));

  const scheduleSessions: ScheduleSession[] = rows.sessions.map((session) => ({
    id: session.id,
    title: "",
    trackId: null,
    trackName: null,
    formatName: null,
    durationMinutes: 0,
    speakers: rows.sessionSpeakers.filter((speaker) => speaker.sessionId === session.id).map((speaker) => ({ personId: speaker.personId, displayName: speaker.displayName })),
  }));
  const schedulePlacements: SchedulePlacement[] = rows.placements.map((placement) => ({
    ...placement,
    startsAt: placement.startsAt.toISOString(),
    endsAt: placement.endsAt.toISOString(),
  }));
  const scheduleRooms: ScheduleRoom[] = rows.rooms.map((room, sortOrder) => ({ ...room, sortOrder }));
  const conflicts = deriveScheduleConflicts(scheduleSessions, schedulePlacements, scheduleRooms).length;
  const scheduled = new Set(rows.placements.map((placement) => placement.sessionId)).size;
  const unscheduled = Math.max(rows.sessions.length - scheduled, 0);
  const agendaReadiness = rows.sessions.length === 0
    ? 0
    : Math.max(0, Math.round(((scheduled - conflicts) / rows.sessions.length) * 100));

  const successfulRecipients = rows.recipients.filter((recipient) => recipient.status === "accepted" || recipient.status === "delivered").length;
  const inFlightRecipients = rows.recipients.filter((recipient) => recipient.status === "queued" || recipient.status === "sending").length;
  const failedRecipients = rows.recipients.filter((recipient) => recipient.status === "bounced" || recipient.status === "failed" || recipient.status === "blocked_external").length;
  const acceptedSpeakers = rows.speakers.filter((speaker) => speaker.status !== "withdrawn");
  const approvedDeliverables = rows.deliverables.filter((deliverable) => deliverable.status === "approved").length;
  const cfpStatus = deriveCfpStatus(rows.forms, now);

  return {
    event,
    generatedAt: now.toISOString(),
    cfp: {
      status: cfpStatus,
      forms: rows.forms.length,
      drafts: rows.submissions.length - submitted.length,
      submitted: submitted.length,
      submittedTrend: submittedTrend(submitted, now, 14),
    },
    reviews: {
      assigned: rows.reviewAssignments.length,
      completed: completedReviews,
      recused: recusedReviews,
      outstanding: outstandingReviews,
      percentComplete: completableReviews === 0 ? 0 : Math.round((completedReviews / completableReviews) * 100),
      activeConflicts: rows.activeReviewConflicts.length,
    },
    decisions: {
      undecided: Math.max(submitted.length - rows.decisions.length, 0),
      accepted: rows.decisions.filter((decision) => decision.outcome === "accepted").length,
      rejected: rows.decisions.filter((decision) => decision.outcome === "rejected").length,
      notified: rows.decisions.filter((decision) => decision.notifiedAt !== null).length,
    },
    speakers: {
      accepted: acceptedSpeakers.length,
      ready: acceptedSpeakers.filter((speaker) => speaker.status === "ready").length,
      needingAttention: attention.length,
      tasks: {
        total: rows.taskAssignments.length,
        completed: rows.taskAssignments.filter((assignment) => assignment.status === "complete").length,
        overdue: rows.taskAssignments.filter((assignment) => overdue(assignment.dueAtOverride ?? assignment.dueAt, assignment.status === "complete")).length,
      },
      attention: attention.slice(0, 6),
    },
    deliverables: {
      total: rows.deliverables.length,
      approved: approvedDeliverables,
      outstanding: rows.deliverables.length - approvedDeliverables,
      overdue: rows.deliverables.filter((deliverable) => overdue(deliverable.dueAt, deliverable.status === "approved")).length,
      awaitingReview: rows.deliverables.filter((deliverable) => deliverable.status === "submitted").length,
      changesRequested: rows.deliverables.filter((deliverable) => deliverable.status === "changes_requested").length,
    },
    communications: {
      recipients: rows.recipients.length,
      successful: successfulRecipients,
      inFlight: inFlightRecipients,
      failed: failedRecipients,
      deliveryRate: rows.recipients.length === 0 ? 0 : Math.round((successfulRecipients / rows.recipients.length) * 100),
    },
    agenda: {
      revisionId: rows.latestRevision?.id ?? null,
      revisionVersion: rows.latestRevision?.version ?? null,
      revisionStatus: rows.latestRevision?.status ?? null,
      sessions: rows.sessions.length,
      scheduled,
      unscheduled,
      conflicts,
      percentReady: agendaReadiness,
    },
    publication: {
      state: rows.publication?.state ?? "draft",
      scheduleRevisionId: rows.publication?.scheduleRevisionId ?? null,
      publicRevision: rows.publication?.publicRevision ?? 0,
      liveAt: rows.publication?.liveAt?.toISOString() ?? null,
      updatedAt: rows.publication?.updatedAt.toISOString() ?? null,
    },
    readiness: deriveProgramReadiness(rows),
    activity: recentActivity(rows),
  };
}

function deriveProgramReadiness(rows: DashboardRows): DashboardSnapshot["readiness"] {
  const exceptions: ProgramReadinessException[] = [];
  const failedRecipientStatuses = new Set(["bounced", "failed", "blocked_external"]);
  for (const recipient of rows.portalInvitationRecipients) {
    if (!failedRecipientStatuses.has(recipient.status)) continue;
    exceptions.push({
      id: `portal_invitation_failed:${recipient.id}`,
      code: "portal_invitation_failed",
      severity: "blocker",
      title: `${recipient.displayName} may not have received portal access`,
      detail: "The latest speaker portal invitation has a terminal delivery failure.",
      affectedCount: 1,
      workspace: "communications",
      sourceId: recipient.id,
      proof: {
        sourceType: "communication_recipient",
        status: recipient.status,
        occurredAt: recipient.lastOutcomeAt?.toISOString() ?? null,
        facts: { attemptCount: recipient.attemptCount, failureCode: recipient.lastErrorCode },
      },
    });
  }

  for (const identity of rows.speakerIdentities) {
    const aliasMismatch = Boolean(identity.aliasPersonId && identity.aliasPersonId !== identity.personId);
    const missingResolution = !identity.canonicalEmail || !identity.aliasPersonId;
    if (!aliasMismatch && !missingResolution && identity.hasSpeakerMembership) continue;
    exceptions.push({
      id: `portal_identity_conflict:${identity.eventSpeakerId}`,
      code: "portal_identity_conflict",
      severity: "blocker",
      title: `${identity.displayName} has a portal identity conflict`,
      detail: "The canonical speaker record, normalized email alias, and speaker membership do not resolve to one person.",
      affectedCount: 1,
      workspace: "speaker_crm",
      sourceId: identity.eventSpeakerId,
      proof: {
        sourceType: "event_speaker",
        status: aliasMismatch ? "alias_person_mismatch" : missingResolution ? "email_alias_missing" : "speaker_membership_missing",
        occurredAt: null,
        facts: {
          aliasMatchesPerson: !aliasMismatch && !missingResolution,
          speakerMembershipPresent: identity.hasSpeakerMembership,
        },
      },
    });
  }

  const employerApprovalPending = rows.speakers.filter((speaker) =>
    speaker.status !== "withdrawn" && speaker.employerApprovalStatus === "pending");
  if (employerApprovalPending.length) {
    const first = employerApprovalPending[0];
    if (!first) throw new Error("Employer approval readiness requires at least one pending speaker.");
    exceptions.push({
      id: `employer_approval_pending:${first.id}`,
      code: "employer_approval_pending",
      severity: "warning",
      title: `${employerApprovalPending.length} speaker${employerApprovalPending.length === 1 ? " is" : "s are"} awaiting employer approval`,
      detail: "Participation is not yet confirmed. Review prior contact and draft a human-approved follow-up.",
      affectedCount: employerApprovalPending.length,
      workspace: "communications",
      sourceId: first.id,
      proof: {
        sourceType: "event_speaker",
        status: "employer_approval_pending",
        occurredAt: null,
        facts: { pendingCount: employerApprovalPending.length },
      },
    });
  }

  const latestHandoff = rows.publicationHandoffs[0];
  if (latestHandoff && (latestHandoff.status === "failed" || latestHandoff.status === "dead_letter")) {
    exceptions.push({
      id: `publication_handoff_failed:${latestHandoff.id}`,
      code: "publication_handoff_failed",
      severity: "blocker",
      title: "The latest publication handoff failed",
      detail: "The public state changed, but its downstream calendar handoff has not dispatched successfully.",
      affectedCount: 1,
      workspace: "publishing",
      sourceId: latestHandoff.id,
      proof: {
        sourceType: "outbox_event",
        status: latestHandoff.status,
        occurredAt: latestHandoff.updatedAt.toISOString(),
        facts: { attempts: latestHandoff.attempts },
      },
    });
  }

  if (rows.publication?.state === "live" && rows.latestReadyRevision && rows.publication.scheduleRevisionId !== rows.latestReadyRevision.id) {
    exceptions.push({
      id: `publication_behind_ready_revision:${rows.latestReadyRevision.id}`,
      code: "publication_behind_ready_revision",
      severity: "warning",
      title: "A newer ready schedule revision is not live",
      detail: `Public revision ${rows.publication.publicRevision} does not use Scheduling revision ${rows.latestReadyRevision.version}.`,
      affectedCount: 1,
      workspace: "publishing",
      sourceId: rows.latestReadyRevision.id,
      proof: {
        sourceType: "schedule_revision",
        status: "ready_not_published",
        occurredAt: rows.publication.updatedAt.toISOString(),
        facts: { readyRevisionVersion: rows.latestReadyRevision.version, publicRevision: rows.publication.publicRevision },
      },
    });
  }

  const acceleventsRun = rows.accelevents?.enabled ? rows.accelevents.latestRun : null;
  if (acceleventsRun && ["partial", "failed", "blocked_external"].includes(acceleventsRun.status)) {
    exceptions.push({
      id: `accelevents_run_failed:${acceleventsRun.id}`,
      code: "accelevents_run_failed",
      severity: "blocker",
      title: "The latest Accelevents run needs attention",
      detail: `${acceleventsRun.failedCount} canonical record${acceleventsRun.failedCount === 1 ? "" : "s"} did not synchronize.`,
      affectedCount: acceleventsRun.failedCount,
      workspace: "accelevents",
      sourceId: acceleventsRun.id,
      proof: {
        sourceType: "accelevents_run",
        status: acceleventsRun.status,
        occurredAt: (acceleventsRun.completedAt ?? acceleventsRun.createdAt).toISOString(),
        facts: { failedCount: acceleventsRun.failedCount, providerResponded: acceleventsRun.providerResponded, failureCode: acceleventsRun.failureCode },
      },
    });
  }
  const successfulAcceleventsRun = rows.accelevents?.enabled ? rows.accelevents.latestSuccessfulLiveRun : null;
  if (rows.publication?.state === "live" && successfulAcceleventsRun && successfulAcceleventsRun.createdAt < rows.publication.updatedAt) {
    exceptions.push({
      id: `accelevents_out_of_date:${successfulAcceleventsRun.id}`,
      code: "accelevents_out_of_date",
      severity: "warning",
      title: "Accelevents predates the live program",
      detail: "The last successful live synchronization occurred before the current public revision.",
      affectedCount: 1,
      workspace: "accelevents",
      sourceId: successfulAcceleventsRun.id,
      proof: {
        sourceType: "accelevents_run",
        status: "out_of_date",
        occurredAt: successfulAcceleventsRun.createdAt.toISOString(),
        facts: { publicRevision: rows.publication.publicRevision },
      },
    });
  }

  const airtableRun = rows.airtable?.enabled ? rows.airtable.latestRun : null;
  if (airtableRun && ["partial", "failed", "blocked_external"].includes(airtableRun.status)) {
    exceptions.push({
      id: `airtable_run_failed:${airtableRun.id}`,
      code: "airtable_run_failed",
      severity: "warning",
      title: "The latest Airtable run needs attention",
      detail: `${airtableRun.failedCount} ${airtableRun.direction} item${airtableRun.failedCount === 1 ? "" : "s"} failed.`,
      affectedCount: airtableRun.failedCount,
      workspace: "airtable",
      sourceId: airtableRun.id,
      proof: {
        sourceType: "airtable_run",
        status: airtableRun.status,
        occurredAt: (airtableRun.completedAt ?? airtableRun.createdAt).toISOString(),
        facts: { direction: airtableRun.direction, failedCount: airtableRun.failedCount, providerResponded: airtableRun.providerResponded, failureCode: airtableRun.failureCode },
      },
    });
  }

  const priority: Record<ProgramReadinessException["code"], number> = {
    portal_invitation_failed: 10,
    portal_identity_conflict: 20,
    employer_approval_pending: 25,
    publication_handoff_failed: 30,
    publication_behind_ready_revision: 40,
    accelevents_run_failed: 50,
    accelevents_out_of_date: 60,
    airtable_run_failed: 70,
  };
  exceptions.sort((left, right) => priority[left.code] - priority[right.code] || left.id.localeCompare(right.id));
  return { status: exceptions.length ? "needs_attention" : "ready", exceptions };
}

function deriveCfpStatus(forms: DashboardRows["forms"], now: Date): DashboardSnapshot["cfp"]["status"] {
  if (forms.length === 0) return "not_configured";
  if (forms.some((form) => form.status === "published" && (!form.opensAt || form.opensAt <= now) && (!form.closesAt || form.closesAt > now))) return "open";
  if (forms.some((form) => form.status === "closed" || (form.closesAt && form.closesAt <= now))) return "closed";
  return "draft";
}

function submittedTrend(submitted: DashboardRows["submissions"], now: Date, days: number) {
  const result: Array<{ day: string; count: number }> = [];
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ((days - 1) * 86_400_000);
  const counts = new Map<string, number>();
  for (const submission of submitted) {
    if (!submission.submittedAt) continue;
    const day = submission.submittedAt.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start + (offset * 86_400_000)).toISOString().slice(0, 10);
    result.push({ day, count: counts.get(day) ?? 0 });
  }
  return result;
}

function recentActivity(rows: DashboardRows): DashboardSnapshot["activity"] {
  return [
    ...rows.submissions.filter((row) => row.state === "submitted" && row.submittedAt).map((row) => ({ id: `submission:${row.id}`, kind: "submission" as const, title: row.title, detail: "Proposal submitted", occurredAt: row.submittedAt!.toISOString() })),
    ...rows.reviewAssignments.filter((row) => row.status === "submitted").map((row) => ({ id: `review:${row.id}`, kind: "review" as const, title: "Review completed", detail: "An assigned review was submitted", occurredAt: row.updatedAt.toISOString() })),
    ...rows.decisions.map((row) => ({ id: `decision:${row.id}`, kind: "decision" as const, title: `${row.outcome === "accepted" ? "Accepted" : "Rejected"} decision recorded`, detail: row.notifiedAt ? "Submitter notified" : "Notification outstanding", occurredAt: row.decidedAt.toISOString() })),
    ...rows.taskAssignments.filter((row) => row.completedAt).map((row) => ({ id: `task:${row.id}`, kind: "task" as const, title: `${row.displayName} completed onboarding`, detail: "Speaker task completed", occurredAt: row.completedAt!.toISOString() })),
    ...rows.deliverables.filter((row) => row.status !== "pending").map((row) => ({ id: `deliverable:${row.id}`, kind: "deliverable" as const, title: `Deliverable ${row.status.replace("_", " ")}`, detail: "Speaker content workflow updated", occurredAt: row.updatedAt.toISOString() })),
    ...rows.recipients.filter((row) => row.lastOutcomeAt).map((row) => ({ id: `communication:${row.id}`, kind: "communication" as const, title: communicationActivityTitle(row.status), detail: row.status === "blocked_external" ? "Connect an email provider, then retry this recipient" : "Recipient outcome recorded", occurredAt: row.lastOutcomeAt!.toISOString() })),
    ...(rows.publication ? [{ id: "publication", kind: "publication" as const, title: rows.publication.state === "live" ? "Public program is live" : `Publication ${rows.publication.state}`, detail: `Public revision ${rows.publication.publicRevision}`, occurredAt: rows.publication.updatedAt.toISOString() }] : []),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 8);
}

function communicationActivityTitle(status: DashboardRows["recipients"][number]["status"]) {
  if (status === "blocked_external") return "Email delivery needs setup";
  if (status === "accepted") return "Message sent to email provider";
  return `Communication ${status.replace("_", " ")}`;
}
