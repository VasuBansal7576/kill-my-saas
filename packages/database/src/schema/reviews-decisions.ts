import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events, people } from "./foundation";
import { submissions } from "./forms-submissions";

export const reviewRoundStatus = pgEnum("review_round_status", ["draft", "open", "closed"]);
export const reviewAssignmentStatus = pgEnum("review_assignment_status", ["assigned", "in_progress", "submitted", "recused"]);
export const decisionOutcome = pgEnum("decision_outcome", ["accepted", "rejected"]);

export const reviewRounds = pgTable("review_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: reviewRoundStatus("status").notNull().default("draft"),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  blindPolicy: text("blind_policy").notNull().default("double_blind"),
  scorecard: jsonb("scorecard").$type<Array<{ key: string; label: string; weight: number; min: number; max: number }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("review_rounds_event_name_unique").on(table.eventId, table.name)]);

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
]);

export const reviewResponses = pgTable("review_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => reviewAssignments.id, { onDelete: "cascade" }),
  scores: jsonb("scores").$type<Record<string, number>>().notNull(),
  weightedScore: integer("weighted_score").notNull(),
  notes: text("notes").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("review_response_assignment_unique").on(table.assignmentId)]);

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  outcome: decisionOutcome("outcome").notNull(),
  decidedByPersonId: uuid("decided_by_person_id").notNull().references(() => people.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("decisions_submission_unique").on(table.submissionId)]);

