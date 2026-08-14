export type AgendaView = "day" | "week" | "list" | "track" | "room";

export interface AgendaPlacement {
  id: string;
  revisionId: string;
  sessionId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
}

export interface AgendaSession {
  id: string;
  title: string;
  trackId: string | null;
  trackName: string | null;
  formatName: string | null;
  durationMinutes: number;
  speakers: Array<{ personId: string; displayName: string }>;
  placement: AgendaPlacement | null;
}

export interface AgendaWorkspace {
  event: { id: string; slug: string; name: string; startsOn: string; endsOn: string; timezone: string };
  revision: null | { id: string; version: number; status: "draft" | "ready"; inUse: boolean; createdAt: string; updatedAt: string };
  revisions: Array<{ id: string; version: number; status: "draft" | "ready"; inUse: boolean; createdAt: string; updatedAt: string }>;
  days: string[];
  rooms: Array<{ id: string; name: string; sortOrder: number }>;
  tracks: Array<{ id: string; name: string; sortOrder: number }>;
  sessions: AgendaSession[];
  conflicts: Array<{
    id: string;
    type: "room_overlap" | "speaker_double_booking";
    sessionIds: [string, string];
    startsAt: string;
    endsAt: string;
    roomId?: string;
    speaker?: { personId: string; displayName: string };
    message: string;
  }>;
  repairSuggestions: AgendaRepairSuggestion[];
  readiness: { ready: boolean; revisionId: string | null; unscheduledCount: number; conflictCount: number; reasons: string[] };
}

export interface AgendaRepairSuggestion {
  id: string;
  revisionId: string;
  sessionId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  resolvesConflictIds: string[];
}

export interface PlacementSuggestionsResult {
  revisionId: string;
  suggestions: AgendaRepairSuggestion[];
}

export interface AutoPlaceResult {
  workspace: AgendaWorkspace;
  placedSessionIds: string[];
  unplaced: Array<{ sessionId: string; reason: "no_rooms" | "no_conflict_free_slot" }>;
}
