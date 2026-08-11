import { z } from "zod";

export const SubmissionStateSchema = z.enum(["draft", "submitted"]);
export const DecisionOutcomeSchema = z.enum(["accepted", "rejected"]);
export const PublicationStateSchema = z.enum(["draft", "live", "paused"]);

export const CreateSubmissionCommandSchema = z.object({
  eventSlug: z.string().min(1),
  formId: z.uuid(),
  title: z.string().trim().min(3).max(180),
  answers: z.record(z.string(), z.unknown()),
  participants: z.array(z.object({
    name: z.string().trim().min(1),
    email: z.email(),
    role: z.enum(["author", "co_author", "presenter"]),
  })).min(1),
  saveAsDraft: z.boolean().default(false),
});

export const SubmitReviewCommandSchema = z.object({
  assignmentId: z.uuid(),
  scores: z.record(z.string(), z.number()),
  notes: z.string().max(10_000).default(""),
});

export const DecideSubmissionCommandSchema = z.object({
  submissionId: z.uuid(),
  outcome: DecisionOutcomeSchema,
  idempotencyKey: z.string().min(12).max(200),
});

export const PublishProgramCommandSchema = z.object({
  eventId: z.uuid(),
  scheduleRevisionId: z.uuid(),
  idempotencyKey: z.string().min(12).max(200),
});

export interface AcceptanceHandoff {
  decisionId: string;
  submissionId: string;
  sessionId: string | null;
  eventSpeakerIds: ReadonlyArray<string>;
  outboxEventId: string;
}

export interface PublishedProgramHandoff {
  publicationId: string;
  scheduleRevisionId: string;
  publicRevision: number;
  outboxEventId: string;
}

