import type {
  ScheduleConflict,
  ScheduleEvent,
  SchedulePlacement,
  ScheduleRoom,
  ScheduleSession,
} from "./types";

export function intervalsOverlap(
  left: Pick<SchedulePlacement, "startsAt" | "endsAt">,
  right: Pick<SchedulePlacement, "startsAt" | "endsAt">,
): boolean {
  return Date.parse(left.startsAt) < Date.parse(right.endsAt)
    && Date.parse(left.endsAt) > Date.parse(right.startsAt);
}

export function deriveScheduleConflicts(
  sessions: ReadonlyArray<ScheduleSession>,
  placements: ReadonlyArray<SchedulePlacement>,
  rooms: ReadonlyArray<ScheduleRoom>,
): ScheduleConflict[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const conflicts: ScheduleConflict[] = [];

  for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
    const left = placements[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
      const right = placements[rightIndex];
      if (!right || !intervalsOverlap(left, right)) continue;
      const orderedSessionIds = [left.sessionId, right.sessionId].sort() as [string, string];
      const overlap = overlapRange(left, right);
      if (left.roomId === right.roomId) {
        conflicts.push({
          id: `room:${left.roomId}:${orderedSessionIds.join(":")}`,
          type: "room_overlap",
          sessionIds: orderedSessionIds,
          roomId: left.roomId,
          ...overlap,
          message: `${roomsById.get(left.roomId)?.name ?? "Room"} has overlapping sessions.`,
        });
      }

      const leftSession = sessionsById.get(left.sessionId);
      const rightSession = sessionsById.get(right.sessionId);
      if (!leftSession || !rightSession) continue;
      const rightSpeakers = new Map(rightSession.speakers.map((speaker) => [speaker.personId, speaker]));
      for (const speaker of leftSession.speakers) {
        if (!rightSpeakers.has(speaker.personId)) continue;
        conflicts.push({
          id: `speaker:${speaker.personId}:${orderedSessionIds.join(":")}`,
          type: "speaker_double_booking",
          sessionIds: orderedSessionIds,
          speaker,
          ...overlap,
          message: `${speaker.displayName} is double-booked for overlapping sessions.`,
        });
      }
    }
  }
  return conflicts.sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id));
}

export function eventDays(event: Pick<ScheduleEvent, "startsOn" | "endsOn">): string[] {
  const start = parseDateOnly(event.startsOn);
  const end = parseDateOnly(event.endsOn);
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 86_400_000) days.push(new Date(cursor).toISOString().slice(0, 10));
  return days;
}

export interface PlannedPlacement {
  sessionId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
}

export function planAutoPlacements(input: {
  event: ScheduleEvent;
  rooms: ReadonlyArray<ScheduleRoom>;
  sessions: ReadonlyArray<ScheduleSession>;
  placements: ReadonlyArray<SchedulePlacement>;
}): { placements: PlannedPlacement[]; unplaced: Array<{ sessionId: string; reason: "no_rooms" | "no_conflict_free_slot" }> } {
  const rooms = [...input.rooms].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const alreadyPlaced = new Set(input.placements.map((placement) => placement.sessionId));
  const sessions = input.sessions
    .filter((session) => !alreadyPlaced.has(session.id))
    .sort((left, right) => right.durationMinutes - left.durationMinutes || left.id.localeCompare(right.id));
  if (rooms.length === 0) return { placements: [], unplaced: sessions.map((session) => ({ sessionId: session.id, reason: "no_rooms" })) };

  const allPlacements: SchedulePlacement[] = [...input.placements];
  const sessionsById = new Map(input.sessions.map((session) => [session.id, session]));
  const planned: PlannedPlacement[] = [];
  const unplaced: Array<{ sessionId: string; reason: "no_conflict_free_slot" }> = [];

  for (const session of sessions) {
    let selection: PlannedPlacement | undefined;
    for (const day of eventDays(input.event)) {
      for (let minute = 9 * 60; minute + session.durationMinutes <= 17 * 60; minute += 15) {
        const startsAt = zonedDateTimeToIso(day, minute, input.event.timezone);
        const endsAt = new Date(Date.parse(startsAt) + session.durationMinutes * 60_000).toISOString();
        for (const room of rooms) {
          const candidate: PlannedPlacement = { sessionId: session.id, roomId: room.id, startsAt, endsAt };
          if (hasRoomOverlap(candidate, allPlacements)) continue;
          if (hasSpeakerOverlap(candidate, session, allPlacements, sessionsById)) continue;
          selection = candidate;
          break;
        }
        if (selection) break;
      }
      if (selection) break;
    }
    if (!selection) {
      unplaced.push({ sessionId: session.id, reason: "no_conflict_free_slot" });
      continue;
    }
    planned.push(selection);
    allPlacements.push({ id: `planned:${session.id}`, revisionId: "planned", ...selection });
  }
  return { placements: planned, unplaced };
}

function hasRoomOverlap(candidate: PlannedPlacement, placements: ReadonlyArray<SchedulePlacement>): boolean {
  return placements.some((placement) => placement.roomId === candidate.roomId && intervalsOverlap(candidate, placement));
}

function hasSpeakerOverlap(
  candidate: PlannedPlacement,
  session: ScheduleSession,
  placements: ReadonlyArray<SchedulePlacement>,
  sessionsById: ReadonlyMap<string, ScheduleSession>,
): boolean {
  const speakerIds = new Set(session.speakers.map((speaker) => speaker.personId));
  return placements.some((placement) => {
    if (!intervalsOverlap(candidate, placement)) return false;
    return sessionsById.get(placement.sessionId)?.speakers.some((speaker) => speakerIds.has(speaker.personId)) ?? false;
  });
}

function overlapRange(left: SchedulePlacement, right: SchedulePlacement) {
  return {
    startsAt: new Date(Math.max(Date.parse(left.startsAt), Date.parse(right.startsAt))).toISOString(),
    endsAt: new Date(Math.min(Date.parse(left.endsAt), Date.parse(right.endsAt))).toISOString(),
  };
}

function parseDateOnly(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid event date: ${value}`);
  return Date.UTC(year, month - 1, day);
}

export function zonedDateTimeToIso(day: string, minuteOfDay: number, timezone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) throw new Error(`Invalid event date: ${day}`);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const targetWallTime = Date.UTC(year, month - 1, date, hour, minute);
  let candidate = targetWallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const observedWallTime = Date.UTC(values.year ?? year, (values.month ?? month) - 1, values.day ?? date, values.hour ?? hour, values.minute ?? minute);
    const adjustment = targetWallTime - observedWallTime;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate).toISOString();
}
