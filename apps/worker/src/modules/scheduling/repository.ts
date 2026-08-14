import {
  eventFormats,
  eventRooms,
  eventSpeakers,
  eventTracks,
  events,
  people,
  placements,
  publications,
  scheduleRevisions,
  sessions,
  sessionSpeakers,
  type Database,
} from "@programflow/database";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import type {
  ScheduleEvent,
  SchedulePlacement,
  ScheduleRevisionRecord,
  ScheduleSnapshot,
  SchedulingRepositoryPort,
} from "./types";

type SchedulingRepositoryErrorCode =
  | "event_not_found"
  | "revision_not_found"
  | "revision_in_use"
  | "session_not_found"
  | "room_not_found"
  | "room_overlap";

export class SchedulingRepositoryError extends Error {
  constructor(readonly code: SchedulingRepositoryErrorCode, message: string) {
    super(message);
  }
}

export class SchedulingRepository implements SchedulingRepositoryPort {
  constructor(private readonly database: Database) {}

  async findEventBySlug(eventSlug: string): Promise<ScheduleEvent> {
    const [event] = await this.database.select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      startsOn: events.startsOn,
      endsOn: events.endsOn,
      timezone: events.timezone,
    }).from(events).where(eq(events.slug, eventSlug)).limit(1);
    if (!event) throw new SchedulingRepositoryError("event_not_found", "Event not found.");
    return event;
  }

  async loadSnapshot(event: ScheduleEvent, revisionId?: string): Promise<ScheduleSnapshot> {
    const [revisionRows, roomRows, trackRows, sessionRows, speakerRows, usedRevisionRows] = await Promise.all([
      this.database.select().from(scheduleRevisions)
        .where(eq(scheduleRevisions.eventId, event.id))
        .orderBy(desc(scheduleRevisions.version)),
      this.database.select().from(eventRooms)
        .where(eq(eventRooms.eventId, event.id))
        .orderBy(asc(eventRooms.sortOrder)),
      this.database.select().from(eventTracks)
        .where(eq(eventTracks.eventId, event.id))
        .orderBy(asc(eventTracks.sortOrder)),
      this.database.select({
        id: sessions.id,
        title: sessions.title,
        trackId: sessions.trackId,
        trackName: eventTracks.name,
        formatName: eventFormats.name,
        durationMinutes: eventFormats.durationMinutes,
      }).from(sessions)
        .leftJoin(eventTracks, eq(eventTracks.id, sessions.trackId))
        .leftJoin(eventFormats, eq(eventFormats.id, sessions.formatId))
        .where(eq(sessions.eventId, event.id))
        .orderBy(asc(sessions.title)),
      this.database.select({
        sessionId: sessionSpeakers.sessionId,
        personId: people.id,
        displayName: people.displayName,
      }).from(sessionSpeakers)
        .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
        .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
        .innerJoin(people, eq(people.id, eventSpeakers.personId))
        .where(eq(sessions.eventId, event.id)),
      this.database.select({ revisionId: publications.scheduleRevisionId }).from(publications)
        .where(eq(publications.eventId, event.id)),
    ]);

    const usedRevisionIds = new Set(usedRevisionRows.flatMap((row) => row.revisionId ? [row.revisionId] : []));
    const revisions = revisionRows.map((revision) => ({ ...revision, inUse: usedRevisionIds.has(revision.id) }));
    const revision = revisionId
      ? revisions.find((candidate) => candidate.id === revisionId)
      : revisions[0];
    if (revisionId && !revision) throw new SchedulingRepositoryError("revision_not_found", "Schedule revision not found in this event.");

    const placementRows = revision
      ? await this.database.select().from(placements).where(eq(placements.revisionId, revision.id)).orderBy(asc(placements.startsAt))
      : [];
    return {
      event,
      revision: revision ?? null,
      revisions,
      rooms: roomRows.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
      tracks: trackRows.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
      sessions: sessionRows.map((session) => ({
        ...session,
        durationMinutes: session.durationMinutes ?? 30,
        speakers: speakerRows.filter((speaker) => speaker.sessionId === session.id)
          .map(({ personId, displayName }) => ({ personId, displayName })),
      })),
      placements: placementRows.map(serializePlacement),
    };
  }

  async createDraftRevision(eventId: string): Promise<ScheduleRevisionRecord> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`schedule-revision:${eventId}`}, 0))`);
      const [latest] = await transaction.select().from(scheduleRevisions)
        .where(eq(scheduleRevisions.eventId, eventId))
        .orderBy(desc(scheduleRevisions.version))
        .limit(1);
      if (latest) {
        const [publication] = await transaction.select({ id: publications.id }).from(publications)
          .where(and(eq(publications.eventId, eventId), eq(publications.scheduleRevisionId, latest.id)))
          .limit(1);
        if (!publication) return { ...latest, inUse: false };
      }

      const [created] = await transaction.insert(scheduleRevisions).values({
        eventId,
        version: (latest?.version ?? 0) + 1,
        status: "draft",
      }).returning();
      if (!created) throw new Error("The schedule revision insert did not return a record.");
      if (latest) {
        const source = await transaction.select({
          sessionId: placements.sessionId,
          roomId: placements.roomId,
          startsAt: placements.startsAt,
          endsAt: placements.endsAt,
        }).from(placements).where(eq(placements.revisionId, latest.id));
        if (source.length > 0) {
          await transaction.insert(placements).values(source.map((placement) => ({ ...placement, revisionId: created.id })));
        }
      }
      return { ...created, inUse: false };
    });
  }

  async placeSession(input: {
    eventId: string;
    revisionId: string;
    sessionId: string;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await assertMutablePlacementTargets(transaction, input);
      await lockRoom(transaction, input.revisionId, input.roomId);
      const [overlap] = await transaction.select({ sessionId: placements.sessionId }).from(placements).where(and(
        eq(placements.revisionId, input.revisionId),
        eq(placements.roomId, input.roomId),
        ne(placements.sessionId, input.sessionId),
        lt(placements.startsAt, input.endsAt),
        gt(placements.endsAt, input.startsAt),
      )).limit(1);
      if (overlap) throw new SchedulingRepositoryError("room_overlap", "That room already contains an overlapping session. Choose another room or time.");

      await transaction.insert(placements).values({
        revisionId: input.revisionId,
        sessionId: input.sessionId,
        roomId: input.roomId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      }).onConflictDoUpdate({
        target: [placements.revisionId, placements.sessionId],
        set: { roomId: input.roomId, startsAt: input.startsAt, endsAt: input.endsAt, updatedAt: new Date() },
      });
      await transaction.update(scheduleRevisions).set({ status: "draft", updatedAt: new Date() })
        .where(and(eq(scheduleRevisions.id, input.revisionId), eq(scheduleRevisions.eventId, input.eventId)));
    });
  }

  async unplaceSession(eventId: string, revisionId: string, sessionId: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await assertMutableRevision(transaction, eventId, revisionId);
      const [session] = await transaction.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.eventId, eventId))).limit(1);
      if (!session) throw new SchedulingRepositoryError("session_not_found", "Session not found in this event.");
      await transaction.delete(placements).where(and(eq(placements.revisionId, revisionId), eq(placements.sessionId, sessionId)));
      await transaction.update(scheduleRevisions).set({ status: "draft", updatedAt: new Date() })
        .where(eq(scheduleRevisions.id, revisionId));
    });
  }

  async applyAutoPlacements(eventId: string, revisionId: string, planned: Array<{
    sessionId: string;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
  }>): Promise<void> {
    if (planned.length === 0) return;
    await this.database.transaction(async (transaction) => {
      await assertMutableRevision(transaction, eventId, revisionId);
      for (const placement of planned) {
        await assertMutablePlacementTargets(transaction, { eventId, revisionId, ...placement });
        await lockRoom(transaction, revisionId, placement.roomId);
        const [overlap] = await transaction.select({ sessionId: placements.sessionId }).from(placements).where(and(
          eq(placements.revisionId, revisionId),
          eq(placements.roomId, placement.roomId),
          ne(placements.sessionId, placement.sessionId),
          lt(placements.startsAt, placement.endsAt),
          gt(placements.endsAt, placement.startsAt),
        )).limit(1);
        if (overlap) throw new SchedulingRepositoryError("room_overlap", "Auto-place encountered a concurrent room overlap; reload and try again.");
        await transaction.insert(placements).values({ revisionId, ...placement });
      }
      await transaction.update(scheduleRevisions).set({ status: "draft", updatedAt: new Date() })
        .where(eq(scheduleRevisions.id, revisionId));
    });
  }

  async setRevisionStatus(eventId: string, revisionId: string, status: "draft" | "ready"): Promise<void> {
    await this.database.update(scheduleRevisions).set({ status, updatedAt: new Date() })
      .where(and(eq(scheduleRevisions.id, revisionId), eq(scheduleRevisions.eventId, eventId)));
  }
}

async function assertMutablePlacementTargets(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: { eventId: string; revisionId: string; sessionId: string; roomId: string; startsAt: Date; endsAt: Date },
) {
  if (!(input.startsAt < input.endsAt)) throw new SchedulingRepositoryError("room_overlap", "A placement must end after it starts.");
  await assertMutableRevision(transaction, input.eventId, input.revisionId);
  const [[session], [room]] = await Promise.all([
    transaction.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.eventId, input.eventId))).limit(1),
    transaction.select({ id: eventRooms.id }).from(eventRooms)
      .where(and(eq(eventRooms.id, input.roomId), eq(eventRooms.eventId, input.eventId))).limit(1),
  ]);
  if (!session) throw new SchedulingRepositoryError("session_not_found", "Session not found in this event.");
  if (!room) throw new SchedulingRepositoryError("room_not_found", "Room not found in this event.");
}

async function assertMutableRevision(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  eventId: string,
  revisionId: string,
) {
  const [revision] = await transaction.select({ id: scheduleRevisions.id }).from(scheduleRevisions)
    .where(and(eq(scheduleRevisions.id, revisionId), eq(scheduleRevisions.eventId, eventId))).limit(1).for("update");
  if (!revision) throw new SchedulingRepositoryError("revision_not_found", "Schedule revision not found in this event.");
  const [publication] = await transaction.select({ id: publications.id }).from(publications)
    .where(eq(publications.scheduleRevisionId, revisionId)).limit(1);
  if (publication) throw new SchedulingRepositoryError("revision_in_use", "This revision is already selected by Publication. Start a new revision before changing the agenda.");
}

async function lockRoom(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  revisionId: string,
  roomId: string,
) {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`schedule-room:${revisionId}:${roomId}`}, 0))`);
}

function serializePlacement(row: {
  id: string;
  revisionId: string;
  sessionId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
}): SchedulePlacement {
  return { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() };
}
