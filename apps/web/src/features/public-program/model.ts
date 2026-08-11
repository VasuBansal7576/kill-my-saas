import type { PublishedProgram, PublicSession, PublicSpeaker } from "./types";

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
  const options: Intl.DateTimeFormatOptions = includeDate
    ? { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { timeZone: timezone, hour: "numeric", minute: "2-digit" };
  const formatter = new Intl.DateTimeFormat(undefined, options);
  return `${formatter.format(new Date(session.startsAt))}–${new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(session.endsAt))}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? "").join("") || "?";
}
