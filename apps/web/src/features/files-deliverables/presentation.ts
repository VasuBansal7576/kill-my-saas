export type SpeakerFileWorkspaceState = "ready" | "handoff_pending" | "empty";

export function speakerFileWorkspaceState(deliverableCount: number, pendingFileRequestCount: number): SpeakerFileWorkspaceState {
  if (deliverableCount > 0) return "ready";
  if (pendingFileRequestCount > 0) return "handoff_pending";
  return "empty";
}
