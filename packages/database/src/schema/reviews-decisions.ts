import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { events, people } from "./foundation";
import { submissions } from "./forms-submissions";

export type ReviewScorecardCriterion =
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

export const reviewRoundStatus = pgEnum("review_round_status", ["draft", "open", "closed"]);
export const reviewAssignmentStatus = pgEnum("review_assignment_status", ["assigned", "in_progress", "submitted", "recused"]);
export const reviewAiAssessmentStatus = pgEnum("review_ai_assessment_status", ["pending", "completed", "failed"]);
export const decisionOutcome = pgEnum("decision_outcome", ["accepted", "rejected"]);

export const reviewPlans = pgTable("review_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("review_plans_event_name_unique").on(table.eventId, table.name)]);

export const reviewRounds = pgTable("review_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").notNull().references(() => reviewPlans.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: reviewRoundStatus("status").notNull().default("draft"),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  blindPolicy: text("blind_policy").$type<"none" | "single_blind" | "double_blind">().notNull().default("double_blind"),
  scorecard: jsonb("scorecard").$type<Array<ReviewScorecardCriterion>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("review_rounds_event_name_unique").on(table.eventId, table.name),
  index("review_rounds_plan_idx").on(table.planId),
]);

export const reviewRoundReviewers = pgTable("review_round_reviewers", {
  roundId: uuid("round_id").notNull().references(() => reviewRounds.id, { onDelete: "cascade" }),
  reviewerPersonId: uuid("reviewer_person_id").notNull().references(() => people.id),
  assignmentCap: integer("assignment_cap"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.roundId, table.reviewerPersonId] }),
  index("review_round_reviewers_person_idx").on(table.reviewerPersonId),
]);

export const reviewConflicts = pgTable("review_conflicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  reviewerPersonId: uuid("reviewer_person_id").notNull().references(() => people.id),
  reason: text("reason").notNull(),
  declaredByPersonId: uuid("declared_by_person_id").notNull().references(() => people.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("review_conflicts_active_unique").on(table.submissionId, table.reviewerPersonId).where(sql`resolved_at is null`),
  index("review_conflicts_event_idx").on(table.eventId),
]);

export const reviewAssignments = pgTable("review_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => reviewRounds.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  reviewerPersonId: uuid("reviewer_person_id").notNull().references(() => people.id),
  status: reviewAssignmentStatus("status").notNull().default("assigned"),
  recusalReason: text("recusal_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("review_assignment_unique").on(table.roundId, table.submissionId, table.reviewerPersonId),
  index("review_assignments_reviewer_status_idx").on(table.reviewerPersonId, table.status),
  index("review_assignments_round_status_idx").on(table.roundId, table.status),
]);

export const reviewResponses = pgTable("review_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => reviewAssignments.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
  weightedScore: integer("weighted_score"),
  notes: text("notes").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("review_response_assignment_unique").on(table.assignmentId)]);

export const reviewAiAssessments = pgTable("review_ai_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  roundId: uuid("round_id").notNull().references(() => reviewRounds.id, { onDelete: "cascade" }),
  status: reviewAiAssessmentStatus("status").notNull().default("pending"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  score: integer("score"),
  reasoning: text("reasoning"),
  failureCode: text("failure_code"),
  humanOverrideScore: integer("human_override_score"),
  humanOverrideReason: text("human_override_reason"),
  overriddenByPersonId: uuid("overridden_by_person_id").references(() => people.id),
  overriddenAt: timestamp("overridden_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("review_ai_assessments_submission_idx").on(table.submissionId),
  index("review_ai_assessments_round_idx").on(table.roundId),
]);

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  outcome: decisionOutcome("outcome").notNull(),
  reason: text("reason").notNull().default(""),
  idempotencyKey: text("idempotency_key").notNull(),
  decidedByPersonId: uuid("decided_by_person_id").notNull().references(() => people.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("decisions_submission_unique").on(table.submissionId),
  uniqueIndex("decisions_idempotency_unique").on(table.idempotencyKey),
]);

export const decisionAuditEvents = pgTable("decision_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
  outcome: decisionOutcome("outcome").notNull(),
  reason: text("reason").notNull().default(""),
  actorPersonId: uuid("actor_person_id").notNull().references(() => people.id),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("decision_audit_idempotency_unique").on(table.idempotencyKey),
  index("decision_audit_decision_idx").on(table.decisionId, table.createdAt),
]);
