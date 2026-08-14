import type { AirtableFieldMapping, AirtableRunReceipt, AirtableWorkspace } from "./types";

export function getAirtableWorkspace(eventSlug: string): Promise<AirtableWorkspace> {
  return request(`/api/v1/organizer/events/${eventSlug}/integrations/airtable`);
}
export function saveAirtableConfiguration(eventSlug: string, input: {
  baseId: string | null;
  tableId: string | null;
  credentialBinding: "AIRTABLE_TOKEN";
  modifiedTimeField: string | null;
  enabled: boolean;
  pageSize: number;
  mappings: AirtableFieldMapping[];
}): Promise<AirtableWorkspace> {
  return request(`/api/v1/organizer/events/${eventSlug}/integrations/airtable`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function runAirtableSync(workspace: AirtableWorkspace, direction: "export" | "import"): Promise<AirtableRunReceipt> {
  return request(`/api/v1/organizer/events/${workspace.event.slug}/integrations/airtable/sync`, {
    method: "POST",
    body: JSON.stringify({
      organizationId: workspace.event.organizationId,
      eventId: workspace.event.id,
      direction,
      idempotencyKey: `airtable-${direction}:${workspace.event.id}:${crypto.randomUUID()}`,
    }),
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
