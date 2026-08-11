import type { AgendaSession, AgendaView, AgendaWorkspace } from "./types";

export interface AgendaGroup {
  key: string;
  label: string;
  sessions: AgendaSession[];
}

export function groupsForView(workspace: AgendaWorkspace, view: Exclude<AgendaView, "day">): AgendaGroup[] {
  const scheduled = workspace.sessions.filter((session) => session.placement).sort(compareSessions);
  if (view === "list") return [{ key: "all", label: "All scheduled sessions", sessions: scheduled }];
  if (view === "week") {
    return workspace.days.map((day) => ({
      key: day,
      label: formatDay(day),
      sessions: scheduled.filter((session) => localDate(session.placement!.startsAt, workspace.event.timezone) === day),
    }));
  }
  if (view === "track") {
    const groups = workspace.tracks.map((track) => ({ key: track.id, label: track.name, sessions: scheduled.filter((session) => session.trackId === track.id) }));
    const untracked = scheduled.filter((session) => !session.trackId || !workspace.tracks.some((track) => track.id === session.trackId));
    return untracked.length > 0 ? [...groups, { key: "untracked", label: "No track", sessions: untracked }] : groups;
  }
  return workspace.rooms.map((room) => ({
    key: room.id,
    label: room.name,
    sessions: scheduled.filter((session) => session.placement?.roomId === room.id),
  }));
}

export function sessionConflictIds(workspace: AgendaWorkspace): Set<string> {
  return new Set(workspace.conflicts.flatMap((conflict) => conflict.sessionIds));
}

export function zonedDateTimeToIso(day: string, time: string, timezone: string): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) throw new Error("Choose a valid event day.");
  const target = Date.UTC(year, month - 1, date, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const observed = Date.UTC(values.year ?? year, (values.month ?? month) - 1, values.day ?? date, values.hour ?? hour, values.minute ?? minute);
    const adjustment = target - observed;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate).toISOString();
}

export function localDate(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function compareSessions(left: AgendaSession, right: AgendaSession): number {
  return (left.placement?.startsAt ?? "").localeCompare(right.placement?.startsAt ?? "") || left.title.localeCompare(right.title);
}
