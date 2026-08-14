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

export const airtableEntityType = pgEnum("airtable_entity_type", ["person", "speaker", "session"]);
export const airtableMappingDirection = pgEnum("airtable_mapping_direction", ["export", "import", "both"]);
export const airtableFieldOwner = pgEnum("airtable_field_owner", ["programflow", "airtable"]);
export const airtableSyncDirection = pgEnum("airtable_sync_direction", ["export", "import"]);
export const airtableSyncStatus = pgEnum("airtable_sync_status", [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "blocked_external",
]);
export const airtableSyncItemStatus = pgEnum("airtable_sync_item_status", [
  "synced",
  "skipped",
  "conflict",
  "failed",
  "blocked_external",
]);
export const airtableSyncOperation = pgEnum("airtable_sync_operation", ["create", "update", "import", "skip", "configuration"]);

/**
 * Event-scoped Airtable augmentation metadata. The secret itself is resolved
 * from the named Worker binding and is never stored with this inspectable data.
 */
export const airtableConfigurations = pgTable("airtable_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  baseId: text("base_id"),
  tableId: text("table_id"),
  credentialBinding: text("credential_binding").notNull().default("AIRTABLE_TOKEN"),
  modifiedTimeField: text("modified_time_field"),
  enabled: boolean("enabled").notNull().default(false),
  pageSize: integer("page_size").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("airtable_configuration_event_unique").on(table.eventId),
  index("airtable_configuration_organization_idx").on(table.organizationId),
]);

export const airtableFieldMappings = pgTable("airtable_field_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => airtableConfigurations.id, { onDelete: "cascade" }),
  entityType: airtableEntityType("entity_type").notNull(),
  localField: text("local_field").notNull(),
  externalField: text("external_field").notNull(),
  direction: airtableMappingDirection("direction").notNull(),
  owner: airtableFieldOwner("owner").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("airtable_field_mapping_local_unique").on(table.configurationId, table.entityType, table.localField),
  uniqueIndex("airtable_field_mapping_external_unique").on(table.configurationId, table.entityType, table.externalField),
]);

export const airtableSyncRuns = pgTable("airtable_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => airtableConfigurations.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  direction: airtableSyncDirection("direction").notNull(),
  status: airtableSyncStatus("status").notNull().default("queued"),
  idempotencyKey: text("idempotency_key").notNull(),
  exportedCount: integer("exported_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
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
  uniqueIndex("airtable_sync_run_idempotency_unique").on(table.configurationId, table.idempotencyKey),
  index("airtable_sync_run_event_created_idx").on(table.eventId, table.createdAt),
]);

export const airtableRecordLinks = pgTable("airtable_record_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => airtableConfigurations.id, { onDelete: "cascade" }),
  entityType: airtableEntityType("entity_type").notNull(),
  canonicalId: uuid("canonical_id").notNull(),
  airtableRecordId: text("airtable_record_id").notNull(),
  canonicalRevision: integer("canonical_revision"),
  canonicalFingerprint: text("canonical_fingerprint"),
  externalModifiedAt: timestamp("external_modified_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("airtable_record_link_canonical_unique").on(table.configurationId, table.entityType, table.canonicalId),
  uniqueIndex("airtable_record_link_external_unique").on(table.configurationId, table.airtableRecordId),
]);

/** Airtable-owned augmentation values stay namespaced away from canonical columns. */
export const airtableExternalAttributes = pgTable("airtable_external_attributes", {
  id: uuid("id").primaryKey().defaultRandom(),
  configurationId: uuid("configuration_id").notNull().references(() => airtableConfigurations.id, { onDelete: "cascade" }),
  entityType: airtableEntityType("entity_type").notNull(),
  canonicalId: uuid("canonical_id").notNull(),
  airtableRecordId: text("airtable_record_id").notNull(),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
  externalModifiedAt: timestamp("external_modified_at", { withTimezone: true }).notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("airtable_external_attributes_canonical_unique").on(table.configurationId, table.entityType, table.canonicalId),
]);

export const airtableSyncItems = pgTable("airtable_sync_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => airtableSyncRuns.id, { onDelete: "cascade" }),
  entityType: airtableEntityType("entity_type"),
  canonicalId: uuid("canonical_id"),
  airtableRecordId: text("airtable_record_id"),
  operation: airtableSyncOperation("operation").notNull(),
  status: airtableSyncItemStatus("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  attemptCount: integer("attempt_count").notNull().default(1),
  providerResponded: boolean("provider_responded").notNull().default(false),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  requestMetadata: jsonb("request_metadata").$type<Record<string, unknown>>().notNull().default({}),
  responseMetadata: jsonb("response_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("airtable_sync_item_idempotency_unique").on(table.runId, table.idempotencyKey),
  index("airtable_sync_item_run_status_idx").on(table.runId, table.status),
]);
