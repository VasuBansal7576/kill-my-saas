import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { organizerSubmissionAssignmentLabel, reviewerAssignmentsForFilter } from "./presentation";
import type { OrganizerReviewSubmission, ReviewerQueue } from "./types";

const assignment = (assignmentId: string, status: ReviewerQueue["assignments"][number]["status"]) => ({ assignmentId, status }) as ReviewerQueue["assignments"][number];

describe("reviewer queue presentation", () => {
  it("filters incomplete work without changing assignment status", () => {
    const assignments = [assignment("new", "assigned"), assignment("draft", "in_progress"), assignment("done", "submitted"), assignment("conflict", "recused")];
    expect(reviewerAssignmentsForFilter(assignments, "incomplete").map((item) => item.assignmentId)).toEqual(["new", "draft"]);
    expect(reviewerAssignmentsForFilter(assignments, "all")).toEqual(assignments);
  });

  it("exposes the current assignment and a compact mobile queue", () => {
    const page = readFileSync(new URL("./ReviewerQueuePage.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./reviewer-queue.css", import.meta.url), "utf8");
    expect(page).toContain("aria-current=");
    expect(page).toContain('aria-controls="review-assignment-detail"');
    expect(page).toContain('aria-label="Filter review assignments"');
    expect(css).toContain(".rd-queue-items {");
    expect(css).toContain("overflow-x: auto");
  });

  it("disambiguates duplicate organizer assignment titles with persisted identity and state", () => {
    const submission = {
      submissionId: "019b9cf7-12ab-7000-8000-123456789abc",
      title: "Same title",
      track: "Platform",
      routingKey: "platform",
      authorName: "Priya Raman",
      submittedAt: "2027-05-13T01:30:00.000Z",
      decision: null,
      assignments: [{ roundId: "round-1", reviewerName: "Sam Whitfield", status: "in_progress" }],
    } satisfies OrganizerReviewSubmission;

    const label = organizerSubmissionAssignmentLabel(submission, "round-1", "America/Los_Angeles");
    expect(label).toContain("Same title — Priya Raman · #019b9cf7");
    expect(label).toContain("May 12, 2027");
    expect(label).toContain("1 assigned · 1 in progress · No decision");
  });
});
