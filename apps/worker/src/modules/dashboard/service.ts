import {
  acceleventsSyncRuns,
  airtableSyncRuns,
  cfpForms,
  communicationRecipients,
  communications,
  decisions,
  deliverables,
  eventRooms,
  eventSpeakers,
  events,
  people,
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
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import { deliveryTruthForStatus } from "../communications/delivery-policy";
import { deriveScheduleConflicts } from "../scheduling/rules";
import type { SchedulePlacement, ScheduleRoom, ScheduleSession } from "../scheduling/types";
import type { DashboardRows, DashboardSnapshot } from "./types";

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
    publicationRows,
    airtableRunRows,
    acceleventsRunRows,
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
    database.select({ id: eventSpeakers.id, displayName: people.displayName, status: eventSpeakers.status })
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
    database.select({ state: publications.state, publicRevision: publications.publicRevision, liveAt: publications.liveAt, updatedAt: publications.updatedAt })
      .from(publications).where(eq(publications.eventId, event.id)).limit(1),
    database.select({ status: airtableSyncRuns.status, failedItems: airtableSyncRuns.failedCount })
      .from(airtableSyncRuns).where(eq(airtableSyncRuns.eventId, event.id)).orderBy(desc(airtableSyncRuns.createdAt)).limit(1),
    database.select({ status: acceleventsSyncRuns.status, failedItems: acceleventsSyncRuns.failedCount })
      .from(acceleventsSyncRuns).where(eq(acceleventsSyncRuns.eventId, event.id)).orderBy(desc(acceleventsSyncRuns.createdAt)).limit(1),
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
    placements: placementRows,
    rooms: roomRows,
    sessionSpeakers: sessionSpeakerRows,
    publication: publicationRows[0] ?? null,
    integrationRuns: [
      ...(airtableRunRows[0] ? [{ provider: "airtable" as const, ...airtableRunRows[0] }] : []),
      ...(acceleventsRunRows[0] ? [{ provider: "accelevents" as const, ...acceleventsRunRows[0] }] : []),
    ],
  }, now);
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

  const deliveredRecipients = rows.recipients.filter((recipient) => deliveryTruthForStatus(recipient.status) === "delivered").length;
  const inFlightRecipients = rows.recipients.filter((recipient) => deliveryTruthForStatus(recipient.status) === "in_flight").length;
  const failedRecipients = rows.recipients.filter((recipient) => deliveryTruthForStatus(recipient.status) === "failed").length;
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
      notificationPending: rows.decisions.filter((decision) => decision.notifiedAt === null).length,
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
      missing: rows.deliverables.filter((deliverable) => deliverable.status === "pending").length,
    },
    communications: {
      recipients: rows.recipients.length,
      successful: deliveredRecipients,
      inFlight: inFlightRecipients,
      failed: failedRecipients,
      deliveryRate: rows.recipients.length === 0 ? 0 : Math.round((deliveredRecipients / rows.recipients.length) * 100),
      undelivered: rows.recipients.length - deliveredRecipients,
    },
    integrations: {
      failures: rows.integrationRuns.filter((run) => ["partial", "failed", "blocked_external"].includes(run.status)).reduce((sum, run) => sum + Math.max(1, run.failedItems), 0),
      providers: rows.integrationRuns.filter((run) => ["partial", "failed", "blocked_external"].includes(run.status)),
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
      publicRevision: rows.publication?.publicRevision ?? 0,
      liveAt: rows.publication?.liveAt?.toISOString() ?? null,
      updatedAt: rows.publication?.updatedAt.toISOString() ?? null,
    },
    activity: recentActivity(rows),
  };
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
