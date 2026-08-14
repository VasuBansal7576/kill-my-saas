import type {
  AcceleventsFieldMapping,
  AcceleventsReferenceMapping,
  AcceleventsRunReceipt,
  AcceleventsWorkspace,
} from "./types";

export function getAcceleventsWorkspace(eventSlug: string): Promise<AcceleventsWorkspace> {
  return request(`/api/v1/organizer/events/${eventSlug}/integrations/accelevents`);
}

export function saveAcceleventsConfiguration(eventSlug: string, input: {
  externalEventUrl: string | null;
  apiBaseUrl: "https://api.accelevents.com";
  credentialBinding: "ACCELEVENTS_API_TOKEN";
  authorizationHeader: "Authorization" | "Key";
  enabled: boolean;
  mappings: AcceleventsFieldMapping[];
  referenceMappings: AcceleventsReferenceMapping[];
}): Promise<AcceleventsWorkspace> {
  return request(`/api/v1/organizer/events/${eventSlug}/integrations/accelevents`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function runAccelevents(workspace: AcceleventsWorkspace, mode: "preview" | "manual" | "retry", sourceRunId?: string): Promise<AcceleventsRunReceipt> {
  return request(`/api/v1/organizer/events/${workspace.event.slug}/integrations/accelevents/runs`, {
    method: "POST",
    body: JSON.stringify({
      organizationId: workspace.event.organizationId,
      eventId: workspace.event.id,
      mode,
      sourceRunId,
      idempotencyKey: `accelevents:${mode}:${sourceRunId ?? workspace.event.id}:${crypto.randomUUID()}`,
    }),
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", headers: { "content-type": "application/json", ...init?.headers }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
