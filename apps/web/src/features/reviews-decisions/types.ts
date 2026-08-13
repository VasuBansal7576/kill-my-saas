export type ReviewCriterion =
  | { key: string; label: string; type: "numeric"; required: boolean; weight: number; min: number; max: number }
  | { key: string; label: string; type: "dropdown"; required: boolean; weight: number; options: Array<{ label: string; score: number }> }
  | { key: string; label: string; type: "free_text"; required: boolean; weight: 0 };

export interface ReviewsWorkspace {
  event: { id: string; slug: string; name: string; timezone: string };
  reviewers: Array<{ personId: string; name: string }>;
  submissions: Array<{ submissionId: string; title: string; track: string | null; routingKey: string | null }>;
  plans: Array<{
    id: string;
    name: string;
    rounds: Array<{
      id: string;
      name: string;
      status: "draft" | "open" | "closed";
      opensAt: string;
      closesAt: string;
      blindPolicy: "none" | "single_blind" | "double_blind";
      routingKeys: string[];
      scorecard: ReviewCriterion[];
      reviewers: Array<{ personId: string; name: string; assignmentCap: number | null; assigned: number; submitted: number; recused: number; percentComplete: number }>;
      progress: { assigned: number; submitted: number; recused: number; percentComplete: number };
    }>;
  }>;
  results: Array<{
    submissionId: string;
    title: string;
    participants: Array<{ name: string; role: "author" | "co_author" | "presenter" }>;
    assigned: number;
    submitted: number;
    recused: number;
    aggregateScore: number | null;
    decision: "accepted" | "rejected" | null;
    decisionId: string | null;
    decisionReleasedAt: string | null;
    acceptedSession: { id: string; sourceSubmissionId: string | null; title: string } | null;
  }>;
  aiAssessments: Array<{
    id: string;
    submissionId: string;
    roundId: string;
    status: "pending" | "completed" | "failed";
    provider: string;
    model: string;
    score: number | null;
    reasoning: string | null;
    failureCode: string | null;
    humanOverrideScore: number | null;
    humanOverrideReason: string | null;
    overriddenAt: string | null;
    createdAt: string;
  }>;
}

export interface ReviewerQueue {
  event: { id: string; slug: string; name: string; timezone: string };
  assignments: Array<{
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
    scorecard: ReviewCriterion[];
    ownResponse: {
      answers: Record<string, unknown>;
      notes: string;
      weightedScore: number | null;
      revision: number;
      submittedAt: string | null;
    } | null;
  }>;
}
