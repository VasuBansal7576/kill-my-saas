import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import { deriveScheduleConflicts, eventDays, planAutoPlacements, planConflictRepairSuggestions, planSessionPlacementSuggestions } from "./rules";
import type {
  AgendaWorkspace,
  AutoPlaceResult,
  ConflictFreeRevisionHandoff,
  PlacementSuggestionsResult,
  ScheduleReadiness,
  ScheduleSnapshot,
  SchedulingRepositoryPort,
} from "./types";

type SchedulingErrorCode =
  | "forbidden"
  | "invalid_event"
  | "invalid_interval"
  | "outside_event_dates"
  | "revision_required"
  | "revision_not_ready";

export class SchedulingError extends Error {
  constructor(readonly code: SchedulingErrorCode, message: string) {
    super(message);
  }
}

export class SchedulingService {
  constructor(private readonly repository: SchedulingRepositoryPort) {}

  async getWorkspace(actor: Actor, eventSlug: string, revisionId?: string): Promise<AgendaWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    const snapshot = await this.repository.loadSnapshot(event, revisionId);
    return this.workspaceWithPersistedReadiness(snapshot);
  }

  async createDraftRevision(actor: Actor, eventSlug: string): Promise<AgendaWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    const revision = await this.repository.createDraftRevision(event.id);
    return this.workspaceWithPersistedReadiness(await this.repository.loadSnapshot(event, revision.id));
  }

  async placeSession(actor: Actor, eventSlug: string, command: {
    eventId: string;
    revisionId: string;
    sessionId: string;
    roomId: string;
    startsAt: string;
    endsAt: string;
  }): Promise<AgendaWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    if (command.eventId !== event.id) throw new SchedulingError("invalid_event", "The placement command does not belong to this event.");
    const startsAt = new Date(command.startsAt);
    const endsAt = new Date(command.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
      throw new SchedulingError("invalid_interval", "A placement must have a valid start before its end.");
    }
    const day = localDate(startsAt, event.timezone);
    if (!eventDays(event).includes(day) || localDate(endsAt, event.timezone) !== day) {
      throw new SchedulingError("outside_event_dates", "Place the session wholly within one configured event day.");
    }
    await this.repository.placeSession({ ...command, startsAt, endsAt });
    return this.workspaceWithPersistedReadiness(await this.repository.loadSnapshot(event, command.revisionId));
  }

  async unplaceSession(actor: Actor, eventSlug: string, revisionId: string, sessionId: string): Promise<AgendaWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    await this.repository.unplaceSession(event.id, revisionId, sessionId);
    return this.workspaceWithPersistedReadiness(await this.repository.loadSnapshot(event, revisionId));
  }

  async autoPlace(actor: Actor, eventSlug: string, revisionId: string): Promise<AutoPlaceResult> {
    const event = await this.requireOrganizer(actor, eventSlug);
    const before = await this.repository.loadSnapshot(event, revisionId);
    if (!before.revision) throw new SchedulingError("revision_required", "Create a schedule revision before auto-placing sessions.");
    const plan = planAutoPlacements(before);
    await this.repository.applyAutoPlacements(event.id, revisionId, plan.placements.map((placement) => ({
      ...placement,
      startsAt: new Date(placement.startsAt),
      endsAt: new Date(placement.endsAt),
    })));
    const workspace = await this.workspaceWithPersistedReadiness(await this.repository.loadSnapshot(event, revisionId));
    return { workspace, placedSessionIds: plan.placements.map((placement) => placement.sessionId), unplaced: plan.unplaced };
  }

  async getPlacementSuggestions(
    actor: Actor,
    eventSlug: string,
    revisionId: string,
    sessionId: string,
  ): Promise<PlacementSuggestionsResult> {
    const event = await this.requireOrganizer(actor, eventSlug);
    const snapshot = await this.repository.loadSnapshot(event, revisionId);
    if (!snapshot.revision) throw new SchedulingError("revision_required", "Create a schedule revision before requesting placement suggestions.");
    if (!snapshot.sessions.some((session) => session.id === sessionId)) {
      throw new SchedulingError("invalid_event", "The session does not belong to this event.");
    }
    return {
      revisionId: snapshot.revision.id,
      suggestions: planSessionPlacementSuggestions({
        ...snapshot,
        revisionId: snapshot.revision.id,
        sessionId,
      }),
    };
  }

  async getConflictFreeRevision(
    actor: Actor,
    eventSlug: string,
    revisionId: string,
  ): Promise<ConflictFreeRevisionHandoff> {
    const event = await this.requireOrganizer(actor, eventSlug);
    const snapshot = await this.repository.loadSnapshot(event, revisionId);
    const workspace = await this.workspaceWithPersistedReadiness(snapshot);
    if (!workspace.revision || !workspace.readiness.ready) {
      throw new SchedulingError("revision_not_ready", `Schedule revision is not ready: ${workspace.readiness.reasons.join(" ")}`);
    }
    return {
      eventId: event.id,
      revisionId: workspace.revision.id,
      version: workspace.revision.version,
      placementCount: workspace.sessions.length,
      verifiedAt: new Date().toISOString(),
    };
  }

  private async requireOrganizer(actor: Actor, eventSlug: string) {
    const event = await this.repository.findEventBySlug(eventSlug);
    if (!actorCanAccessEvent(actor, event.id, "organizer")) {
      throw new SchedulingError("forbidden", "Organizer access is required for this event's agenda.");
    }
    return event;
  }

  private async workspaceWithPersistedReadiness(snapshot: ScheduleSnapshot): Promise<AgendaWorkspace> {
    const workspace = toWorkspace(snapshot);
    if (snapshot.revision && workspace.revision && !snapshot.revision.inUse) {
      const status = workspace.readiness.ready ? "ready" : "draft";
      if (snapshot.revision.status !== status) await this.repository.setRevisionStatus(snapshot.event.id, snapshot.revision.id, status);
      workspace.revision = { ...workspace.revision, status };
      workspace.revisions = workspace.revisions.map((revision) => revision.id === snapshot.revision?.id ? { ...revision, status } : revision);
    }
    return workspace;
  }
}

export function toWorkspace(snapshot: ScheduleSnapshot): AgendaWorkspace {
  const conflicts = deriveScheduleConflicts(snapshot.sessions, snapshot.placements, snapshot.rooms);
  const placementsBySessionId = new Map(snapshot.placements.map((placement) => [placement.sessionId, placement]));
  const unscheduledCount = snapshot.sessions.filter((session) => !placementsBySessionId.has(session.id)).length;
  const readiness = scheduleReadiness(snapshot, unscheduledCount, conflicts.length);
  return {
    event: snapshot.event,
    revision: snapshot.revision ? serializeRevision(snapshot.revision) : null,
    revisions: snapshot.revisions.map(serializeRevision),
    days: eventDays(snapshot.event),
    rooms: snapshot.rooms,
    tracks: snapshot.tracks,
    sessions: snapshot.sessions.map((session) => ({ ...session, placement: placementsBySessionId.get(session.id) ?? null })),
    conflicts,
    repairSuggestions: snapshot.revision && !snapshot.revision.inUse ? planConflictRepairSuggestions({
      ...snapshot,
      revisionId: snapshot.revision.id,
      conflicts,
    }) : [],
    readiness,
  };
}

function scheduleReadiness(snapshot: ScheduleSnapshot, unscheduledCount: number, conflictCount: number): ScheduleReadiness {
  const reasons: string[] = [];
  if (!snapshot.revision) reasons.push("No schedule revision exists.");
  if (snapshot.sessions.length === 0) reasons.push("No sessions are available to schedule.");
  if (unscheduledCount > 0) reasons.push(`${unscheduledCount} session${unscheduledCount === 1 ? " is" : "s are"} unscheduled.`);
  if (conflictCount > 0) reasons.push(`${conflictCount} scheduling conflict${conflictCount === 1 ? " remains" : "s remain"}.`);
  return {
    ready: reasons.length === 0,
    revisionId: snapshot.revision?.id ?? null,
    unscheduledCount,
    conflictCount,
    reasons,
  };
}

function serializeRevision(revision: NonNullable<ScheduleSnapshot["revision"]>) {
  return {
    id: revision.id,
    version: revision.version,
    status: revision.status,
    inUse: revision.inUse,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
  };
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
