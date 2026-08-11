import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { events } from "./foundation";
import { sessions } from "./program";
import { scheduleRevisions } from "./scheduling";

export const publicationState = pgEnum("publication_state", ["draft", "live", "paused"]);
export const publicWidgetType = pgEnum("public_widget_type", [
  "sessions",
  "speakers",
  "agenda",
  "itinerary",
  "speaker_gallery",
]);

export interface WidgetBranding {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  showEventBranding: boolean;
}

export interface WidgetFilters {
  trackIds: string[];
  formatIds: string[];
  roomIds: string[];
}

export type WidgetField =
  | "title"
  | "description"
  | "date_time"
  | "room"
  | "track"
  | "format"
  | "speakers"
  | "speaker_company"
  | "speaker_job_title";

export type EmbedOutputFormat = "styled" | "basic" | "json" | "xml" | "ical";

/**
 * Publication is the only public-state switch. The selected schedule revision
 * remains canonical and immutable while referenced here; no session or
 * placement content is copied into this table.
 */
export const publications = pgTable("publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  state: publicationState("state").notNull().default("draft"),
  scheduleRevisionId: uuid("schedule_revision_id").references(() => scheduleRevisions.id),
  publicRevision: integer("public_revision").notNull().default(0),
  lastIdempotencyKey: text("last_idempotency_key"),
  liveAt: timestamp("live_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("publications_event_unique").on(table.eventId),
  uniqueIndex("publications_idempotency_unique").on(table.lastIdempotencyKey),
]);

/** Stable embed configuration. Filters and presentation are persisted here;
 * program records are always resolved live through Publication. */
export const widgetConfigurations = pgTable("widget_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  widgetType: publicWidgetType("widget_type").notNull(),
  branding: jsonb("branding").$type<WidgetBranding>().notNull(),
  filters: jsonb("filters").$type<WidgetFilters>().notNull().default({ trackIds: [], formatIds: [], roomIds: [] }),
  fields: jsonb("fields").$type<WidgetField[]>().notNull(),
  outputFormats: jsonb("output_formats").$type<EmbedOutputFormat[]>().notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("widget_configurations_event_slug_unique").on(table.eventId, table.slug),
  index("widget_configurations_event_type_idx").on(table.eventId, table.widgetType),
]);

/**
 * Anonymous attendee identity is an unguessable UUID in an HttpOnly cookie.
 * A separately generated token is stored only as a hash for local recovery
 * after cookie loss; neither mechanism creates an attendee account.
 */
export const attendeeItineraries = pgTable("attendee_itineraries", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  recoveryTokenHash: text("recovery_token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("attendee_itineraries_recovery_unique").on(table.recoveryTokenHash),
  index("attendee_itineraries_event_idx").on(table.eventId),
]);

export const attendeeItineraryItems = pgTable("attendee_itinerary_items", {
  itineraryId: uuid("itinerary_id").notNull().references(() => attendeeItineraries.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.itineraryId, table.sessionId] }),
  index("attendee_itinerary_items_session_idx").on(table.sessionId),
]);
