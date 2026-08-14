import type { EvaluationEvidenceCenter } from "./types";

export async function loadEvaluationEvidence(eventSlug: string): Promise<EvaluationEvidenceCenter> {
  const response = await fetch(`/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/evaluation-evidence`);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Evidence request failed with status ${response.status}.`);
  }
  return response.json() as Promise<EvaluationEvidenceCenter>;
}
