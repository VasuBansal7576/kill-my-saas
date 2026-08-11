import {
  boolean,
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
import { events, organizations, people } from "./foundation";
import { eventSpeakers } from "./speaker-operations";

export const crmContactSource = pgEnum("crm_contact_source", ["manual", "csv", "event"]);
export const crmPipelineOutcome = pgEnum("crm_pipeline_outcome", ["open", "won", "lost"]);
export const crmOutreachStatus = pgEnum("crm_outreach_status", ["pending_handoff", "consumed", "failed"]);

export const crmContacts = pgTable("crm_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id),
  source: crmContactSource("source").notNull().default("manual"),
  internalNotes: text("internal_notes").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  customMetadata: jsonb("custom_metadata").$type<Record<string, string>>().notNull().default({}),
  mergedIntoContactId: uuid("merged_into_contact_id"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("crm_contacts_organization_person_unique").on(table.organizationId, table.personId),
  index("crm_contacts_organization_active_idx").on(table.organizationId, table.mergedIntoContactId),
]);

export const crmContactNotes = pgTable("crm_contact_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull().references(() => crmContacts.id, { onDelete: "cascade" }),
  authorPersonId: uuid("author_person_id").notNull().references(() => people.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("crm_contact_notes_contact_idx").on(table.contactId, table.createdAt)]);

export const crmContactMerges = pgTable("crm_contact_merges", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  primaryContactId: uuid("primary_contact_id").notNull().references(() => crmContacts.id),
  mergedContactId: uuid("merged_contact_id").notNull().references(() => crmContacts.id),
  primaryPersonId: uuid("primary_person_id").notNull().references(() => people.id),
  mergedPersonId: uuid("merged_person_id").notNull().references(() => people.id),
  mergedByPersonId: uuid("merged_by_person_id").notNull().references(() => people.id),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("crm_contact_merges_merged_unique").on(table.mergedContactId),
  index("crm_contact_merges_primary_idx").on(table.primaryContactId, table.createdAt),
]);

export const crmSavedSegments = pgTable("crm_saved_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filterDefinition: jsonb("filter_definition").$type<{
    search?: string;
    companies?: string[];
    jobTitles?: string[];
    tags?: string[];
    metadata?: Record<string, string>;
  }>().notNull(),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("crm_saved_segments_organization_name_unique").on(table.organizationId, table.name)]);

export const crmPipelines = pgTable("crm_pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("crm_pipelines_organization_name_unique").on(table.organizationId, table.name),
  index("crm_pipelines_organization_default_idx").on(table.organizationId, table.isDefault),
]);

export const crmPipelineStages = pgTable("crm_pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").notNull().references(() => crmPipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  outcome: crmPipelineOutcome("outcome").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("crm_pipeline_stages_position_unique").on(table.pipelineId, table.position),
  uniqueIndex("crm_pipeline_stages_name_unique").on(table.pipelineId, table.name),
]);

export const crmPipelineEnrollments = pgTable("crm_pipeline_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").notNull().references(() => crmPipelines.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => crmContacts.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => crmPipelineStages.id),
  enrolledByPersonId: uuid("enrolled_by_person_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("crm_pipeline_enrollments_contact_unique").on(table.pipelineId, table.contactId),
  index("crm_pipeline_enrollments_stage_idx").on(table.stageId, table.updatedAt),
]);

export const crmPipelineStageTransitions = pgTable("crm_pipeline_stage_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => crmPipelineEnrollments.id, { onDelete: "cascade" }),
  fromStageId: uuid("from_stage_id").references(() => crmPipelineStages.id),
  toStageId: uuid("to_stage_id").notNull().references(() => crmPipelineStages.id),
  movedByPersonId: uuid("moved_by_person_id").notNull().references(() => people.id),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("crm_pipeline_transitions_enrollment_idx").on(table.enrollmentId, table.createdAt)]);

export const crmEventSpeakerHandoffs = pgTable("crm_event_speaker_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => crmContacts.id),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id),
  eventSpeakerId: uuid("event_speaker_id").notNull().references(() => eventSpeakers.id),
  idempotencyKey: text("idempotency_key").notNull(),
  reusedExistingSpeaker: boolean("reused_existing_speaker").notNull(),
  requestedByPersonId: uuid("requested_by_person_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("crm_event_speaker_handoffs_idempotency_unique").on(table.idempotencyKey),
  index("crm_event_speaker_handoffs_contact_idx").on(table.contactId, table.createdAt),
]);

export const crmOutreachRequests = pgTable("crm_outreach_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subjectTemplate: text("subject_template").notNull(),
  htmlTemplate: text("html_template").notNull(),
  textTemplate: text("text_template").notNull(),
  selectedContactIds: jsonb("selected_contact_ids").$type<string[]>().notNull(),
  recipientSnapshot: jsonb("recipient_snapshot").$type<Array<{
    contactId: string;
    personId: string;
    displayName: string;
    email: string;
  }>>().notNull(),
  status: crmOutreachStatus("status").notNull().default("pending_handoff"),
  idempotencyKey: text("idempotency_key").notNull(),
  requestedByPersonId: uuid("requested_by_person_id").notNull().references(() => people.id),
  consumedCommunicationId: uuid("consumed_communication_id"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("crm_outreach_requests_idempotency_unique").on(table.idempotencyKey),
  index("crm_outreach_requests_pending_idx").on(table.status, table.createdAt),
]);
