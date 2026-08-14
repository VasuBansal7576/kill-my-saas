import type { PublishedProgram, PublicSession, PublicSpeaker } from "./types";
import { formatEventTimeRange } from "../../app/event-time";

export interface PublicFilters {
  search: string;
  trackId: string;
  formatId: string;
  roomId: string;
}

export function filterSessions(program: PublishedProgram, filters: PublicFilters): PublicSession[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return program.sessions.filter((session) => {
    if (filters.trackId && session.track?.id !== filters.trackId) return false;
    if (filters.formatId && session.format?.id !== filters.formatId) return false;
    if (filters.roomId && session.room.id !== filters.roomId) return false;
    return !search || `${session.title} ${session.speakers.map((speaker) => speaker.name).join(" ")}`.toLocaleLowerCase().includes(search);
  });
}

export function filterSpeakers(program: PublishedProgram, search: string): PublicSpeaker[] {
  const query = search.trim().toLocaleLowerCase();
  return program.speakers.filter((speaker) => !query || speaker.name.toLocaleLowerCase().includes(query));
}

export function sessionsByStart(sessions: PublicSession[]): PublicSession[] {
  return [...sessions].sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.title.localeCompare(right.title));
}

export function sessionsAtTime(sessions: PublicSession[], startsAt: string): PublicSession[] {
  return sessions.filter((session) => session.startsAt === startsAt);
}

export function startTimes(sessions: PublicSession[]): string[] {
  return [...new Set(sessions.map((session) => session.startsAt))].sort();
}

export function formatDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${value}T00:00:00Z`));
}

export function formatRange(session: PublicSession, timezone: string, includeDate = false): string {
  return formatEventTimeRange(session.startsAt, session.endsAt, timezone, includeDate);
}

export function optimisticItinerarySelection(current: ReadonlySet<string>, sessionId: string) {
  const selected = current.has(sessionId);
  const next = new Set(current);
  if (selected) next.delete(sessionId);
  else next.add(sessionId);
  return { method: selected ? "DELETE" as const : "PUT" as const, next };
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? "").join("") || "?";
}

export function biographyForDisplay(value: string): string {
  const biography = value.replace(/\bSBEK-[A-Z0-9-]+\b/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  if (!biography) return "";
  const midpoint = Math.floor(biography.length / 2);
  if (biography.length % 2 === 0 && biography.slice(0, midpoint).trim() === biography.slice(midpoint).trim()) {
    return biography.slice(0, midpoint).trim();
  }
  return biography
    .split(/\n\s*\n/)
    .filter((paragraph, index, paragraphs) => index === 0 || paragraph.trim() !== paragraphs[index - 1]?.trim())
    .join("\n\n");
}
