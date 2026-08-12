export interface FileComment { id: string; authorPersonId: string; authorName: string; body: string; createdAt: string }
export interface FileVersion { id: string; version: number; originalName: string; mediaType: string; byteSize: number; checksumSha256: string; uploadedByPersonId: string; createdAt: string; latest: boolean; comments: FileComment[] }
export interface Deliverable {
  id: string;
  eventId: string;
  taskAssignmentId: string | null;
  eventSpeakerId: string;
  personId: string;
  speakerName: string;
  taskTitle: string;
  instructions: string;
  dueAt: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  status: "pending" | "submitted" | "changes_requested" | "approved";
  latestVersion: number;
  acceptedMediaTypes: string[];
  maxByteSize: number;
  handoff: "session_file" | "speaker_headshot";
  versions: FileVersion[];
}
export interface SpeakerChoice { eventSpeakerId: string; displayName: string; assignedSessions?: Array<{ id: string; title: string }> }
export interface SessionContent {
  id: string;
  title: string;
  abstract: string;
  contentStatus: "draft" | "in_review" | "approved";
  revision: number;
  history: Array<{ version: number; title: string; abstract: string; contentStatus: string; createdByName: string; createdAt: string }>;
}
export interface SpeakerContent {
  profileId: string;
  displayName: string;
  biography: string;
  company: string;
  jobTitle: string;
  headshotFileId: string | null;
  version: number;
  history: Array<{ version: number; createdByName: string; createdAt: string }>;
}
export interface FileExport { id: string; status: "pending" | "building" | "ready" | "failed" | "blocked_external"; failureCode: string | null; createdAt: string }
