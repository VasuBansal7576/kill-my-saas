import { describe, expect, it } from "vitest";
import { deriveDashboardSnapshot } from "./service";
import type { DashboardRows } from "./types";

const event = {
  id: "event-1",
  slug: "devflow-conf-2027",
  name: "DevFlow Conf 2027",
  startsOn: "2027-05-12",
  endsOn: "2027-05-14",
  timezone: "America/Los_Angeles",
};

describe("organizer dashboard metric definitions", () => {
  it("derives requirement-critical progress, overdue, outcome, and trend metrics from persisted rows", () => {
    const now = new Date("2027-05-10T12:00:00.000Z");
    const rows = emptyRows();
    rows.forms.push({ status: "published", opensAt: new Date("2027-01-01T00:00:00.000Z"), closesAt: new Date("2027-05-11T00:00:00.000Z") });
    rows.submissions.push(
      { id: "draft", title: "Draft", state: "draft", submittedAt: null, updatedAt: now },
      { id: "one", title: "One", state: "submitted", submittedAt: new Date("2027-05-09T12:00:00.000Z"), updatedAt: now },
      { id: "two", title: "Two", state: "submitted", submittedAt: new Date("2027-05-09T18:00:00.000Z"), updatedAt: now },
      { id: "three", title: "Three", state: "submitted", submittedAt: new Date("2027-05-10T01:00:00.000Z"), updatedAt: now },
    );
    rows.reviewAssignments.push(
      { id: "complete", status: "submitted", updatedAt: now },
      { id: "open", status: "in_progress", updatedAt: now },
      { id: "recused", status: "recused", updatedAt: now },
    );
    rows.activeReviewConflicts.push({ id: "conflict" });
    rows.decisions.push({ id: "decision", outcome: "accepted", notifiedAt: null, decidedAt: now });
    rows.speakers.push(
      { id: "speaker-1", displayName: "Priya Raman", status: "onboarding" },
      { id: "speaker-2", displayName: "Sam Ready", status: "ready" },
      { id: "speaker-3", displayName: "Withdrawn", status: "withdrawn" },
    );
    rows.taskAssignments.push(
      { id: "task-1", eventSpeakerId: "speaker-1", displayName: "Priya Raman", status: "pending", dueAt: new Date("2027-05-09T12:00:00.000Z"), dueAtOverride: null, completedAt: null },
      { id: "task-2", eventSpeakerId: "speaker-1", displayName: "Priya Raman", status: "complete", dueAt: new Date("2027-05-08T12:00:00.000Z"), dueAtOverride: null, completedAt: new Date("2027-05-08T10:00:00.000Z") },
      { id: "task-3", eventSpeakerId: "speaker-2", displayName: "Sam Ready", status: "pending", dueAt: new Date("2027-05-01T12:00:00.000Z"), dueAtOverride: new Date("2027-05-12T12:00:00.000Z"), completedAt: null },
    );
    rows.deliverables.push(
      { id: "file-1", status: "submitted", dueAt: new Date("2027-05-09T12:00:00.000Z"), updatedAt: now },
      { id: "file-2", status: "approved", dueAt: new Date("2027-05-01T12:00:00.000Z"), updatedAt: now },
    );
    rows.recipients.push(
      { id: "mail-1", status: "delivered", updatedAt: now, lastOutcomeAt: now },
      { id: "mail-2", status: "accepted", updatedAt: now, lastOutcomeAt: now },
      { id: "mail-3", status: "bounced", updatedAt: now, lastOutcomeAt: now },
      { id: "mail-4", status: "queued", updatedAt: now, lastOutcomeAt: null },
    );
    rows.integrationRuns.push(
      { provider: "airtable", status: "partial", failedItems: 3 },
      { provider: "accelevents", status: "succeeded", failedItems: 0 },
    );

    const dashboard = deriveDashboardSnapshot(event, rows, now);

    expect(dashboard.cfp).toMatchObject({ status: "open", drafts: 1, submitted: 3 });
    expect(dashboard.cfp.submittedTrend.slice(-2)).toEqual([
      { day: "2027-05-09", count: 2 },
      { day: "2027-05-10", count: 1 },
    ]);
    expect(dashboard.reviews).toMatchObject({ assigned: 3, completed: 1, recused: 1, outstanding: 1, percentComplete: 50, activeConflicts: 1 });
    expect(dashboard.decisions).toMatchObject({ undecided: 2, accepted: 1, rejected: 0, notified: 0 });
    expect(dashboard.speakers).toMatchObject({ accepted: 2, ready: 1, needingAttention: 2, tasks: { total: 3, completed: 1, overdue: 1 } });
    expect(dashboard.speakers.attention[0]).toMatchObject({ displayName: "Priya Raman", completed: 1, total: 2, overdue: 1 });
    expect(dashboard.deliverables).toMatchObject({ total: 2, approved: 1, outstanding: 1, overdue: 1, awaitingReview: 1, missing: 0 });
    expect(dashboard.communications).toEqual({ recipients: 4, successful: 1, inFlight: 2, failed: 1, deliveryRate: 25, undelivered: 3 });
    expect(dashboard.integrations).toEqual({ failures: 3, providers: [{ provider: "airtable", status: "partial", failedItems: 3 }] });
  });

  it("keeps provider-accepted recipients in flight until delivered evidence arrives", () => {
    const now = new Date("2027-05-10T12:00:00.000Z");
    const rows = emptyRows();
    rows.recipients.push(...Array.from({ length: 12 }, (_, index) => ({
      id: `accepted-${index + 1}`,
      status: "accepted" as const,
      updatedAt: now,
      lastOutcomeAt: now,
    })));

    expect(deriveDashboardSnapshot(event, rows, now).communications).toEqual({
      recipients: 12,
      successful: 0,
      inFlight: 12,
      failed: 0,
      deliveryRate: 0,
      undelivered: 12,
    });
  });

  it("counts room and shared-speaker overlaps while treating back-to-back placements as conflict-free", () => {
    const now = new Date("2027-05-10T12:00:00.000Z");
    const rows = emptyRows();
    rows.sessions.push({ id: "session-a" }, { id: "session-b" }, { id: "session-c" });
    rows.latestRevision = { id: "revision-1", version: 4, status: "draft" };
    rows.rooms.push({ id: "room-1", name: "Room 1" }, { id: "room-2", name: "Room 2" });
    rows.sessionSpeakers.push(
      { sessionId: "session-a", personId: "speaker-1", displayName: "Priya Raman" },
      { sessionId: "session-b", personId: "speaker-1", displayName: "Priya Raman" },
      { sessionId: "session-c", personId: "speaker-2", displayName: "Ava Brooks" },
    );
    rows.placements.push(
      { id: "place-a", revisionId: "revision-1", sessionId: "session-a", roomId: "room-1", startsAt: new Date("2027-05-12T17:00:00.000Z"), endsAt: new Date("2027-05-12T18:00:00.000Z") },
      { id: "place-b", revisionId: "revision-1", sessionId: "session-b", roomId: "room-2", startsAt: new Date("2027-05-12T17:30:00.000Z"), endsAt: new Date("2027-05-12T18:30:00.000Z") },
      { id: "place-c", revisionId: "revision-1", sessionId: "session-c", roomId: "room-2", startsAt: new Date("2027-05-12T18:30:00.000Z"), endsAt: new Date("2027-05-12T19:00:00.000Z") },
    );

    expect(deriveDashboardSnapshot(event, rows, now).agenda).toEqual({
      revisionId: "revision-1",
      revisionVersion: 4,
      revisionStatus: "draft",
      sessions: 3,
      scheduled: 3,
      unscheduled: 0,
      conflicts: 1,
      percentReady: 67,
    });
  });
});

function emptyRows(): DashboardRows {
  return {
    forms: [],
    submissions: [],
    reviewAssignments: [],
    activeReviewConflicts: [],
    decisions: [],
    speakers: [],
    taskAssignments: [],
    deliverables: [],
    recipients: [],
    sessions: [],
    latestRevision: null,
    placements: [],
    rooms: [],
    sessionSpeakers: [],
    publication: null,
    integrationRuns: [],
  };
}
