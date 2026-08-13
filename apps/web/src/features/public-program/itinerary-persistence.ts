import { publicProgramRequest } from "./api";

export interface PendingItineraryMutation {
  eventId: string;
  eventSlug: string;
  sessionId: string;
  method: "PUT" | "DELETE";
  selected: boolean;
}

interface ItineraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type ItineraryRequest = (url: string, init: RequestInit) => Promise<{ selectedSessionIds: string[] }>;

export function itineraryMutationKey(eventId: string) {
  return `programflow-itinerary-pending:${eventId}`;
}

export function readPendingItineraryMutation(storage: ItineraryStorage, eventId: string): PendingItineraryMutation | null {
  try {
    const value = JSON.parse(storage.getItem(itineraryMutationKey(eventId)) ?? "null") as Partial<PendingItineraryMutation> | null;
    if (!value || value.eventId !== eventId || typeof value.eventSlug !== "string" || typeof value.sessionId !== "string") return null;
    if ((value.method !== "PUT" && value.method !== "DELETE") || typeof value.selected !== "boolean") return null;
    return value as PendingItineraryMutation;
  } catch {
    return null;
  }
}

export function clearPendingItineraryMutation(storage: ItineraryStorage, eventId: string) {
  try { storage.removeItem(itineraryMutationKey(eventId)); } catch { /* Persistence still succeeds when storage is unavailable. */ }
}

export function itineraryMutationMatchesSelection(mutation: PendingItineraryMutation, selectedSessionIds: ReadonlySet<string>) {
  return selectedSessionIds.has(mutation.sessionId) === mutation.selected;
}

export async function persistItineraryMutation(
  mutation: PendingItineraryMutation,
  recoveryToken: string | null,
  storage: ItineraryStorage = window.localStorage,
  request: ItineraryRequest = publicProgramRequest,
) {
  try { storage.setItem(itineraryMutationKey(mutation.eventId), JSON.stringify(mutation)); } catch { /* Keepalive still protects the active request. */ }
  const response = await request(
    `/api/v1/public/program/${encodeURIComponent(mutation.eventSlug)}/anonymous-itinerary/sessions/${mutation.sessionId}`,
    {
      method: mutation.method,
      keepalive: true,
      headers: recoveryToken ? { "x-itinerary-recovery": recoveryToken } : undefined,
    },
  );
  clearPendingItineraryMutation(storage, mutation.eventId);
  return response;
}
