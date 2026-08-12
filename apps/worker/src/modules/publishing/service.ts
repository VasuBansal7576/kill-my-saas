import { type PublishedProgramHandoff } from "@programflow/contracts";
import {
  attendeeItineraries,
  attendeeItineraryItems,
  eventFormats,
  eventRooms,
  eventSpeakers,
  eventTracks,
  events,
  fileObjects,
  outboxEvents,
  people,
  placements,
  publications,
  scheduleRevisions,
  sessions,
  sessionSpeakers,
  speakerProfiles,
  widgetConfigurations,
  type Database,
} from "@programflow/database";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import type { ConflictFreeRevisionHandoff } from "../scheduling";
import type {
  PublishedProgram,
  PublicProgramQuery,
  PublicSession,
  PublicSpeaker,
  SaveWidgetConfigurationInput,
} from "./contracts";
import { assertPublishableRevision, PublicationRuleError } from "./rules";

export type PublishingErrorCode =
  | "event_not_found"
  | "forbidden"
  | "publication_not_live"
  | "publication_not_found"
  | "revision_not_found"
  | "idempotency_conflict"
  | "widget_not_found"
  | "invalid_widget_filter"
  | "session_not_public"
  | "itinerary_not_found"
  | "headshot_not_found";

export class PublishingError extends Error {
  constructor(readonly code: PublishingErrorCode, message: string) {
    super(message);
  }
}

interface PublishCommand {
  eventId: string;
  scheduleRevisionId: string;
  idempotencyKey: string;
}

export interface ItineraryResolution {
  itineraryId: string;
  recoveryToken: string | null;
  selectedSessionIds: string[];
}

export async function publishProgram(
  database: Database,
  actor: Actor,
  eventSlug: string,
  command: PublishCommand,
  handoff: ConflictFreeRevisionHandoff,
): Promise<PublishedProgramHandoff> {
  const event = await requireOrganizerEvent(database, actor, eventSlug);
  if (command.eventId !== event.id || command.scheduleRevisionId !== handoff.revisionId) {
    throw new PublicationRuleError("handoff_mismatch", "The publish command does not match Scheduling's handoff.");
  }

  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`publication:${event.id}`}, 0))`);
    const [existing] = await transaction.select().from(publications)
      .where(eq(publications.eventId, event.id)).limit(1).for("update");
    if (existing?.lastIdempotencyKey === command.idempotencyKey) {
      if (existing.scheduleRevisionId !== command.scheduleRevisionId) {
        throw new PublishingError("idempotency_conflict", "That idempotency key was already used for another schedule revision.");
      }
      const [priorOutbox] = await transaction.select({ id: outboxEvents.id }).from(outboxEvents)
        .where(eq(outboxEvents.idempotencyKey, `publication:${command.idempotencyKey}`)).limit(1);
      if (!priorOutbox || !existing.scheduleRevisionId) {
        throw new PublishingError("idempotency_conflict", "The prior publication receipt is incomplete.");
      }
      return {
        publicationId: existing.id,
        scheduleRevisionId: existing.scheduleRevisionId,
        publicRevision: existing.publicRevision,
        outboxEventId: priorOutbox.id,
      };
    }

    const [revision] = await transaction.select().from(scheduleRevisions).where(and(
      eq(scheduleRevisions.id, command.scheduleRevisionId),
      eq(scheduleRevisions.eventId, event.id),
    )).limit(1).for("update");
    if (!revision) throw new PublishingError("revision_not_found", "The selected schedule revision was not found in this event.");

    const [sessionRows, placementRows, speakerRows] = await Promise.all([
      transaction.select({ id: sessions.id, contentStatus: sessions.contentStatus }).from(sessions)
        .where(eq(sessions.eventId, event.id)),
      transaction.select({
        sessionId: placements.sessionId,
        roomId: placements.roomId,
        startsAt: placements.startsAt,
        endsAt: placements.endsAt,
      }).from(placements).where(eq(placements.revisionId, revision.id)),
      transaction.select({ sessionId: sessionSpeakers.sessionId, personId: eventSpeakers.personId })
        .from(sessionSpeakers)
        .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
        .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
        .where(eq(sessions.eventId, event.id)),
    ]);
    assertPublishableRevision({
      eventId: event.id,
      revisionId: revision.id,
      revisionStatus: revision.status,
      version: revision.version,
      handoff,
      sessionIds: sessionRows.map((row) => row.id),
      approvedSessionIds: sessionRows.filter((row) => row.contentStatus === "approved").map((row) => row.id),
      placements: placementRows,
      sessionSpeakers: speakerRows,
    });

    const now = new Date();
    const nextPublicRevision = (existing?.publicRevision ?? 0) + 1;
    const [publication] = existing
      ? await transaction.update(publications).set({
        state: "live",
        scheduleRevisionId: revision.id,
        publicRevision: nextPublicRevision,
        lastIdempotencyKey: command.idempotencyKey,
        liveAt: now,
        pausedAt: null,
        updatedAt: now,
      }).where(eq(publications.id, existing.id)).returning()
      : await transaction.insert(publications).values({
        eventId: event.id,
        state: "live",
        scheduleRevisionId: revision.id,
        publicRevision: nextPublicRevision,
        lastIdempotencyKey: command.idempotencyKey,
        liveAt: now,
      }).returning();
    if (!publication) throw new PublishingError("publication_not_found", "Publication could not persist the live transition.");

    const [outbox] = await transaction.insert(outboxEvents).values({
      aggregateType: "publication",
      aggregateId: publication.id,
      eventType: "publication.went_live",
      payload: {
        eventId: event.id,
        publishedByPersonId: actor.personId,
        publicationId: publication.id,
        scheduleRevisionId: revision.id,
        publicRevision: nextPublicRevision,
      },
      idempotencyKey: `publication:${command.idempotencyKey}`,
    }).returning({ id: outboxEvents.id });
    if (!outbox) throw new PublishingError("publication_not_found", "Publication evidence could not be persisted.");
    return {
      publicationId: publication.id,
      scheduleRevisionId: revision.id,
      publicRevision: nextPublicRevision,
      outboxEventId: outbox.id,
    };
  });
}

export async function pausePublication(database: Database, actor: Actor, eventSlug: string, idempotencyKey: string) {
  const event = await requireOrganizerEvent(database, actor, eventSlug);
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`publication:${event.id}`}, 0))`);
    const [publication] = await transaction.select().from(publications)
      .where(eq(publications.eventId, event.id)).limit(1).for("update");
    if (!publication) throw new PublishingError("publication_not_found", "This event has not been published.");
    const key = `publication-pause:${idempotencyKey}`;
    const [existingOutbox] = await transaction.select({ id: outboxEvents.id }).from(outboxEvents)
      .where(eq(outboxEvents.idempotencyKey, key)).limit(1);
    if (existingOutbox) return { publicationId: publication.id, state: publication.state, outboxEventId: existingOutbox.id };
    const now = new Date();
    await transaction.update(publications).set({ state: "paused", pausedAt: now, updatedAt: now })
      .where(eq(publications.id, publication.id));
    const [outbox] = await transaction.insert(outboxEvents).values({
      aggregateType: "publication",
      aggregateId: publication.id,
      eventType: "publication.paused",
      payload: { eventId: event.id, publicationId: publication.id },
      idempotencyKey: key,
    }).returning({ id: outboxEvents.id });
    if (!outbox) throw new PublishingError("publication_not_found", "Pause evidence could not be persisted.");
    return { publicationId: publication.id, state: "paused" as const, outboxEventId: outbox.id };
  });
}

export async function getPublishingWorkspace(database: Database, actor: Actor, eventSlug: string) {
  const event = await requireOrganizerEvent(database, actor, eventSlug);
  const [publicationRows, revisionRows, sessionRows, placementRows, widgetRows, trackRows, formatRows, roomRows] = await Promise.all([
    database.select().from(publications).where(eq(publications.eventId, event.id)).limit(1),
    database.select().from(scheduleRevisions).where(eq(scheduleRevisions.eventId, event.id)).orderBy(asc(scheduleRevisions.version)),
    database.select({ id: sessions.id, contentStatus: sessions.contentStatus }).from(sessions).where(eq(sessions.eventId, event.id)),
    database.select({ revisionId: placements.revisionId, sessionId: placements.sessionId }).from(placements)
      .innerJoin(scheduleRevisions, eq(scheduleRevisions.id, placements.revisionId))
      .where(eq(scheduleRevisions.eventId, event.id)),
    database.select().from(widgetConfigurations).where(eq(widgetConfigurations.eventId, event.id)).orderBy(asc(widgetConfigurations.name)),
    database.select({ id: eventTracks.id, name: eventTracks.name }).from(eventTracks).where(eq(eventTracks.eventId, event.id)).orderBy(asc(eventTracks.sortOrder)),
    database.select({ id: eventFormats.id, name: eventFormats.name }).from(eventFormats).where(eq(eventFormats.eventId, event.id)).orderBy(asc(eventFormats.sortOrder)),
    database.select({ id: eventRooms.id, name: eventRooms.name }).from(eventRooms).where(eq(eventRooms.eventId, event.id)).orderBy(asc(eventRooms.sortOrder)),
  ]);
  return {
    event,
    publication: publicationRows[0] ? serializePublication(publicationRows[0]) : null,
    revisions: revisionRows.map((revision) => ({
      id: revision.id,
      version: revision.version,
      status: revision.status,
      placementCount: placementRows.filter((placement) => placement.revisionId === revision.id).length,
    })),
    eligibility: {
      totalSessions: sessionRows.length,
      approvedSessions: sessionRows.filter((session) => session.contentStatus === "approved").length,
      excludedSessions: sessionRows.filter((session) => session.contentStatus !== "approved").length,
    },
    catalogs: { tracks: trackRows, formats: formatRows, rooms: roomRows },
    widgets: widgetRows.map(serializeWidget),
  };
}

export async function saveWidgetConfiguration(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: SaveWidgetConfigurationInput,
) {
  const event = await requireOrganizerEvent(database, actor, eventSlug);
  const [tracks, formats, rooms] = await Promise.all([
    database.select({ id: eventTracks.id }).from(eventTracks).where(eq(eventTracks.eventId, event.id)),
    database.select({ id: eventFormats.id }).from(eventFormats).where(eq(eventFormats.eventId, event.id)),
    database.select({ id: eventRooms.id }).from(eventRooms).where(eq(eventRooms.eventId, event.id)),
  ]);
  assertFilterIds(input.filters.trackIds, tracks, "track");
  assertFilterIds(input.filters.formatIds, formats, "format");
  assertFilterIds(input.filters.roomIds, rooms, "room");
  const [existing] = await database.select().from(widgetConfigurations).where(and(
    eq(widgetConfigurations.eventId, event.id),
    eq(widgetConfigurations.slug, input.slug),
  )).limit(1);
  const [saved] = existing
    ? await database.update(widgetConfigurations).set({
      name: input.name,
      widgetType: input.widgetType,
      branding: input.branding,
      filters: input.filters,
      fields: input.fields,
      outputFormats: input.outputFormats,
      revision: existing.revision + 1,
      updatedAt: new Date(),
    }).where(eq(widgetConfigurations.id, existing.id)).returning()
    : await database.insert(widgetConfigurations).values({ eventId: event.id, ...input }).returning();
  if (!saved) throw new PublishingError("widget_not_found", "The widget configuration could not be persisted.");
  return serializeWidget(saved);
}

export async function getPublishedProgram(
  database: Database,
  eventSlug: string,
  query: PublicProgramQuery = {},
): Promise<PublishedProgram> {
  return (await loadPublishedProgram(database, eventSlug, query)).program;
}

export async function getPublishedWidgetProgram(
  database: Database,
  eventSlug: string,
  widgetSlug: string,
  query: PublicProgramQuery = {},
) {
  const result = await loadPublishedProgram(database, eventSlug, query, widgetSlug);
  if (!result.widget) throw new PublishingError("widget_not_found", "That public widget configuration does not exist.");
  return { program: result.program, widget: result.widget };
}

async function loadPublishedProgram(
  database: Database,
  eventSlug: string,
  query: PublicProgramQuery,
  widgetSlug?: string,
): Promise<{ program: PublishedProgram; widget?: ReturnType<typeof serializeWidget> }> {
  const widgetJoin = widgetSlug
    ? and(eq(widgetConfigurations.eventId, events.id), eq(widgetConfigurations.slug, widgetSlug))
    : sql`false`;
  const [metadata] = await database.select({
    eventId: events.id,
    eventSlug: events.slug,
    eventName: events.name,
    startsOn: events.startsOn,
    endsOn: events.endsOn,
    timezone: events.timezone,
    location: events.location,
    eventBranding: events.branding,
    publicationId: publications.id,
    publicRevision: publications.publicRevision,
    scheduleRevisionId: publications.scheduleRevisionId,
    liveAt: publications.liveAt,
    widgetId: widgetConfigurations.id,
    widgetSlug: widgetConfigurations.slug,
    widgetName: widgetConfigurations.name,
    widgetType: widgetConfigurations.widgetType,
    widgetBranding: widgetConfigurations.branding,
    widgetFilters: widgetConfigurations.filters,
    widgetFields: widgetConfigurations.fields,
    widgetOutputFormats: widgetConfigurations.outputFormats,
    widgetRevision: widgetConfigurations.revision,
    widgetUpdatedAt: widgetConfigurations.updatedAt,
  }).from(events)
    .leftJoin(publications, and(eq(publications.eventId, events.id), eq(publications.state, "live")))
    .leftJoin(widgetConfigurations, widgetJoin)
    .where(eq(events.slug, eventSlug))
    .limit(1);
  if (!metadata) throw new PublishingError("event_not_found", "Event not found.");
  if (!metadata.publicationId || !metadata.scheduleRevisionId || !metadata.liveAt) {
    throw new PublishingError("publication_not_live", "This event's public program is not live.");
  }
  if (widgetSlug && !metadata.widgetId) {
    throw new PublishingError("widget_not_found", "That public widget configuration does not exist.");
  }

  const widget = metadata.widgetId ? {
    id: metadata.widgetId,
    slug: metadata.widgetSlug!,
    name: metadata.widgetName!,
    widgetType: metadata.widgetType!,
    branding: metadata.widgetBranding!,
    filters: metadata.widgetFilters!,
    fields: metadata.widgetFields!,
    outputFormats: metadata.widgetOutputFormats!,
    revision: metadata.widgetRevision!,
    updatedAt: metadata.widgetUpdatedAt!.toISOString(),
  } : undefined;

  const [sessionRows, speakerRows] = await Promise.all([
    database.select({
      id: sessions.id,
      title: sessions.title,
      description: sessions.abstract,
      startsAt: placements.startsAt,
      endsAt: placements.endsAt,
      roomId: eventRooms.id,
      roomName: eventRooms.name,
      trackId: eventTracks.id,
      trackName: eventTracks.name,
      formatId: eventFormats.id,
      formatName: eventFormats.name,
    }).from(sessions)
      .innerJoin(placements, and(
        eq(placements.sessionId, sessions.id),
        eq(placements.revisionId, metadata.scheduleRevisionId),
      ))
      .innerJoin(eventRooms, eq(eventRooms.id, placements.roomId))
      .leftJoin(eventTracks, eq(eventTracks.id, sessions.trackId))
      .leftJoin(eventFormats, eq(eventFormats.id, sessions.formatId))
      .where(and(eq(sessions.eventId, metadata.eventId), eq(sessions.contentStatus, "approved")))
      .orderBy(asc(placements.startsAt), asc(sessions.title)),
    database.select({
      sessionId: sessionSpeakers.sessionId,
      personId: people.id,
      eventSpeakerId: eventSpeakers.id,
      name: people.displayName,
      biography: speakerProfiles.biography,
      company: speakerProfiles.company,
      jobTitle: speakerProfiles.jobTitle,
      headshotFileId: speakerProfiles.headshotFileId,
      headshotStatus: fileObjects.verificationStatus,
    }).from(sessionSpeakers)
      .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
      .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
      .innerJoin(people, eq(people.id, eventSpeakers.personId))
      .leftJoin(speakerProfiles, eq(speakerProfiles.personId, people.id))
      .leftJoin(fileObjects, eq(fileObjects.id, speakerProfiles.headshotFileId))
      .where(and(eq(sessions.eventId, metadata.eventId), eq(sessions.contentStatus, "approved"))),
  ]);

  const allSessions: PublicSession[] = sessionRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    day: localDate(row.startsAt, metadata.timezone),
    room: { id: row.roomId, name: row.roomName },
    track: row.trackId && row.trackName ? { id: row.trackId, name: row.trackName } : null,
    format: row.formatId && row.formatName ? { id: row.formatId, name: row.formatName } : null,
    speakers: [],
  }));
  const sessionById = new Map(allSessions.map((session) => [session.id, session]));
  const speakerById = new Map<string, PublicSpeaker>();
  for (const row of speakerRows) {
    const session = sessionById.get(row.sessionId);
    if (!session) continue;
    const speaker = speakerById.get(row.personId) ?? {
      id: row.personId,
      eventSpeakerId: row.eventSpeakerId,
      name: row.name,
      biography: row.biography ?? "",
      company: row.company ?? "",
      jobTitle: row.jobTitle ?? "",
      headshotUrl: row.headshotFileId && row.headshotStatus === "verified"
        ? `/api/v1/public/program/${encodeURIComponent(metadata.eventSlug)}/speakers/${row.personId}/headshot`
        : null,
      sessions: [],
    };
    if (!speaker.sessions.some((candidate) => candidate.id === session.id)) {
      speaker.sessions.push({
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        room: session.room.name,
      });
    }
    speakerById.set(row.personId, speaker);
    session.speakers.push(speaker);
  }

  const configFilters = widget?.filters ?? { trackIds: [], formatIds: [], roomIds: [] };
  const search = query.search?.toLocaleLowerCase();
  const filteredSessions = allSessions.filter((session) => {
    if (configFilters.trackIds.length > 0 && (!session.track || !configFilters.trackIds.includes(session.track.id))) return false;
    if (configFilters.formatIds.length > 0 && (!session.format || !configFilters.formatIds.includes(session.format.id))) return false;
    if (configFilters.roomIds.length > 0 && !configFilters.roomIds.includes(session.room.id)) return false;
    if (query.track && session.track?.name !== query.track && session.track?.id !== query.track) return false;
    if (query.format && session.format?.name !== query.format && session.format?.id !== query.format) return false;
    if (query.location && session.room.name !== query.location && session.room.id !== query.location) return false;
    if (query.day && session.day !== query.day) return false;
    return !search || `${session.title} ${session.speakers.map((speaker) => speaker.name).join(" ")}`.toLocaleLowerCase().includes(search);
  });
  const visibleSpeakerIds = new Set(filteredSessions.flatMap((session) => session.speakers.map((speaker) => speaker.id)));
  const filteredSpeakers = [...speakerById.values()]
    .filter((speaker) => visibleSpeakerIds.has(speaker.id) && (!search || speaker.name.toLocaleLowerCase().includes(search) || filteredSessions.some((session) => session.speakers.some((candidate) => candidate.id === speaker.id))))
    .map((speaker) => ({ ...speaker, sessions: speaker.sessions.filter((session) => filteredSessions.some((candidate) => candidate.id === session.id)) }))
    .sort((left, right) => surnameKey(left.name).localeCompare(surnameKey(right.name)) || left.name.localeCompare(right.name));

  return {
    widget,
    program: {
      publication: {
        id: metadata.publicationId,
        publicRevision: metadata.publicRevision!,
        scheduleRevisionId: metadata.scheduleRevisionId,
        liveAt: metadata.liveAt.toISOString(),
      },
      event: {
        id: metadata.eventId,
        slug: metadata.eventSlug,
        name: metadata.eventName,
        startsOn: metadata.startsOn,
        endsOn: metadata.endsOn,
        timezone: metadata.timezone,
        location: metadata.location,
        branding: metadata.eventBranding,
      },
      days: eventDays(metadata.startsOn, metadata.endsOn),
      tracks: uniqueBy(filteredSessions.flatMap((session) => session.track ? [session.track] : [])),
      formats: uniqueBy(filteredSessions.flatMap((session) => session.format ? [session.format] : [])),
      rooms: uniqueBy(filteredSessions.map((session) => session.room)),
      sessions: filteredSessions,
      speakers: filteredSpeakers,
    },
  };
}

export async function resolveItinerary(
  database: Database,
  eventSlug: string,
  itineraryId?: string,
  recoveryToken?: string,
): Promise<ItineraryResolution> {
  const program = await getPublishedProgram(database, eventSlug);
  let itinerary = itineraryId
    ? (await database.select().from(attendeeItineraries).where(and(
      eq(attendeeItineraries.id, itineraryId),
      eq(attendeeItineraries.eventId, program.event.id),
    )).limit(1))[0]
    : undefined;
  if (!itinerary && recoveryToken) {
    const hash = await sha256(recoveryToken);
    itinerary = (await database.select().from(attendeeItineraries).where(and(
      eq(attendeeItineraries.recoveryTokenHash, hash),
      eq(attendeeItineraries.eventId, program.event.id),
    )).limit(1))[0];
  }
  let newRecoveryToken: string | null = null;
  if (!itinerary) {
    newRecoveryToken = randomToken();
    [itinerary] = await database.insert(attendeeItineraries).values({
      eventId: program.event.id,
      recoveryTokenHash: await sha256(newRecoveryToken),
    }).returning();
  }
  if (!itinerary) throw new PublishingError("itinerary_not_found", "The anonymous itinerary could not be persisted.");
  const selected = await database.select({ sessionId: attendeeItineraryItems.sessionId }).from(attendeeItineraryItems)
    .where(eq(attendeeItineraryItems.itineraryId, itinerary.id));
  const publicSessionIds = new Set(program.sessions.map((session) => session.id));
  return {
    itineraryId: itinerary.id,
    recoveryToken: newRecoveryToken,
    selectedSessionIds: selected.map((row) => row.sessionId).filter((sessionId) => publicSessionIds.has(sessionId)),
  };
}

export async function addItinerarySession(database: Database, eventSlug: string, itineraryId: string, sessionId: string) {
  const program = await getPublishedProgram(database, eventSlug);
  if (!program.sessions.some((session) => session.id === sessionId)) {
    throw new PublishingError("session_not_public", "Only a session in the live approved program can be added.");
  }
  const [itinerary] = await database.select({ id: attendeeItineraries.id }).from(attendeeItineraries).where(and(
    eq(attendeeItineraries.id, itineraryId),
    eq(attendeeItineraries.eventId, program.event.id),
  )).limit(1);
  if (!itinerary) throw new PublishingError("itinerary_not_found", "The anonymous itinerary was not found.");
  await database.insert(attendeeItineraryItems).values({ itineraryId, sessionId })
    .onConflictDoNothing({ target: [attendeeItineraryItems.itineraryId, attendeeItineraryItems.sessionId] });
  await database.update(attendeeItineraries).set({ updatedAt: new Date() }).where(eq(attendeeItineraries.id, itineraryId));
  return resolveItinerary(database, eventSlug, itineraryId);
}

export async function removeItinerarySession(database: Database, eventSlug: string, itineraryId: string, sessionId: string) {
  await getPublishedProgram(database, eventSlug);
  await database.delete(attendeeItineraryItems).where(and(
    eq(attendeeItineraryItems.itineraryId, itineraryId),
    eq(attendeeItineraryItems.sessionId, sessionId),
  ));
  await database.update(attendeeItineraries).set({ updatedAt: new Date() }).where(eq(attendeeItineraries.id, itineraryId));
  return resolveItinerary(database, eventSlug, itineraryId);
}

export async function getPublicHeadshot(database: Database, eventSlug: string, personId: string) {
  const program = await getPublishedProgram(database, eventSlug);
  if (!program.speakers.some((speaker) => speaker.id === personId)) throw new PublishingError("headshot_not_found", "Headshot not found.");
  const [file] = await database.select({
    storageKey: fileObjects.storageKey,
    mediaType: fileObjects.mediaType,
    checksumSha256: fileObjects.checksumSha256,
  }).from(speakerProfiles)
    .innerJoin(fileObjects, eq(fileObjects.id, speakerProfiles.headshotFileId))
    .where(and(eq(speakerProfiles.personId, personId), eq(fileObjects.verificationStatus, "verified"))).limit(1);
  if (!file) throw new PublishingError("headshot_not_found", "Headshot not found.");
  return file;
}

function serializePublication(publication: typeof publications.$inferSelect) {
  return {
    id: publication.id,
    state: publication.state,
    scheduleRevisionId: publication.scheduleRevisionId,
    publicRevision: publication.publicRevision,
    liveAt: publication.liveAt?.toISOString() ?? null,
    pausedAt: publication.pausedAt?.toISOString() ?? null,
  };
}

function serializeWidget(widget: typeof widgetConfigurations.$inferSelect) {
  return {
    id: widget.id,
    slug: widget.slug,
    name: widget.name,
    widgetType: widget.widgetType,
    branding: widget.branding,
    filters: widget.filters,
    fields: widget.fields,
    outputFormats: widget.outputFormats,
    revision: widget.revision,
    updatedAt: widget.updatedAt.toISOString(),
  };
}

async function requireOrganizerEvent(database: Database, actor: Actor, eventSlug: string) {
  const [event] = await database.select().from(events).where(eq(events.slug, eventSlug)).limit(1);
  if (!event) throw new PublishingError("event_not_found", "Event not found.");
  if (!actorCanAccessEvent(actor, event.id, "organizer")) {
    throw new PublishingError("forbidden", "Organizer access is required for this event's Publication workspace.");
  }
  return event;
}

function assertFilterIds(values: string[], rows: Array<{ id: string }>, label: string): void {
  const valid = new Set(rows.map((row) => row.id));
  if (values.some((value) => !valid.has(value))) {
    throw new PublishingError("invalid_widget_filter", `Every configured ${label} filter must belong to this event.`);
  }
}

function uniqueBy<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function surnameKey(name: string): string {
  return name.trim().split(/\s+/).at(-1)?.toLocaleLowerCase() ?? name.toLocaleLowerCase();
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function eventDays(startsOn: string, endsOn: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startsOn}T00:00:00Z`);
  const end = new Date(`${endsOn}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
