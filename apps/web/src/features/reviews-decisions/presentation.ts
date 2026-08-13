import type { ReviewCriterion, ReviewerQueue } from "./types";

export type ReviewerQueueFilter = "all" | "incomplete";

export function reviewerAssignmentIsIncomplete(assignment: ReviewerQueue["assignments"][number]) {
  return assignment.status === "assigned" || assignment.status === "in_progress";
}

export function reviewerAssignmentsForFilter(assignments: ReviewerQueue["assignments"], filter: ReviewerQueueFilter) {
  return filter === "incomplete" ? assignments.filter(reviewerAssignmentIsIncomplete) : assignments;
}

export function reviewCriterionSummary(criterion: ReviewCriterion) {
  if (criterion.type === "numeric") return `Numeric rating · Weight ${criterion.weight} · Rating scale ${criterion.min} (minimum) to ${criterion.max} (maximum)`;
  if (criterion.type === "dropdown") return `Dropdown · Weight ${criterion.weight} · ${criterion.options.map((option) => `${option.label}: ${option.score}`).join(", ")}`;
  return "Written response · No score";
}

export function reviewerCriterionHelp(criterion: ReviewCriterion) {
  const requirement = criterion.required ? "Required" : "Optional";
  if (criterion.type === "numeric") return `${requirement} · Weight ${criterion.weight} · Rating scale ${criterion.min} (minimum) to ${criterion.max} (maximum)`;
  if (criterion.type === "dropdown") return `${requirement} · Weight ${criterion.weight} · Options: ${criterion.options.map((option) => `${option.label} (${option.score})`).join(", ")}`;
  return `${requirement} · Written response, not scored`;
}
