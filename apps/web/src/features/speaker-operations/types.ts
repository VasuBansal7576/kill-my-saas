export type SpeakerStatus = "invited" | "onboarding" | "ready" | "withdrawn";
export type TaskStatus = "pending" | "complete";

export interface SpeakerTaskAssignment {
  id: string;
  eventSpeakerId: string;
  displayName: string;
  status: TaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  response: Record<string, unknown> | null;
}

export interface SpeakerTask {
  id: string;
  title: string;
  description: string;
  kind: "action" | "form" | "file_request";
  required: boolean;
  dueAt: string | null;
  configuration: Record<string, unknown>;
  assignments: SpeakerTaskAssignment[];
}

export interface SpeakerTasksWorkspace {
  event: { id: string; slug: string; name: string; timezone: string };
  tasks: SpeakerTask[];
}

export interface RosterSpeaker {
  eventSpeakerId: string;
  personId: string;
  displayName: string;
  email: string | null;
  status: SpeakerStatus;
  biography: string;
  company: string;
  jobTitle: string;
  headshotFileId: string | null;
  socialLinks: Record<string, string>;
  logistics: Record<string, string>;
  taskProgress: { complete: number; total: number; overdue: number };
  sessionCount: number;
}

export interface SpeakerDetail extends RosterSpeaker {
  tasks: Array<SpeakerTaskAssignment & Omit<SpeakerTask, "id" | "assignments" | "dueAt"> & { taskId: string }>;
  assignedSessions: Array<{ id: string; title: string; abstract: string; contentStatus: "draft" | "in_review" | "approved"; role: string }>;
}

export interface SpeakerResource {
  id: string;
  eventId?: string;
  slug: string;
  title: string;
  summary: string;
  contentHtml: string;
  status?: "draft" | "published";
  visibleToStatuses?: SpeakerStatus[];
  allowedEmbedOrigins?: string[];
  revision: number;
}

export interface SpeakerPortal {
  event: { id: string; slug: string; name: string; timezone: string };
  speaker: SpeakerDetail;
  resources: SpeakerResource[];
}

export interface ApiErrorBody { error?: { message?: string } }

export interface SpeakerImportPreviewRow {
  row: number;
  input: { displayName: string; email: string; jobTitle: string; company: string; biography: string };
  normalizedEmail: string;
  issues: Array<{ field: string; message: string }>;
  duplicateOfRow: number | null;
  identity: "new_person" | "existing_person" | "existing_event_speaker" | "duplicate_in_file";
  personId: string | null;
  selected: boolean;
  dirty?: boolean;
}
