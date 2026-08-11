import type { CrmContact, CrmContactDetail, CrmDuplicateGroup, CrmEvent, CrmFilters, CrmMetrics, CrmOutreachHandoff, CrmPipeline, CrmSegment } from "./types";

function base(organizationId: string) { return `/api/v1/organizer/organizations/${organizationId}/speaker-crm`; }
export async function requestCrmJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}.`);
  }
  return response.json() as Promise<T>;
}
function json(method: "POST" | "PATCH", body: unknown): RequestInit { return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }; }

export function getCrmDirectory(organizationId: string, filters: CrmFilters) {
  const query = new URLSearchParams({ search: filters.search });
  if (filters.companies.length) query.set("companies", filters.companies.join(","));
  if (filters.jobTitles.length) query.set("jobTitles", filters.jobTitles.join(","));
  if (filters.tags.length) query.set("tags", filters.tags.join(","));
  if (Object.keys(filters.metadata).length) query.set("metadata", JSON.stringify(filters.metadata));
  return requestCrmJson<CrmContact[]>(`${base(organizationId)}/contacts?${query}`);
}
export function getCrmContact(organizationId: string, contactId: string) { return requestCrmJson<CrmContactDetail>(`${base(organizationId)}/contacts/${contactId}`); }
export function addCrmContact(organizationId: string, body: unknown) { return requestCrmJson<CrmContactDetail>(`${base(organizationId)}/contacts`, json("POST", body)); }
export function updateCrmContact(organizationId: string, contactId: string, body: unknown) { return requestCrmJson<CrmContactDetail>(`${base(organizationId)}/contacts/${contactId}`, json("PATCH", body)); }
export function addCrmNote(organizationId: string, contactId: string, body: string) { return requestCrmJson<CrmContactDetail>(`${base(organizationId)}/contacts/${contactId}/notes`, json("POST", { body })); }
export function importCrmCsv(organizationId: string, csv: string) { return requestCrmJson<{ imported: number; reused: number }>(`${base(organizationId)}/import`, json("POST", { csv })); }
export function getCrmDuplicates(organizationId: string) { return requestCrmJson<CrmDuplicateGroup[]>(`${base(organizationId)}/duplicates`); }
export function mergeCrmContacts(organizationId: string, primaryContactId: string, duplicateContactId: string) { return requestCrmJson<CrmContactDetail>(`${base(organizationId)}/merge`, json("POST", { primaryContactId, duplicateContactId, reason: "Organizer-confirmed duplicate" })); }
export function getCrmSegments(organizationId: string) { return requestCrmJson<CrmSegment[]>(`${base(organizationId)}/segments`); }
export function saveCrmSegment(organizationId: string, name: string, filters: CrmFilters) { return requestCrmJson<CrmSegment>(`${base(organizationId)}/segments`, json("POST", { name, filters })); }
export function openCrmSegment(organizationId: string, segmentId: string) { return requestCrmJson<{ segment: CrmSegment; members: CrmContact[] }>(`${base(organizationId)}/segments/${segmentId}`); }
export function getCrmPipeline(organizationId: string) { return requestCrmJson<CrmPipeline>(`${base(organizationId)}/pipeline`); }
export function enrollCrmContact(organizationId: string, contactId: string) { return requestCrmJson<CrmContactDetail>(`${base(organizationId)}/pipeline/${contactId}/enroll`, json("POST", {})); }
export function moveCrmContact(organizationId: string, contactId: string, stageId: string, note = "") { return requestCrmJson<CrmContactDetail>(`${base(organizationId)}/pipeline/${contactId}/move`, json("POST", { stageId, note })); }
export function getCrmEvents(organizationId: string) { return requestCrmJson<CrmEvent[]>(`${base(organizationId)}/events`); }
export function pushCrmContact(organizationId: string, contactId: string, eventId: string) { return requestCrmJson<{ eventSpeakerId: string; idempotent: boolean }>(`${base(organizationId)}/push-to-event`, json("POST", { organizationId, contactId, eventId, idempotencyKey: `crm-event:${contactId}:${eventId}` })); }
export function createCrmOutreach(organizationId: string, body: unknown) { return requestCrmJson<CrmOutreachHandoff>(`${base(organizationId)}/outreach-handoffs`, json("POST", body)); }
export function getCrmMetrics(organizationId: string) { return requestCrmJson<CrmMetrics>(`${base(organizationId)}/metrics`); }
