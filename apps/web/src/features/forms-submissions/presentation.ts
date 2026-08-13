import type { FormField, ParticipantRole, SubmissionRecord } from "./model";

export type ParticipantInput = { name: string; email: string; role: ParticipantRole };

const emptyPrimaryParticipant: ParticipantInput = { name: "", email: "", role: "author" };

export function decisionLabel(submission: Pick<SubmissionRecord, "decision" | "state">) {
  if (submission.decision === "accepted") return "Accepted";
  if (submission.decision === "rejected") return "Rejected";
  return submission.state === "draft" ? "Draft" : "Submitted";
}

export function speakerSubmissionWorkspace(pathname: string) {
  const decisions = pathname.endsWith("/decisions");
  return decisions
    ? {
        decisions,
        title: "Your decisions",
        description: "Review decisions that organizers have released for your submitted proposals.",
        emptyTitle: "No decisions released yet.",
        emptyDescription: "Submitted proposals remain in review until organizers release a decision.",
      }
    : {
        decisions,
        title: "Your proposals",
        description: "Resume drafts and manage proposals you have authored for this event.",
        emptyTitle: "No proposals yet.",
        emptyDescription: "Start from the public call for speakers form.",
      };
}

export function submissionsForWorkspace(submissions: SubmissionRecord[], decisions: boolean) {
  return decisions ? submissions.filter((submission) => submission.decision !== null) : submissions;
}

export function ensurePrimaryParticipant(participants: ParticipantInput[]): ParticipantInput[] {
  if (participants.length === 0) return [{ ...emptyPrimaryParticipant }];
  const primaryIndex = participants.findIndex((participant) => participant.role === "author");
  if (primaryIndex === 0) return participants;
  if (primaryIndex > 0) {
    const primary = participants[primaryIndex]!;
    return [primary, ...participants.filter((_, index) => index !== primaryIndex)];
  }
  return [{ ...participants[0]!, role: "author" }, ...participants.slice(1)];
}

export function removeAdditionalParticipant(participants: ParticipantInput[], index: number): ParticipantInput[] {
  const normalized = ensurePrimaryParticipant(participants);
  if (index <= 0) return normalized;
  return ensurePrimaryParticipant(normalized.filter((_, participantIndex) => participantIndex !== index));
}

export function participantLimitGuidance(minimum: number, maximum: number): string {
  const range = minimum === maximum
    ? `${minimum} ${minimum === 1 ? "participant" : "participants"}`
    : `${minimum} to ${maximum} participants`;
  return `Add ${range}. The primary participant is required and cannot be removed.`;
}

export function participantValidationMessage(participants: ParticipantInput[], minimum: number, maximum: number): string | null {
  const completed = participants.filter((participant) => participant.name.trim() || participant.email.trim());
  if (completed.length < minimum) {
    return minimum === 1
      ? "Add the primary participant’s name and email before submitting."
      : `Add at least ${minimum} participants before submitting.`;
  }
  if (completed.length > maximum) return `Remove participants until no more than ${maximum} remain.`;
  if (completed.some((participant) => !participant.name.trim() || !participant.email.trim())) {
    return "Complete both the name and email for every participant.";
  }
  if (!completed.some((participant) => participant.role === "author")) {
    return "Keep one participant as the primary author.";
  }
  const emails = completed.map((participant) => participant.email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) return "Use a different email address for each participant.";
  return null;
}

export function canonicalTitleField(fields: FormField[]): FormField | null {
  return fields.find((field) => {
    if (field.type !== "short_text") return false;
    const label = field.label.trim().toLocaleLowerCase();
    const key = field.key.trim().toLocaleLowerCase().replaceAll("-", "_");
    return ["title", "proposal title", "session title"].includes(label)
      || ["title", "proposal_title", "session_title"].includes(key);
  }) ?? null;
}

export function answersWithCanonicalTitle(
  answers: Record<string, unknown>,
  field: FormField | null,
  title: string,
): Record<string, unknown> {
  return field ? { ...answers, [field.key]: title } : answers;
}

export function cfpAvailabilityLabel(
  availability: "open" | "upcoming" | "closed",
  opensAt: string | null,
  closesAt: string | null,
  timezone: string,
  format: (value: string, timezone: string) => string,
): string {
  if (availability === "open") {
    return closesAt
      ? `Open until ${format(closesAt, timezone)}`
      : "Open-ended / no deadline set";
  }
  if (availability === "upcoming") return `Opens ${opensAt ? format(opensAt, timezone) : "later"}`;
  return "Submissions are closed";
}
