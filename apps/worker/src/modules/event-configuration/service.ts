import type { EventConfiguration, EventConfigurationInput } from "@programflow/contracts";
import { eventFormats, eventRooms, events, eventTracks, type Database } from "@programflow/database";
import { asc, eq } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";

export class EventConfigurationError extends Error {
  constructor(readonly code: "event_not_found" | "forbidden", message: string) {
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

    await transaction.delete(eventTracks).where(eq(eventTracks.eventId, event.id));
    await transaction.delete(eventFormats).where(eq(eventFormats.eventId, event.id));
    await transaction.delete(eventRooms).where(eq(eventRooms.eventId, event.id));
    await transaction.insert(eventTracks).values(input.tracks.map((name, sortOrder) => ({ eventId: event.id, name, sortOrder })));
    await transaction.insert(eventFormats).values(input.formats.map((format, sortOrder) => ({ eventId: event.id, ...format, sortOrder })));
    await transaction.insert(eventRooms).values(input.rooms.map((name, sortOrder) => ({ eventId: event.id, name, sortOrder })));
  });

  return getEventConfiguration(database, actor, eventSlug);
}
