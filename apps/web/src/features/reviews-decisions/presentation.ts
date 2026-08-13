import { formatEventDateTime } from "../../app/event-time";
import type { OrganizerReviewSubmission, ReviewCriterion, ReviewerQueue } from "./types";

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

export function organizerSubmissionAssignmentLabel(
  submission: OrganizerReviewSubmission,
  roundId: string,
  timezone: string,
): string {
  const assignments = submission.assignments.filter((assignment) => assignment.roundId === roundId);
  const assignmentState = assignments.length === 0
    ? "Unassigned in this round"
    : `${assignments.length} assigned · ${summarizeAssignmentStates(assignments.map((assignment) => assignment.status))}`;
  const decisionState = submission.decision ? `Decision ${submission.decision}` : "No decision";
  return `${submission.title} — ${submission.authorName} · #${submission.submissionId.slice(0, 8)} · Submitted ${formatEventDateTime(submission.submittedAt, timezone)} · ${assignmentState} · ${decisionState}`;
}

function summarizeAssignmentStates(statuses: OrganizerReviewSubmission["assignments"][number]["status"][]): string {
  const order: OrganizerReviewSubmission["assignments"][number]["status"][] = ["assigned", "in_progress", "submitted", "recused"];
  return order
    .map((status) => ({ status, count: statuses.filter((candidate) => candidate === status).length }))
    .filter(({ count }) => count > 0)
    .map(({ status, count }) => `${count} ${status.replace("_", " ")}`)
    .join(", ");
}
