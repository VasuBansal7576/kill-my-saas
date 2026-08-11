import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { eventFormats, events, eventTracks, people } from "./foundation";
import { submissions } from "./forms-submissions";
import { eventSpeakers } from "./speaker-operations";

export const sessionContentStatus = pgEnum("session_content_status", ["draft", "in_review", "approved"]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  sourceSubmissionId: uuid("source_submission_id").references(() => submissions.id),
  trackId: uuid("track_id").references(() => eventTracks.id),
  formatId: uuid("format_id").references(() => eventFormats.id),
  title: text("title").notNull(),
  abstract: text("abstract").notNull().default(""),
  contentStatus: sessionContentStatus("content_status").notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("sessions_source_submission_unique").on(table.sourceSubmissionId),
  index("sessions_event_status_idx").on(table.eventId, table.contentStatus),
]);

export const sessionVersions = pgTable("session_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull().default(""),
  contentStatus: sessionContentStatus("content_status").notNull(),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("session_versions_number_unique").on(table.sessionId, table.version)]);

export const sessionSpeakers = pgTable("session_speakers", {
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  eventSpeakerId: uuid("event_speaker_id").notNull().references(() => eventSpeakers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("speaker"),
}, (table) => [primaryKey({ columns: [table.sessionId, table.eventSpeakerId] })]);
