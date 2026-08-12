import type { SubmissionRecord } from "./model";

export function decisionLabel(submission: Pick<SubmissionRecord, "decision" | "state">) {
  if (submission.decision === "accepted") return "Accepted";
  if (submission.decision === "rejected") return "Rejected";
  return submission.state === "draft" ? "Draft" : "Submitted";
}
