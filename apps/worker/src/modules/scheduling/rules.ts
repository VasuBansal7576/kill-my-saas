import type {
  ScheduleConflict,
  ScheduleEvent,
  SchedulePlacement,
  ScheduleRepairSuggestion,
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

const SUGGESTION_LIMIT = 4;

export function planConflictRepairSuggestions(input: {
  event: ScheduleEvent;
  revisionId: string;
  rooms: ReadonlyArray<ScheduleRoom>;
  sessions: ReadonlyArray<ScheduleSession>;
  placements: ReadonlyArray<SchedulePlacement>;
  conflicts: ReadonlyArray<ScheduleConflict>;
  limit?: number;
}): ScheduleRepairSuggestion[] {
  const conflictIdsBySession = new Map<string, string[]>();
  for (const conflict of input.conflicts) {
    for (const sessionId of conflict.sessionIds) {
      const conflictIds = conflictIdsBySession.get(sessionId) ?? [];
      conflictIds.push(conflict.id);
      conflictIdsBySession.set(sessionId, conflictIds);
    }
  }
  return planPlacementSuggestions({
    ...input,
    targetSessionIds: [...conflictIdsBySession.keys()],
    conflictIdsBySession,
    limit: input.limit ?? SUGGESTION_LIMIT,
  });
}

export function planSessionPlacementSuggestions(input: {
  event: ScheduleEvent;
  revisionId: string;
  sessionId: string;
  rooms: ReadonlyArray<ScheduleRoom>;
  sessions: ReadonlyArray<ScheduleSession>;
  placements: ReadonlyArray<SchedulePlacement>;
  limit?: number;
}): ScheduleRepairSuggestion[] {
  return planPlacementSuggestions({
    ...input,
    targetSessionIds: [input.sessionId],
    conflictIdsBySession: new Map(),
    limit: input.limit ?? 3,
  });
}

function planPlacementSuggestions(input: {
  event: ScheduleEvent;
  revisionId: string;
  rooms: ReadonlyArray<ScheduleRoom>;
  sessions: ReadonlyArray<ScheduleSession>;
  placements: ReadonlyArray<SchedulePlacement>;
  targetSessionIds: ReadonlyArray<string>;
  conflictIdsBySession: ReadonlyMap<string, string[]>;
  limit: number;
}): ScheduleRepairSuggestion[] {
  if (input.limit <= 0 || input.rooms.length === 0) return [];
  const rooms = [...input.rooms].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const sessionsById = new Map(input.sessions.map((session) => [session.id, session]));
  const placementsBySessionId = new Map(input.placements.map((placement) => [placement.sessionId, placement]));
  const targets = [...new Set(input.targetSessionIds)]
    .filter((sessionId) => sessionsById.has(sessionId))
    .sort((left, right) => {
      const leftPlacement = placementsBySessionId.get(left);
      const rightPlacement = placementsBySessionId.get(right);
      return (leftPlacement?.startsAt ?? "").localeCompare(rightPlacement?.startsAt ?? "") || left.localeCompare(right);
    });
  const suggestionsBySession = new Map<string, ScheduleRepairSuggestion[]>();

  for (const sessionId of targets) {
    const session = sessionsById.get(sessionId)!;
    const current = placementsBySessionId.get(sessionId);
    const preferredStart = current?.startsAt ?? zonedDateTimeToIso(eventDays(input.event)[0]!, 9 * 60, input.event.timezone);
    const otherPlacements = input.placements.filter((placement) => placement.sessionId !== sessionId);
    const candidates: Array<{
      suggestion: ScheduleRepairSuggestion;
      distance: number;
      sameRoom: boolean;
      roomOrder: number;
    }> = [];
    for (const day of eventDays(input.event)) {
      for (let minute = 9 * 60; minute + session.durationMinutes <= 17 * 60; minute += 15) {
        const startsAt = zonedDateTimeToIso(day, minute, input.event.timezone);
        const endsAt = new Date(Date.parse(startsAt) + session.durationMinutes * 60_000).toISOString();
        for (const room of rooms) {
          const candidate: PlannedPlacement = { sessionId, roomId: room.id, startsAt, endsAt };
          if (current && room.id === current.roomId && startsAt === current.startsAt && endsAt === current.endsAt) continue;
          if (hasRoomOverlap(candidate, otherPlacements)) continue;
          if (hasSpeakerOverlap(candidate, session, otherPlacements, sessionsById)) continue;
          candidates.push({
            suggestion: {
              id: `repair:${input.revisionId}:${sessionId}:${room.id}:${startsAt}`,
              revisionId: input.revisionId,
              sessionId,
              roomId: room.id,
              startsAt,
              endsAt,
              resolvesConflictIds: [...(input.conflictIdsBySession.get(sessionId) ?? [])].sort(),
            },
            distance: Math.abs(Date.parse(startsAt) - Date.parse(preferredStart)),
            sameRoom: room.id === current?.roomId,
            roomOrder: room.sortOrder,
          });
        }
      }
    }
    candidates.sort((left, right) => left.distance - right.distance
      || Number(right.sameRoom) - Number(left.sameRoom)
      || left.suggestion.startsAt.localeCompare(right.suggestion.startsAt)
      || left.roomOrder - right.roomOrder
      || left.suggestion.roomId.localeCompare(right.suggestion.roomId));
    suggestionsBySession.set(sessionId, candidates.slice(0, input.limit).map((candidate) => candidate.suggestion));
  }

  const suggestions: ScheduleRepairSuggestion[] = [];
  for (let rank = 0; suggestions.length < input.limit; rank += 1) {
    let added = false;
    for (const sessionId of targets) {
      const suggestion = suggestionsBySession.get(sessionId)?.[rank];
      if (!suggestion) continue;
      suggestions.push(suggestion);
      added = true;
      if (suggestions.length === input.limit) break;
    }
    if (!added) break;
  }
  return suggestions;
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
