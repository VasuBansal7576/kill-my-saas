import type { EventConfiguration, EventConfigurationInput } from "@programflow/contracts";
import { eventFormats, eventRooms, events, eventTracks, placements, sessions, type Database } from "@programflow/database";
import { asc, eq, inArray } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";

export class EventConfigurationError extends Error {
  constructor(readonly code: "event_not_found" | "forbidden" | "catalog_in_use", message: string) {
    super(message);
  }
}

export async function getEventConfiguration(
  database: Database,
  actor: Actor,
  eventSlug: string,
): Promise<EventConfiguration> {
  const [event] = await database.select().from(events).where(eq(events.slug, eventSlug)).limit(1);
  if (!event) throw new EventConfigurationError("event_not_found", "Event not found.");
  if (!actorCanAccessEvent(actor, event.id, "organizer")) {
    throw new EventConfigurationError("forbidden", "Organizer access is required for this event.");
  }

  const [tracks, formats, rooms] = await Promise.all([
    database.select().from(eventTracks).where(eq(eventTracks.eventId, event.id)).orderBy(asc(eventTracks.sortOrder)),
    database.select().from(eventFormats).where(eq(eventFormats.eventId, event.id)).orderBy(asc(eventFormats.sortOrder)),
    database.select().from(eventRooms).where(eq(eventRooms.eventId, event.id)).orderBy(asc(eventRooms.sortOrder)),
  ]);
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    timezone: event.timezone,
    location: event.location,
    primaryColor: event.branding.primaryColor,
    tracks: tracks.map((track) => track.name),
    formats: formats.map((format) => ({ name: format.name, durationMinutes: format.durationMinutes })),
    rooms: rooms.map((room) => room.name),
  };
}

export async function updateEventConfiguration(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: EventConfigurationInput,
): Promise<EventConfiguration> {
  const [event] = await database.select({ id: events.id }).from(events).where(eq(events.slug, eventSlug)).limit(1);
  if (!event) throw new EventConfigurationError("event_not_found", "Event not found.");
  if (!actorCanAccessEvent(actor, event.id, "organizer")) {
    throw new EventConfigurationError("forbidden", "Organizer access is required for this event.");
  }

  await database.transaction(async (transaction) => {
    await transaction.update(events).set({
      name: input.name,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      timezone: input.timezone,
      location: input.location,
      branding: { primaryColor: input.primaryColor },
      updatedAt: new Date(),
    }).where(eq(events.id, event.id));

    const [currentTracks, currentFormats, currentRooms] = await Promise.all([
      transaction.select().from(eventTracks).where(eq(eventTracks.eventId, event.id)).orderBy(asc(eventTracks.sortOrder)),
      transaction.select().from(eventFormats).where(eq(eventFormats.eventId, event.id)).orderBy(asc(eventFormats.sortOrder)),
      transaction.select().from(eventRooms).where(eq(eventRooms.eventId, event.id)).orderBy(asc(eventRooms.sortOrder)),
    ]);

    const retainedTrackIds = new Set<string>();
    const allowTrackRename = input.tracks.length === currentTracks.length;
    for (const [sortOrder, name] of input.tracks.entries()) {
      const match = currentTracks.find((track) => !retainedTrackIds.has(track.id) && track.name === name)
        ?? (allowTrackRename ? currentTracks.find((track) => !retainedTrackIds.has(track.id) && track.sortOrder === sortOrder) : undefined);
      if (match) {
        retainedTrackIds.add(match.id);
        await transaction.update(eventTracks).set({ name, sortOrder, updatedAt: new Date() }).where(eq(eventTracks.id, match.id));
      } else {
        await transaction.insert(eventTracks).values({ eventId: event.id, name, sortOrder });
      }
    }

    const retainedFormatIds = new Set<string>();
    const allowFormatRename = input.formats.length === currentFormats.length;
    for (const [sortOrder, format] of input.formats.entries()) {
      const match = currentFormats.find((candidate) => !retainedFormatIds.has(candidate.id) && candidate.name === format.name)
        ?? (allowFormatRename ? currentFormats.find((candidate) => !retainedFormatIds.has(candidate.id) && candidate.sortOrder === sortOrder) : undefined);
      if (match) {
        retainedFormatIds.add(match.id);
        await transaction.update(eventFormats).set({ ...format, sortOrder, updatedAt: new Date() }).where(eq(eventFormats.id, match.id));
      } else {
        await transaction.insert(eventFormats).values({ eventId: event.id, ...format, sortOrder });
      }
    }

    const retainedRoomIds = new Set<string>();
    const allowRoomRename = input.rooms.length === currentRooms.length;
    for (const [sortOrder, name] of input.rooms.entries()) {
      const match = currentRooms.find((room) => !retainedRoomIds.has(room.id) && room.name === name)
        ?? (allowRoomRename ? currentRooms.find((room) => !retainedRoomIds.has(room.id) && room.sortOrder === sortOrder) : undefined);
      if (match) {
        retainedRoomIds.add(match.id);
        await transaction.update(eventRooms).set({ name, sortOrder, updatedAt: new Date() }).where(eq(eventRooms.id, match.id));
      } else {
        await transaction.insert(eventRooms).values({ eventId: event.id, name, sortOrder });
      }
    }

    const staleTrackIds = currentTracks.filter((track) => !retainedTrackIds.has(track.id)).map((track) => track.id);
    const staleFormatIds = currentFormats.filter((format) => !retainedFormatIds.has(format.id)).map((format) => format.id);
    const staleRoomIds = currentRooms.filter((room) => !retainedRoomIds.has(room.id)).map((room) => room.id);
    const [trackReference, formatReference, roomReference] = await Promise.all([
      staleTrackIds.length ? transaction.select({ id: sessions.id }).from(sessions).where(inArray(sessions.trackId, staleTrackIds)).limit(1) : [],
      staleFormatIds.length ? transaction.select({ id: sessions.id }).from(sessions).where(inArray(sessions.formatId, staleFormatIds)).limit(1) : [],
      staleRoomIds.length ? transaction.select({ id: placements.id }).from(placements).where(inArray(placements.roomId, staleRoomIds)).limit(1) : [],
    ]);
    if (trackReference.length || formatReference.length || roomReference.length) {
      throw new EventConfigurationError("catalog_in_use", "A track, format, or room cannot be removed while a session or agenda placement still references it.");
    }
    if (staleTrackIds.length) await transaction.delete(eventTracks).where(inArray(eventTracks.id, staleTrackIds));
    if (staleFormatIds.length) await transaction.delete(eventFormats).where(inArray(eventFormats.id, staleFormatIds));
    if (staleRoomIds.length) await transaction.delete(eventRooms).where(inArray(eventRooms.id, staleRoomIds));
  });

  return getEventConfiguration(database, actor, eventSlug);
}
