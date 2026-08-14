import type { DashboardSnapshot } from "./types";

export async function loadDashboard(eventSlug: string): Promise<DashboardSnapshot> {
  const response = await fetch(`/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/dashboard`);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Dashboard request failed with status ${response.status}.`);
  }
  return response.json() as Promise<DashboardSnapshot>;
}
