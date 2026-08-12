import type { ProgramReadinessException } from "./types";

type ReadinessEvent = { organizationId: string; slug: string };

export function readinessAction(
  event: ReadinessEvent,
  workspace: ProgramReadinessException["workspace"],
): { label: string; to: string } {
  const base = `/organizer/events/${encodeURIComponent(event.slug)}`;
  if (workspace === "communications") return { label: "Inspect & retry", to: `${base}/communications` };
  if (workspace === "speaker_crm") return { label: "Review identity", to: `/organizer/organizations/${encodeURIComponent(event.organizationId)}/speaker-crm` };
  if (workspace === "publishing") return { label: "Open publication", to: `${base}/publish` };
  if (workspace === "accelevents") return { label: "Inspect & retry", to: `${base}/integrations/accelevents` };
  return { label: "Inspect & rerun", to: `${base}/integrations/airtable` };
}
