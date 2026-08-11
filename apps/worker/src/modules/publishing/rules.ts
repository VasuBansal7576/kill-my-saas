export interface PublishableRevisionSnapshot {
  eventId: string;
  revisionId: string;
  revisionStatus: "draft" | "ready";
  handoff: {
    eventId: string;
    revisionId: string;
    version: number;
    placementCount: number;
  };
  version: number;
  sessionIds: string[];
  approvedSessionIds: string[];
  placements: Array<{
    sessionId: string;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
  }>;
  sessionSpeakers: Array<{ sessionId: string; personId: string }>;
}

export type PublicationRuleErrorCode =
  | "handoff_mismatch"
  | "revision_not_ready"
  | "unscheduled_sessions"
  | "room_conflict"
  | "speaker_conflict"
  | "no_approved_content";

export class PublicationRuleError extends Error {
  constructor(readonly code: PublicationRuleErrorCode, message: string) {
    super(message);
  }
}

/** Rechecks Scheduling's handoff while the schedule revision row is locked. */
export function assertPublishableRevision(snapshot: PublishableRevisionSnapshot): void {
  if (
    snapshot.handoff.eventId !== snapshot.eventId
    || snapshot.handoff.revisionId !== snapshot.revisionId
    || snapshot.handoff.version !== snapshot.version
    || snapshot.handoff.placementCount !== snapshot.placements.length
  ) {
    throw new PublicationRuleError("handoff_mismatch", "Scheduling's conflict-free handoff no longer matches this revision.");
  }
  if (snapshot.revisionStatus !== "ready") {
    throw new PublicationRuleError("revision_not_ready", "Scheduling has not marked this revision ready.");
  }
  const placed = new Set(snapshot.placements.map((placement) => placement.sessionId));
  const missing = snapshot.sessionIds.filter((sessionId) => !placed.has(sessionId));
  if (missing.length > 0 || placed.size !== snapshot.sessionIds.length) {
    throw new PublicationRuleError("unscheduled_sessions", `${missing.length || 1} session(s) are not represented exactly once in this revision.`);
  }
  if (snapshot.approvedSessionIds.length === 0) {
    throw new PublicationRuleError("no_approved_content", "Approve at least one scheduled session before going live.");
  }

  const ordered = [...snapshot.placements].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex];
      if (!right || right.startsAt >= left.endsAt) break;
      if (left.roomId === right.roomId && overlaps(left, right)) {
        throw new PublicationRuleError("room_conflict", "A room overlap appeared after Scheduling created its handoff.");
      }
    }
  }

  const peopleBySession = new Map<string, Set<string>>();
  for (const row of snapshot.sessionSpeakers) {
    const people = peopleBySession.get(row.sessionId) ?? new Set<string>();
    people.add(row.personId);
    peopleBySession.set(row.sessionId, people);
  }
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex];
      if (!right || right.startsAt >= left.endsAt) break;
      if (!overlaps(left, right)) continue;
      const leftPeople = peopleBySession.get(left.sessionId) ?? new Set<string>();
      const rightPeople = peopleBySession.get(right.sessionId) ?? new Set<string>();
      if ([...leftPeople].some((personId) => rightPeople.has(personId))) {
        throw new PublicationRuleError("speaker_conflict", "A speaker double-booking appeared after Scheduling created its handoff.");
      }
    }
  }
}

function overlaps(left: { startsAt: Date; endsAt: Date }, right: { startsAt: Date; endsAt: Date }): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}
