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
import { events, organizations } from "./foundation";

export const acceleventsEntityType = pgEnum("accelevents_entity_type", ["speaker", "session"]);
export const acceleventsReferenceType = pgEnum("accelevents_reference_type", ["track", "format"]);
export const acceleventsRunMode = pgEnum("accelevents_run_mode", ["preview", "manual", "retry"]);
export const acceleventsRunStatus = pgEnum("accelevents_run_status", [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "blocked_external",
]);
export const acceleventsRecordOperation = pgEnum("accelevents_record_operation", [
  "create",
  "update",
  "skip",
  "validate",
]);
export const acceleventsRecordStatus = pgEnum("accelevents_record_status", [
  "pending",
  "previewed",
  "synced",
  "skipped",
  "failed",
  "blocked_external",
]);
export const acceleventsAttemptStatus = pgEnum("accelevents_attempt_status", [
  "succeeded",
  "failed",
  "blocked_external",
  "not_sent",
]);

/**
 * Event-scoped connection metadata. The API token is resolved from the named
 * Worker secret at request time and is deliberately absent from this table.
 */
export const acceleventsConfigurations = pgTable("accelevents_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  externalEventUrl: text("external_event_url"),
  apiBaseUrl: text("api_base_url").notNull().default("https://api.accelevents.com"),
  credentialBinding: text("credential_binding").notNull().default("ACCELEVENTS_API_TOKEN"),
  authorizationHeader: text("authorization_header").notNull().default("Authorization"),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accelevents_configuration_event_unique").on(table.eventId),
  index("accelevents_configuration_organization_idx").on(table.organizationId),
]);

/** Explicit canonical field -> Accelevents request field mapping. */
export const acceleventsFieldMappings = pgTable("accelevents_field_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => acceleventsConfigurations.id, { onDelete: "cascade" }),
  entityType: acceleventsEntityType("entity_type").notNull(),
  canonicalField: text("canonical_field").notNull(),
  externalField: text("external_field").notNull(),
  required: boolean("required").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accelevents_field_mapping_canonical_unique").on(table.configurationId, table.entityType, table.canonicalField),
  uniqueIndex("accelevents_field_mapping_external_unique").on(table.configurationId, table.entityType, table.externalField),
]);

/** Canonical track/format IDs must be deliberately associated with provider values. */
export const acceleventsReferenceMappings = pgTable("accelevents_reference_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => acceleventsConfigurations.id, { onDelete: "cascade" }),
  referenceType: acceleventsReferenceType("reference_type").notNull(),
  canonicalId: uuid("canonical_id").notNull(),
  canonicalLabel: text("canonical_label").notNull(),
  externalValue: text("external_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accelevents_reference_mapping_canonical_unique").on(table.configurationId, table.referenceType, table.canonicalId),
]);

export const acceleventsRecordLinks = pgTable("accelevents_record_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => acceleventsConfigurations.id, { onDelete: "cascade" }),
  entityType: acceleventsEntityType("entity_type").notNull(),
  canonicalId: uuid("canonical_id").notNull(),
  externalId: text("external_id").notNull(),
  canonicalFingerprint: text("canonical_fingerprint").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accelevents_record_link_canonical_unique").on(table.configurationId, table.entityType, table.canonicalId),
  uniqueIndex("accelevents_record_link_external_unique").on(table.configurationId, table.entityType, table.externalId),
]);

export const acceleventsSyncRuns = pgTable("accelevents_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => acceleventsConfigurations.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  sourceRunId: uuid("source_run_id"),
  mode: acceleventsRunMode("mode").notNull(),
  status: acceleventsRunStatus("status").notNull().default("queued"),
  idempotencyKey: text("idempotency_key").notNull(),
  plannedCount: integer("planned_count").notNull().default(0),
  syncedCount: integer("synced_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  providerResponded: boolean("provider_responded").notNull().default(false),
  providerRequestCount: integer("provider_request_count").notNull().default(0),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accelevents_sync_run_idempotency_unique").on(table.configurationId, table.idempotencyKey),
  index("accelevents_sync_run_event_created_idx").on(table.eventId, table.createdAt),
]);

export const acceleventsSyncRecords = pgTable("accelevents_sync_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => acceleventsSyncRuns.id, { onDelete: "cascade" }),
  entityType: acceleventsEntityType("entity_type").notNull(),
  canonicalId: uuid("canonical_id").notNull(),
  externalId: text("external_id"),
  operation: acceleventsRecordOperation("operation").notNull(),
  status: acceleventsRecordStatus("status").notNull().default("pending"),
  fingerprint: text("fingerprint").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  requestMetadata: jsonb("request_metadata").$type<Record<string, unknown>>().notNull().default({}),
  responseMetadata: jsonb("response_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accelevents_sync_record_idempotency_unique").on(table.runId, table.idempotencyKey),
  index("accelevents_sync_record_run_status_idx").on(table.runId, table.status),
]);

/** Immutable per-provider-call evidence. Tokens and request bodies never enter this table. */
export const acceleventsRecordAttempts = pgTable("accelevents_record_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id").notNull().references(() => acceleventsSyncRecords.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  status: acceleventsAttemptStatus("status").notNull(),
  providerResponded: boolean("provider_responded").notNull().default(false),
  httpStatus: integer("http_status"),
  providerRequestId: text("provider_request_id"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  requestMetadata: jsonb("request_metadata").$type<Record<string, unknown>>().notNull().default({}),
  responseMetadata: jsonb("response_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accelevents_record_attempt_number_unique").on(table.recordId, table.attemptNumber),
  index("accelevents_record_attempt_status_idx").on(table.recordId, table.status),
]);
