export interface ScheduleEvent {
  id: string;
  slug: string;
  name: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
}

export interface ScheduleRevisionRecord {
  id: string;
  eventId: string;
  version: number;
  status: "draft" | "ready";
  inUse: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleRoom {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ScheduleTrack {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ScheduleSession {
  id: string;
  title: string;
  trackId: string | null;
  trackName: string | null;
  formatName: string | null;
  durationMinutes: number;
  speakers: Array<{ personId: string; displayName: string }>;
}

export interface SchedulePlacement {
  id: string;
  revisionId: string;
  sessionId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
}

export interface ScheduleSnapshot {
  event: ScheduleEvent;
  revision: ScheduleRevisionRecord | null;
  revisions: ScheduleRevisionRecord[];
  rooms: ScheduleRoom[];
  tracks: ScheduleTrack[];
  sessions: ScheduleSession[];
  placements: SchedulePlacement[];
}

export interface ScheduleConflict {
  id: string;
  type: "room_overlap" | "speaker_double_booking";
  sessionIds: [string, string];
  startsAt: string;
  endsAt: string;
  roomId?: string;
  speaker?: { personId: string; displayName: string };
  message: string;
}

export interface ScheduleReadiness {
  ready: boolean;
  revisionId: string | null;
  unscheduledCount: number;
  conflictCount: number;
  reasons: string[];
}

export interface AgendaWorkspace {
  event: ScheduleEvent;
  revision: null | {
    id: string;
    version: number;
    status: "draft" | "ready";
    inUse: boolean;
    createdAt: string;
    updatedAt: string;
  };
  revisions: Array<{
    id: string;
    version: number;
    status: "draft" | "ready";
    inUse: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  days: string[];
  rooms: ScheduleRoom[];
  tracks: ScheduleTrack[];
  sessions: Array<ScheduleSession & { placement: SchedulePlacement | null }>;
  conflicts: ScheduleConflict[];
  readiness: ScheduleReadiness;
}

export interface AutoPlaceResult {
  workspace: AgendaWorkspace;
  placedSessionIds: string[];
  unplaced: Array<{ sessionId: string; reason: "no_rooms" | "no_conflict_free_slot" }>;
}

export interface ConflictFreeRevisionHandoff {
  eventId: string;
  revisionId: string;
  version: number;
  placementCount: number;
  verifiedAt: string;
}

export interface SchedulingRepositoryPort {
  findEventBySlug(eventSlug: string): Promise<ScheduleEvent>;
  loadSnapshot(event: ScheduleEvent, revisionId?: string): Promise<ScheduleSnapshot>;
  createDraftRevision(eventId: string): Promise<ScheduleRevisionRecord>;
  placeSession(input: {
    eventId: string;
    revisionId: string;
    sessionId: string;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<void>;
  unplaceSession(eventId: string, revisionId: string, sessionId: string): Promise<void>;
  applyAutoPlacements(eventId: string, revisionId: string, placements: Array<{
    sessionId: string;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
  }>): Promise<void>;
  setRevisionStatus(eventId: string, revisionId: string, status: "draft" | "ready"): Promise<void>;
}
