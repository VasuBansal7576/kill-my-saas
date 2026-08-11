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

export type FormFieldDefinition = {
  key: string;
  label: string;
  type: "short_text" | "long_text" | "select" | "multi_select" | "checkbox" | "date" | "file";
  required: boolean;
  sortOrder: number;
  settings: Record<string, unknown>;
  condition: { fieldKey: string; operator: "equals" | "not_equals"; value: unknown } | null;
};

export type PublishedFormDefinition = {
  target: "abstract" | "session";
  opensAt: string | null;
  closesAt: string | null;
  welcomeCopy: string;
  instructionsCopy: string;
  successCopy: string;
  allowDrafts: boolean;
  allowMultipleDrafts: boolean;
  draftsCountTowardLimit: boolean;
  allowSubmittedEdits: boolean;
  confirmationEmailEnabled: boolean;
  draftReminderEnabled: boolean;
  draftReminderLeadHours: number;
  maxSubmissionsPerPerson: number | null;
  minimumParticipants: number;
  maximumParticipants: number;
  participantRoleLabels: Record<"author" | "co_author" | "presenter", string>;
  fields: FormFieldDefinition[];
};

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
  allowMultipleDrafts: boolean("allow_multiple_drafts").notNull().default(true),
  draftsCountTowardLimit: boolean("drafts_count_toward_limit").notNull().default(false),
  allowSubmittedEdits: boolean("allow_submitted_edits").notNull().default(true),
  confirmationEmailEnabled: boolean("confirmation_email_enabled").notNull().default(true),
  draftReminderEnabled: boolean("draft_reminder_enabled").notNull().default(true),
  draftReminderLeadHours: integer("draft_reminder_lead_hours").notNull().default(48),
  maxSubmissionsPerPerson: integer("max_submissions_per_person"),
  minimumParticipants: integer("minimum_participants").notNull().default(1),
  maximumParticipants: integer("maximum_participants").notNull().default(4),
  participantRoleLabels: jsonb("participant_role_labels").$type<Record<"author" | "co_author" | "presenter", string>>().notNull().default({
    author: "Primary author",
    co_author: "Co-author",
    presenter: "Presenter",
  }),
  revision: integer("revision").notNull().default(1),
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

export const cfpFormVersions = pgTable("cfp_form_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => cfpForms.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  definition: jsonb("definition").$type<PublishedFormDefinition>().notNull(),
  publishedByPersonId: uuid("published_by_person_id").notNull().references(() => people.id),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("cfp_form_versions_number_unique").on(table.formId, table.version),
  index("cfp_form_versions_published_idx").on(table.formId, table.publishedAt),
]);

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  formId: uuid("form_id").notNull().references(() => cfpForms.id),
  formVersionId: uuid("form_version_id").notNull().references(() => cfpFormVersions.id),
  submitterPersonId: uuid("submitter_person_id").references(() => people.id),
  title: text("title").notNull(),
  state: submissionState("state").notNull().default("draft"),
  routingKey: text("routing_key"),
  currentVersion: integer("current_version").notNull().default(1),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("submissions_event_state_idx").on(table.eventId, table.state),
  index("submissions_submitter_idx").on(table.submitterPersonId),
  index("submissions_review_handoff_idx").on(table.eventId, table.state, table.routingKey),
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
