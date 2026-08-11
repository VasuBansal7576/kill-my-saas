import type { AcceptanceHandoff } from "@programflow/contracts";

export type ReviewCriterion =
  | {
    key: string;
    label: string;
    type: "numeric";
    required: boolean;
    weight: number;
    min: number;
    max: number;
  }
  | {
    key: string;
    label: string;
    type: "dropdown";
    required: boolean;
    weight: number;
    options: Array<{ label: string; score: number }>;
  }
  | {
    key: string;
    label: string;
    type: "free_text";
    required: boolean;
    weight: 0;
  };

export interface ReviewRoundInput {
  name: string;
  opensAt: string;
  closesAt: string;
  blindPolicy: "none" | "single_blind" | "double_blind";
  scorecard: ReadonlyArray<ReviewCriterion>;
  reviewers: ReadonlyArray<{ personId: string; assignmentCap: number | null }>;
}

export interface ReviewPlanInput {
  name: string;
  rounds: ReadonlyArray<ReviewRoundInput>;
}

export interface ReviewPlanView {
  id: string;
  eventId: string;
  name: string;
  rounds: Array<{
    id: string;
    name: string;
    status: "draft" | "open" | "closed";
    opensAt: string;
    closesAt: string;
    blindPolicy: "none" | "single_blind" | "double_blind";
    scorecard: ReadonlyArray<ReviewCriterion>;
    reviewers: Array<{ personId: string; name: string; assignmentCap: number | null; assigned: number; submitted: number; recused: number; percentComplete: number }>;
    progress: { assigned: number; submitted: number; recused: number; percentComplete: number };
  }>;
}

export interface ReviewQueueItem {
  assignmentId: string;
  roundId: string;
  roundName: string;
  submissionId: string;
  title: string;
  abstract: string;
  track: string | null;
  status: "assigned" | "in_progress" | "submitted" | "recused";
  blind: boolean;
  participants: Array<{ name: string; role: "author" | "co_author" | "presenter" }> | null;
  scorecard: ReadonlyArray<ReviewCriterion>;
  ownResponse: {
    answers: Record<string, unknown>;
    notes: string;
    weightedScore: number | null;
    revision: number;
    submittedAt: string | null;
  } | null;
}

export interface ReviewResultRow {
  submissionId: string;
  title: string;
  participants: Array<{ name: string; role: "author" | "co_author" | "presenter" }>;
  assigned: number;
  submitted: number;
  recused: number;
  aggregateScore: number | null;
  decision: "accepted" | "rejected" | null;
}

export interface DistributionInput {
  submissionIds: ReadonlyArray<string>;
  reviewers: ReadonlyArray<{ personId: string; assignmentCap: number | null; existingAssignments: number }>;
  conflictKeys: ReadonlySet<string>;
}

export interface ReviewAiPort {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  assess(input: {
    submissionId: string;
    title: string;
    abstract: string;
    criteria: ReadonlyArray<ReviewCriterion>;
  }): Promise<{
    provider: string;
    model: string;
    promptVersion: string;
    score: number;
    reasoning: string;
  }>;
}

export interface AcceptancePort {
  accept(input: {
    eventId: string;
    submissionId: string;
    decidedByPersonId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<AcceptanceHandoff>;
}

export interface ReviewReminderPort {
  remindOutstanding(input: {
    eventId: string;
    roundId: string;
    recipientPersonIds: ReadonlyArray<string>;
    idempotencyKey: string;
  }): Promise<{ communicationId: string; recipientCount: number; outboxEventIds: ReadonlyArray<string> }>;
}

export type DecisionResult =
  | { outcome: "accepted"; handoff: AcceptanceHandoff }
  | { outcome: "rejected"; decisionId: string; submissionId: string; outboxEventId: string; idempotent: boolean };
