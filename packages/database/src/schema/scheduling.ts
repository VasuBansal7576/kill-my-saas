import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { eventRooms, events } from "./foundation";
import { sessions } from "./program";

export const scheduleRevisionStatus = pgEnum("schedule_revision_status", ["draft", "ready"]);

export const scheduleRevisions = pgTable("schedule_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: scheduleRevisionStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("schedule_revision_version_unique").on(table.eventId, table.version)]);

export const placements = pgTable("placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  revisionId: uuid("revision_id").notNull().references(() => scheduleRevisions.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").notNull().references(() => eventRooms.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("placement_revision_session_unique").on(table.revisionId, table.sessionId),
  index("placements_revision_time_idx").on(table.revisionId, table.startsAt, table.endsAt),
  index("placements_revision_room_time_idx").on(table.revisionId, table.roomId, table.startsAt, table.endsAt),
  check("placements_positive_interval", sql`${table.endsAt} > ${table.startsAt}`),
]);
