import type { DistributionInput, ReviewCriterion, ReviewResultRow } from "./types";

export class ReviewRuleError extends Error {
  constructor(
    readonly code:
      | "invalid_review_plan"
      | "invalid_scorecard"
      | "incomplete_scorecard"
      | "invalid_scorecard_answer"
      | "routing_mismatch"
      | "no_conflict_free_assignment",
    message: string,
  ) {
    super(message);
  }
}

export function validateReviewPlan(rounds: ReadonlyArray<{
  name: string;
  opensAt: string;
  closesAt: string;
  scorecard: ReadonlyArray<ReviewCriterion>;
}>): void {
  if (rounds.length < 2) {
    throw new ReviewRuleError("invalid_review_plan", "An evaluation plan requires at least two independent rounds.");
  }
  const names = new Set<string>();
  for (const round of rounds) {
    const normalizedName = round.name.trim().toLocaleLowerCase();
    if (!normalizedName || names.has(normalizedName)) {
      throw new ReviewRuleError("invalid_review_plan", "Review round names must be non-empty and unique.");
    }
    names.add(normalizedName);
    const opensAt = new Date(round.opensAt);
    const closesAt = new Date(round.closesAt);
    if (Number.isNaN(opensAt.valueOf()) || Number.isNaN(closesAt.valueOf()) || opensAt >= closesAt) {
      throw new ReviewRuleError("invalid_review_plan", `Round “${round.name}” must close after it opens.`);
    }
    validateScorecard(round.scorecard);
  }
}

export function validateScorecard(criteria: ReadonlyArray<ReviewCriterion>): void {
  if (criteria.length === 0) {
    throw new ReviewRuleError("invalid_scorecard", "A review round needs at least one scorecard criterion.");
  }
  const keys = new Set<string>();
  let scoringWeight = 0;
  for (const criterion of criteria) {
    if (!criterion.key.trim() || keys.has(criterion.key)) {
      throw new ReviewRuleError("invalid_scorecard", "Scorecard criterion keys must be non-empty and unique.");
    }
    keys.add(criterion.key);
    if (!criterion.label.trim()) {
      throw new ReviewRuleError("invalid_scorecard", `Criterion “${criterion.key}” needs a label.`);
    }
    if (criterion.type === "numeric") {
      if (criterion.min >= criterion.max || criterion.weight <= 0) {
        throw new ReviewRuleError("invalid_scorecard", `Numeric criterion “${criterion.label}” needs a valid range and positive weight.`);
      }
      scoringWeight += criterion.weight;
    } else if (criterion.type === "dropdown") {
      if (criterion.weight < 0 || criterion.options.length < 2 || criterion.options.some((option) => option.score < 0 || option.score > 100)) {
        throw new ReviewRuleError("invalid_scorecard", `Dropdown criterion “${criterion.label}” needs two scored options and a non-negative weight.`);
      }
      scoringWeight += criterion.weight;
    } else if (criterion.weight !== 0) {
      throw new ReviewRuleError("invalid_scorecard", "Free-text criteria cannot affect the numeric aggregate.");
    }
  }
  if (scoringWeight <= 0) {
    throw new ReviewRuleError("invalid_scorecard", "A scorecard needs at least one weighted numeric or dropdown criterion.");
  }
}

export function calculateWeightedScore(
  criteria: ReadonlyArray<ReviewCriterion>,
  answers: Readonly<Record<string, unknown>>,
  requireComplete: boolean,
): number | null {
  let weightedTotal = 0;
  let answeredWeight = 0;
  for (const criterion of criteria) {
    const answer = answers[criterion.key];
    const missing = answer === undefined || answer === null || answer === "";
    if (missing) {
      if (requireComplete && criterion.required) {
        throw new ReviewRuleError("incomplete_scorecard", `“${criterion.label}” is required before finalizing.`);
      }
      continue;
    }
    if (criterion.type === "free_text") {
      if (typeof answer !== "string") {
        throw new ReviewRuleError("invalid_scorecard_answer", `“${criterion.label}” must be text.`);
      }
      continue;
    }
    if (criterion.type === "numeric") {
      if (typeof answer !== "number" || !Number.isFinite(answer) || answer < criterion.min || answer > criterion.max) {
        throw new ReviewRuleError("invalid_scorecard_answer", `“${criterion.label}” must be between ${criterion.min} and ${criterion.max}.`);
      }
      const normalized = ((answer - criterion.min) / (criterion.max - criterion.min)) * 100;
      weightedTotal += normalized * criterion.weight;
      answeredWeight += criterion.weight;
      continue;
    }
    if (typeof answer !== "string") {
      throw new ReviewRuleError("invalid_scorecard_answer", `“${criterion.label}” must be one of its configured options.`);
    }
    const option = criterion.options.find((candidate) => candidate.label === answer);
    if (!option) {
      throw new ReviewRuleError("invalid_scorecard_answer", `“${criterion.label}” must be one of its configured options.`);
    }
    weightedTotal += option.score * criterion.weight;
    answeredWeight += criterion.weight;
  }
  return answeredWeight === 0 ? null : Math.round((weightedTotal / answeredWeight) * 100) / 100;
}

export function buildConflictAwareDistribution(input: DistributionInput): Array<{ submissionId: string; reviewerPersonId: string }> {
  const reviewers = input.reviewers.map((reviewer) => ({ ...reviewer, assignedNow: 0 }));
  const assignments: Array<{ submissionId: string; reviewerPersonId: string }> = [];
  for (const submissionId of input.submissionIds) {
    const eligible = reviewers
      .filter((reviewer) => !input.conflictKeys.has(conflictKey(submissionId, reviewer.personId)))
      .filter((reviewer) => reviewer.assignmentCap === null || reviewer.existingAssignments + reviewer.assignedNow < reviewer.assignmentCap)
      .sort((left, right) =>
        (left.existingAssignments + left.assignedNow) - (right.existingAssignments + right.assignedNow)
        || left.personId.localeCompare(right.personId),
      );
    const reviewer = eligible[0];
    if (!reviewer) {
      throw new ReviewRuleError("no_conflict_free_assignment", `No conflict-free reviewer with remaining capacity can review submission ${submissionId}.`);
    }
    reviewer.assignedNow += 1;
    assignments.push({ submissionId, reviewerPersonId: reviewer.personId });
  }
  return assignments;
}

export function assertSubmissionRouting(
  poolRoutingKeys: ReadonlyArray<string>,
  submissions: ReadonlyArray<{ routingKey: string | null }>,
): void {
  if (poolRoutingKeys.length === 0) return;
  const allowed = new Set(poolRoutingKeys);
  if (submissions.some((submission) => !submission.routingKey || !allowed.has(submission.routingKey))) {
    throw new ReviewRuleError("routing_mismatch", "At least one submission is not routed to this review round's reviewer pool.");
  }
}

export function conflictKey(submissionId: string, reviewerPersonId: string): string {
  return `${submissionId}:${reviewerPersonId}`;
}

export function toReviewResultsCsv(rows: ReadonlyArray<ReviewResultRow>): string {
  const header = ["submission_id", "title", "participants", "assigned", "submitted", "recused", "aggregate_score", "decision"];
  const body = rows.map((row) => [
    row.submissionId,
    row.title,
    row.participants.map((participant) => `${participant.name} (${participant.role})`).join("; "),
    row.assigned,
    row.submitted,
    row.recused,
    row.aggregateScore ?? "",
    row.decision ?? "",
  ].map(csvCell).join(","));
  return [header.join(","), ...body].join("\r\n");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
