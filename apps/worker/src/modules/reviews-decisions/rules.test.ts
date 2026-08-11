import { describe, expect, it } from "vitest";
import {
  buildConflictAwareDistribution,
  calculateWeightedScore,
  conflictKey,
  ReviewRuleError,
  toReviewResultsCsv,
  validateReviewPlan,
} from "./rules";
import type { ReviewCriterion } from "./types";

const scorecard: ReviewCriterion[] = [
  { key: "depth", label: "Technical depth", type: "numeric", required: true, weight: 60, min: 1, max: 5 },
  { key: "value", label: "Audience value", type: "dropdown", required: true, weight: 40, options: [{ label: "Good", score: 70 }, { label: "Excellent", score: 100 }] },
  { key: "note", label: "Reviewer note", type: "free_text", required: true, weight: 0 },
];

describe("review scorecard rules", () => {
  it("normalizes numeric and dropdown criteria into the configured weighted score", () => {
    expect(calculateWeightedScore(scorecard, { depth: 4, value: "Excellent", note: "Clear evidence" }, true)).toBe(85);
  });

  it("allows incomplete drafts but blocks finalization until every required response exists", () => {
    expect(calculateWeightedScore(scorecard, { depth: 3 }, false)).toBe(50);
    expect(() => calculateWeightedScore(scorecard, { depth: 3 }, true)).toThrowError(ReviewRuleError);
  });

  it("requires two independently dated, valid rounds", () => {
    expect(() => validateReviewPlan([{ name: "Only round", opensAt: "2027-01-01T00:00:00.000Z", closesAt: "2027-01-02T00:00:00.000Z", scorecard }]))
      .toThrow("at least two independent rounds");
  });
});

describe("conflict-aware distribution", () => {
  it("balances load while respecting conflicts and per-reviewer caps", () => {
    const assignments = buildConflictAwareDistribution({
      submissionIds: ["submission-a", "submission-b", "submission-c"],
      reviewers: [
        { personId: "reviewer-a", assignmentCap: 2, existingAssignments: 0 },
        { personId: "reviewer-b", assignmentCap: 2, existingAssignments: 0 },
      ],
      conflictKeys: new Set([conflictKey("submission-a", "reviewer-a")]),
    });
    expect(assignments).toEqual([
      { submissionId: "submission-a", reviewerPersonId: "reviewer-b" },
      { submissionId: "submission-b", reviewerPersonId: "reviewer-a" },
      { submissionId: "submission-c", reviewerPersonId: "reviewer-a" },
    ]);
  });

  it("fails visibly instead of assigning a conflicted or over-cap reviewer", () => {
    expect(() => buildConflictAwareDistribution({
      submissionIds: ["submission-a"],
      reviewers: [{ personId: "reviewer-a", assignmentCap: 1, existingAssignments: 1 }],
      conflictKeys: new Set(),
    })).toThrow("No conflict-free reviewer with remaining capacity");
  });
});

it("exports organizer-visible co-author roles and exact aggregates as parseable CSV", () => {
  const csv = toReviewResultsCsv([{
    submissionId: "submission-a",
    title: "Reliable Agents, Without Vibes",
    participants: [{ name: "Priya Raman", role: "author" }, { name: "Leah Park", role: "co_author" }],
    assigned: 2,
    submitted: 2,
    recused: 0,
    aggregateScore: 87.25,
    decision: "accepted",
  }]);
  expect(csv).toContain('"Reliable Agents, Without Vibes"');
  expect(csv).toContain("Leah Park (co_author)");
  expect(csv).toContain("87.25,accepted");
});
