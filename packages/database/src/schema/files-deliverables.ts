import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events, people } from "./foundation";
import { sessions } from "./program";
import { eventSpeakers, speakerProfiles, speakerTaskAssignments } from "./speaker-operations";

export const fileVerificationStatus = pgEnum("file_verification_status", ["quarantined", "verified", "rejected"]);
export const deliverableStatus = pgEnum("deliverable_status", ["pending", "submitted", "changes_requested", "approved"]);
export const fileBundleStatus = pgEnum("file_bundle_status", ["pending", "ready", "failed"]);

export const fileObjects = pgTable("file_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  ownerPersonId: uuid("owner_person_id").notNull().references(() => people.id),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  verificationStatus: fileVerificationStatus("verification_status").notNull().default("quarantined"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("file_objects_storage_key_unique").on(table.storageKey),
  index("file_objects_event_created_idx").on(table.eventId, table.createdAt),
]);

export const deliverables = pgTable("deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  taskAssignmentId: uuid("task_assignment_id").references(() => speakerTaskAssignments.id, { onDelete: "cascade" }),
  eventSpeakerId: uuid("event_speaker_id").notNull().references(() => eventSpeakers.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  status: deliverableStatus("status").notNull().default("pending"),
  latestVersion: integer("latest_version").notNull().default(0),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("deliverables_task_assignment_unique").on(table.taskAssignmentId),
  index("deliverables_event_status_idx").on(table.eventId, table.status, table.dueAt),
]);

export const deliverableVersions = pgTable("deliverable_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliverableId: uuid("deliverable_id").notNull().references(() => deliverables.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  fileObjectId: uuid("file_object_id").notNull().references(() => fileObjects.id),
  uploadedByPersonId: uuid("uploaded_by_person_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("deliverable_versions_number_unique").on(table.deliverableId, table.version)]);

export const fileComments = pgTable("file_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliverableVersionId: uuid("deliverable_version_id").notNull().references(() => deliverableVersions.id, { onDelete: "cascade" }),
  authorPersonId: uuid("author_person_id").notNull().references(() => people.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("file_comments_version_created_idx").on(table.deliverableVersionId, table.createdAt)]);

export const speakerProfileVersions = pgTable("speaker_profile_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  speakerProfileId: uuid("speaker_profile_id").notNull().references(() => speakerProfiles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("speaker_profile_versions_number_unique").on(table.speakerProfileId, table.version)]);

export const fileBundleExports = pgTable("file_bundle_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  requestedByPersonId: uuid("requested_by_person_id").notNull().references(() => people.id),
  status: fileBundleStatus("status").notNull().default("pending"),
  selection: jsonb("selection").$type<{ deliverableIds: string[] }>().notNull(),
  storageKey: text("storage_key"),
  manifest: jsonb("manifest").$type<Record<string, unknown>>(),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("file_bundle_exports_event_status_idx").on(table.eventId, table.status)]);
