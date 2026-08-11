import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events, people } from "./foundation";
import { placements } from "./scheduling";

export const communicationKind = pgEnum("communication_kind", ["transactional", "campaign", "reminder", "calendar"]);
export const communicationStatus = pgEnum("communication_status", ["draft", "queued", "sending", "complete", "partial_failure", "failed"]);
export const deliveryStatus = pgEnum("delivery_status", ["queued", "sent", "delivered", "bounced", "failed"]);

export const communicationTemplates = pgTable("communication_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subjectTemplate: text("subject_template").notNull(),
  htmlTemplate: text("html_template").notNull(),
  textTemplate: text("text_template").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("communication_templates_event_name_unique").on(table.eventId, table.name)]);

export const communications = pgTable("communications", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => communicationTemplates.id),
  kind: communicationKind("kind").notNull(),
  status: communicationStatus("status").notNull().default("draft"),
  subjectTemplate: text("subject_template").notNull(),
  htmlTemplate: text("html_template").notNull(),
  textTemplate: text("text_template").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestedByPersonId: uuid("requested_by_person_id").references(() => people.id),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("communications_idempotency_unique").on(table.idempotencyKey),
  index("communications_event_status_idx").on(table.eventId, table.status),
]);

export const communicationRecipients = pgTable("communication_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  communicationId: uuid("communication_id").notNull().references(() => communications.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id),
  toEmail: text("to_email").notNull(),
  mergeData: jsonb("merge_data").$type<Record<string, unknown>>().notNull().default({}),
  renderedSubject: text("rendered_subject").notNull(),
  renderedHtml: text("rendered_html").notNull(),
  renderedText: text("rendered_text").notNull(),
  status: deliveryStatus("status").notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("communication_recipient_unique").on(table.communicationId, table.personId),
  index("communication_recipients_provider_idx").on(table.providerMessageId),
]);

export const calendarArtifacts = pgTable("calendar_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  placementId: uuid("placement_id").notNull().references(() => placements.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id),
  revision: integer("revision").notNull(),
  icalendar: text("icalendar").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("calendar_artifacts_revision_unique").on(table.placementId, table.personId, table.revision)]);
