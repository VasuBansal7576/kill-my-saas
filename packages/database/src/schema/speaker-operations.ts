import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events, people } from "./foundation";

export const eventSpeakerStatus = pgEnum("event_speaker_status", ["invited", "onboarding", "ready", "withdrawn"]);
export const taskKind = pgEnum("speaker_task_kind", ["action", "form", "file_request"]);
export const taskAssignmentStatus = pgEnum("task_assignment_status", ["pending", "complete"]);

export const speakerProfiles = pgTable("speaker_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id),
  biography: text("biography").notNull().default(""),
  company: text("company").notNull().default(""),
  jobTitle: text("job_title").notNull().default(""),
  headshotFileId: uuid("headshot_file_id"),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("speaker_profiles_person_unique").on(table.personId)]);

export const eventSpeakers = pgTable("event_speakers", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id),
  status: eventSpeakerStatus("status").notNull().default("invited"),
  invitationSentAt: timestamp("invitation_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_speakers_event_person_unique").on(table.eventId, table.personId),
  index("event_speakers_event_status_idx").on(table.eventId, table.status),
]);

export const speakerTasks = pgTable("speaker_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  kind: taskKind("kind").notNull(),
  required: boolean("required").notNull().default(true),
  dueAt: timestamp("due_at", { withTimezone: true }),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const speakerTaskAssignments = pgTable("speaker_task_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => speakerTasks.id, { onDelete: "cascade" }),
  eventSpeakerId: uuid("event_speaker_id").notNull().references(() => eventSpeakers.id, { onDelete: "cascade" }),
  status: taskAssignmentStatus("status").notNull().default("pending"),
  response: jsonb("response").$type<Record<string, unknown>>(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("speaker_task_assignment_unique").on(table.taskId, table.eventSpeakerId)]);

