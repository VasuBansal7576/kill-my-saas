import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events, people } from "./foundation";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const formTarget = pgEnum("form_target", ["abstract", "session"]);
export const formStatus = pgEnum("form_status", ["draft", "published", "closed"]);
export const formFieldType = pgEnum("form_field_type", ["short_text", "long_text", "select", "multi_select", "checkbox", "date", "file"]);
export const submissionState = pgEnum("submission_state", ["draft", "submitted"]);
export const participantRole = pgEnum("participant_role", ["author", "co_author", "presenter"]);

export const cfpForms = pgTable("cfp_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  target: formTarget("target").notNull(),
  status: formStatus("status").notNull().default("draft"),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  welcomeCopy: text("welcome_copy").notNull().default(""),
  instructionsCopy: text("instructions_copy").notNull().default(""),
  successCopy: text("success_copy").notNull().default(""),
  allowDrafts: boolean("allow_drafts").notNull().default(true),
  maxSubmissionsPerPerson: integer("max_submissions_per_person"),
  ...timestamps,
}, (table) => [uniqueIndex("cfp_forms_event_name_unique").on(table.eventId, table.name)]);

export const formFields = pgTable("form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => cfpForms.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: formFieldType("type").notNull(),
  required: boolean("required").notNull().default(false),
  sortOrder: integer("sort_order").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  condition: jsonb("condition").$type<{ fieldKey: string; operator: "equals" | "not_equals"; value: unknown } | null>().default(null),
  ...timestamps,
}, (table) => [
  uniqueIndex("form_fields_key_unique").on(table.formId, table.key),
  uniqueIndex("form_fields_order_unique").on(table.formId, table.sortOrder),
]);

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  formId: uuid("form_id").notNull().references(() => cfpForms.id),
  submitterPersonId: uuid("submitter_person_id").references(() => people.id),
  title: text("title").notNull(),
  state: submissionState("state").notNull().default("draft"),
  currentVersion: integer("current_version").notNull().default(1),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("submissions_event_state_idx").on(table.eventId, table.state),
  index("submissions_submitter_idx").on(table.submitterPersonId),
]);

export const submissionVersions = pgTable("submission_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
  createdByPersonId: uuid("created_by_person_id").references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("submission_versions_number_unique").on(table.submissionId, table.version)]);

export const submissionParticipants = pgTable("submission_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  personId: uuid("person_id").references(() => people.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: participantRole("role").notNull(),
  sortOrder: integer("sort_order").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("submission_participant_email_unique").on(table.submissionId, table.email),
  index("submission_participant_person_idx").on(table.personId),
]);

