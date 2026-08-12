import type { ProgramReadinessException } from "./types";

type ReadinessEvent = { organizationId: string; slug: string };

export function readinessAction(
  event: ReadinessEvent,
  exception: Pick<ProgramReadinessException, "code" | "workspace">,
): { label: string; to: string } {
  const base = `/organizer/events/${encodeURIComponent(event.slug)}`;
  if (exception.code === "employer_approval_pending") return { label: "Draft a chase", to: `${base}/communications?chase=employer-approval` };
  if (exception.workspace === "communications") return { label: "Inspect & retry", to: `${base}/communications` };
  if (exception.workspace === "speaker_crm") return { label: "Review identity", to: `/organizer/organizations/${encodeURIComponent(event.organizationId)}/speaker-crm` };
  if (exception.workspace === "publishing") return { label: "Open publication", to: `${base}/publish` };
  if (exception.workspace === "accelevents") return { label: "Inspect & retry", to: `${base}/integrations/accelevents` };
  return { label: "Inspect & rerun", to: `${base}/integrations/airtable` };
}
