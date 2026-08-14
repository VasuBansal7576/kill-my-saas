import type {
  ApiErrorBody,
  AudienceSpeaker,
  CommunicationDetail,
  CommunicationHistoryPage,
  CommunicationsSummary,
  CommunicationsWorkspace,
  DeliveryPollReceipt,
} from "./types";

const REQUEST_TIMEOUT_MS = 8_000;

export async function getCommunications(eventSlug: string): Promise<CommunicationsWorkspace> {
  return request(`/api/v1/organizer/events/${eventSlug}/communications`);
}

export async function getCommunicationsSummary(eventSlug: string): Promise<CommunicationsSummary> {
  return request(`/api/v1/organizer/events/${eventSlug}/communications/summary`);
}

export async function getCommunicationHistory(eventSlug: string, cursor?: string): Promise<CommunicationHistoryPage> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return request(`/api/v1/organizer/events/${eventSlug}/communications/history?${query}`);
}

export async function getCommunicationDetail(eventSlug: string, communicationId: string): Promise<CommunicationDetail> {
  return request(`/api/v1/organizer/events/${eventSlug}/communications/${communicationId}`);
}

export async function getAudienceSpeakers(eventSlug: string, filters: { search: string; status: string; taskStatus: string }): Promise<AudienceSpeaker[]> {
  const query = new URLSearchParams();
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.status) query.set("status", filters.status);
  if (filters.taskStatus !== "all" && filters.taskStatus !== "overdue") query.set("taskStatus", filters.taskStatus);
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

export async function pollRecipient(eventSlug: string, recipientId: string): Promise<DeliveryPollReceipt> {
  return request(`/api/v1/organizer/events/${eventSlug}/communications/deliveries/${recipientId}/poll`, { method: "POST" });
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { credentials: "include", headers: { "content-type": "application/json", ...init?.headers }, ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as ApiErrorBody;
      throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("This request took longer than 8 seconds. Retry it; no delivery state was assumed.", { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
