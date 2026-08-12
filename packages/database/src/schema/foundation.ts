import {
  boolean,
  date,
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

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const organizationRole = pgEnum("organization_role", ["organizer"]);
export const eventRole = pgEnum("event_role", ["organizer", "speaker", "reviewer"]);
export const providerKind = pgEnum("provider_kind", ["neon_auth", "r2", "brevo", "workers_ai", "airtable", "accelevents"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "claimed", "dispatched", "failed", "dead_letter"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  timezone: text("timezone").notNull(),
  location: text("location").notNull(),
  branding: jsonb("branding").$type<{ primaryColor: string; logoUrl?: string }>().notNull().default({ primaryColor: "#2d63e2" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("events_slug_unique").on(table.slug),
  index("events_organization_idx").on(table.organizationId),
]);

export const eventTracks = pgTable("event_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("event_tracks_name_unique").on(table.eventId, table.name),
  uniqueIndex("event_tracks_order_unique").on(table.eventId, table.sortOrder),
]);

export const eventFormats = pgTable("event_formats", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  sortOrder: integer("sort_order").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("event_formats_name_unique").on(table.eventId, table.name),
  uniqueIndex("event_formats_order_unique").on(table.eventId, table.sortOrder),
]);

export const eventRooms = pgTable("event_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("event_rooms_name_unique").on(table.eventId, table.name),
  uniqueIndex("event_rooms_order_unique").on(table.eventId, table.sortOrder),
]);

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  stableKey: text("stable_key").notNull(),
  displayName: text("display_name").notNull(),
  canonicalEmail: text("canonical_email"),
  ...timestamps,
}, (table) => [
  uniqueIndex("people_stable_key_unique").on(table.stableKey),
  uniqueIndex("people_canonical_email_unique").on(table.canonicalEmail),
]);

export const personEmailAliases = pgTable("person_email_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  isCanonical: boolean("is_canonical").notNull().default(false),
  ...timestamps,
}, (table) => [
  uniqueIndex("person_email_aliases_normalized_unique").on(table.normalizedEmail),
  index("person_email_aliases_person_idx").on(table.personId),
]);

export const identities = pgTable("identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id),
  provider: text("provider").notNull().default("neon_auth"),
  providerSubject: text("provider_subject").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("identities_provider_subject_unique").on(table.provider, table.providerSubject),
  uniqueIndex("identities_person_provider_unique").on(table.personId, table.provider),
]);

export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  personId: uuid("person_id").notNull().references(() => people.id),
  role: organizationRole("role").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("organization_membership_unique").on(table.organizationId, table.personId, table.role),
]);

export const eventMemberships = pgTable("event_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id),
  personId: uuid("person_id").notNull().references(() => people.id),
  role: eventRole("role").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("event_membership_unique").on(table.eventId, table.personId, table.role),
  index("event_membership_person_idx").on(table.personId),
]);

export const providerConfigurations = pgTable("provider_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  kind: providerKind("kind").notNull(),
  encryptedConfig: text("encrypted_config"),
  enabled: boolean("enabled").notNull().default(false),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastFailureCode: text("last_failure_code"),
  ...timestamps,
}, (table) => [uniqueIndex("provider_configuration_unique").on(table.organizationId, table.kind)]);

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...timestamps,
}, (table) => [
  uniqueIndex("outbox_idempotency_key_unique").on(table.idempotencyKey),
  index("outbox_claim_idx").on(table.status, table.availableAt),
]);

export const evidenceRecords = pgTable("evidence_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  requirementId: text("requirement_id").notNull(),
  eventId: uuid("event_id").references(() => events.id),
  operation: text("operation").notNull(),
  artifactUrl: text("artifact_url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  verified: boolean("verified").notNull().default(false),
  ...timestamps,
}, (table) => [index("evidence_requirement_idx").on(table.requirementId)]);
