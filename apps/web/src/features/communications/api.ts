import type { ApiErrorBody, AudienceSpeaker, CommunicationsWorkspace } from "./types";

export async function getCommunications(eventSlug: string): Promise<CommunicationsWorkspace> {
  return request(`/api/v1/organizer/events/${eventSlug}/communications`);
}

export async function getAudienceSpeakers(eventSlug: string, filters: { search: string; status: string; taskStatus: string; employerApprovalStatus: string }): Promise<AudienceSpeaker[]> {
  const query = new URLSearchParams();
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.status) query.set("status", filters.status);
  if (filters.taskStatus !== "all" && filters.taskStatus !== "overdue") query.set("taskStatus", filters.taskStatus);
  if (filters.employerApprovalStatus) query.set("employerApprovalStatus", filters.employerApprovalStatus);
  const speakers = await request<AudienceSpeaker[]>(`/api/v1/organizer/events/${eventSlug}/speakers?${query}`);
  return filters.taskStatus === "overdue" ? speakers.filter((speaker) => speaker.taskProgress.overdue > 0) : speakers;
}

export async function saveCommunicationTemplate(eventSlug: string, input: {
  name: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  revision?: number;
}) {
  return request(`/api/v1/organizer/events/${eventSlug}/communications/templates`, { method: "PUT", body: JSON.stringify(input) });
}

export async function queueCampaign(eventSlug: string, input: Record<string, unknown>) {
  return request<{ communicationId: string; recipientCount: number; outboxEventIds: string[] }>(
    `/api/v1/organizer/events/${eventSlug}/communications`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function retryRecipient(eventSlug: string, recipientId: string) {
  return request(`/api/v1/organizer/events/${eventSlug}/communications/deliveries/${recipientId}/retry`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: `delivery-retry:${recipientId}:${crypto.randomUUID()}` }),
  });
}

export async function pollRecipient(eventSlug: string, recipientId: string) {
  return request(`/api/v1/organizer/events/${eventSlug}/communications/deliveries/${recipientId}/poll`, { method: "POST" });
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", headers: { "content-type": "application/json", ...init?.headers }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
