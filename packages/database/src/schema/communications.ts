import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { events, people } from "./foundation";
import { placements } from "./scheduling";

export const communicationKind = pgEnum("communication_kind", ["transactional", "campaign", "reminder", "calendar"]);
export const communicationStatus = pgEnum("communication_status", [
  "draft",
  "queued",
  "sending",
  "complete",
  "partial_failure",
  "failed",
  "blocked_external",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "queued",
  "sending",
  "accepted",
  "delivered",
  "bounced",
  "failed",
  "blocked_external",
]);
export const deliveryAttemptStatus = pgEnum("delivery_attempt_status", ["sending", "accepted", "failed", "blocked_external"]);

export const communicationTemplates = pgTable("communication_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subjectTemplate: text("subject_template").notNull(),
  htmlTemplate: text("html_template").notNull(),
  textTemplate: text("text_template").notNull(),
  mergeFields: jsonb("merge_fields").$type<string[]>().notNull().default([]),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("communication_templates_event_name_unique").on(table.eventId, table.name)]);

export const communications = pgTable("communications", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => communicationTemplates.id),
  name: text("name").notNull(),
  kind: communicationKind("kind").notNull(),
  status: communicationStatus("status").notNull().default("draft"),
  subjectTemplate: text("subject_template").notNull(),
  htmlTemplate: text("html_template").notNull(),
  textTemplate: text("text_template").notNull(),
  audienceSnapshot: jsonb("audience_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  idempotencyKey: text("idempotency_key").notNull(),
  requestedByPersonId: uuid("requested_by_person_id").references(() => people.id),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("communications_idempotency_unique").on(table.idempotencyKey),
  index("communications_event_status_idx").on(table.eventId, table.status),
]);

export const calendarArtifacts = pgTable("calendar_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  placementId: uuid("placement_id").notNull().references(() => placements.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id),
  revision: integer("revision").notNull(),
  sequence: integer("sequence").notNull(),
  uid: text("uid").notNull(),
  method: text("method").$type<"REQUEST" | "CANCEL">().notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull().default("text/calendar; charset=utf-8; method=REQUEST"),
  icalendar: text("icalendar").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("calendar_artifacts_revision_unique").on(table.placementId, table.personId, table.revision),
  index("calendar_artifacts_person_idx").on(table.eventId, table.personId, table.createdAt),
]);

export const communicationRecipients = pgTable("communication_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  communicationId: uuid("communication_id").notNull().references(() => communications.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id),
  calendarArtifactId: uuid("calendar_artifact_id").references(() => calendarArtifacts.id),
  toEmail: text("to_email"),
  toName: text("to_name").notNull(),
  mergeData: jsonb("merge_data").$type<Record<string, unknown>>().notNull().default({}),
  renderedSubject: text("rendered_subject").notNull(),
  renderedHtml: text("rendered_html").notNull(),
  renderedText: text("rendered_text").notNull(),
  status: deliveryStatus("status").notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  lastOutcomeAt: timestamp("last_outcome_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("communication_recipient_unique").on(table.communicationId, table.personId),
  index("communication_recipients_provider_idx").on(table.providerMessageId),
  index("communication_recipients_status_idx").on(table.status, table.updatedAt),
]);

export const deliveryAttempts = pgTable("delivery_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => communicationRecipients.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  provider: text("provider").notNull().default("brevo"),
  status: deliveryAttemptStatus("status").notNull(),
  providerMessageId: text("provider_message_id"),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  responseMetadata: jsonb("response_metadata").$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("delivery_attempt_number_unique").on(table.recipientId, table.attemptNumber),
  index("delivery_attempt_provider_message_idx").on(table.providerMessageId),
]);

export const deliveryProviderEvents = pgTable("delivery_provider_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => communicationRecipients.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("brevo"),
  providerEventId: text("provider_event_id").notNull(),
  providerMessageId: text("provider_message_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("delivery_provider_event_unique").on(table.provider, table.providerEventId),
  index("delivery_provider_event_message_idx").on(table.providerMessageId, table.occurredAt),
]);
