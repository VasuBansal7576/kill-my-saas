import { integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { events } from "./foundation";
import { scheduleRevisions } from "./scheduling";

export const publicationState = pgEnum("publication_state", ["draft", "live", "paused"]);

export const publications = pgTable("publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  state: publicationState("state").notNull().default("draft"),
  scheduleRevisionId: uuid("schedule_revision_id").references(() => scheduleRevisions.id),
  publicRevision: integer("public_revision").notNull().default(0),
  liveAt: timestamp("live_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("publications_event_unique").on(table.eventId)]);

