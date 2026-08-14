import type { PublishedProgram, PublicSession, PublicSpeaker } from "../publishing/contracts";
import type { AgendaQuery, PageMetadata, SessionListQuery, SpeakerListQuery } from "./contracts";

type CursorResource = "sessions" | "speakers" | "agenda";

interface CursorPayload {
  v: 1;
  resource: CursorResource;
  publicationId: string;
  publicRevision: number;
  scope: string;
  id: string;
}

export class PublicApiError extends Error {
  constructor(
    readonly code: "invalid_cursor" | "session_not_found" | "speaker_not_found" | "database_not_configured",
    message: string,
  ) {
    super(message);
  }
}

export function eventResource(program: PublishedProgram) {
  return {
    ...program.event,
    days: program.days,
    tracks: program.tracks,
    formats: program.formats,
    rooms: program.rooms,
    publication: {
      revision: program.publication.publicRevision,
      liveAt: program.publication.liveAt,
    },
  };
}

export function sessionCollection(program: PublishedProgram, query: SessionListQuery) {
  const scope = queryScope(query, ["search", "track", "format", "room", "day", "speaker"]);
  const search = normalized(query.search);
  const speaker = normalized(query.speaker);
  const filtered = [...program.sessions]
    .filter((session) => {
      if (!matchesCatalog(session.track, query.track)) return false;
      if (!matchesCatalog(session.format, query.format)) return false;
      if (!matchesCatalog(session.room, query.room)) return false;
      if (query.day && session.day !== query.day) return false;
      if (speaker && !session.speakers.some((candidate) => matchesText(candidate.name, speaker) || candidate.id === query.speaker)) return false;
      if (!search) return true;
      const haystack = `${session.title} ${session.description} ${session.speakers.map((candidate) => candidate.name).join(" ")}`;
      return matchesText(haystack, search);
    })
    .sort(compareSessions);
  return paginate(program, "sessions", scope, filtered, query.limit, query.cursor);
}

export function sessionResource(program: PublishedProgram, sessionId: string): PublicSession {
  const session = program.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new PublicApiError("session_not_found", "That session is not part of the live published program.");
  return session;
}

export function speakerCollection(program: PublishedProgram, query: SpeakerListQuery) {
  const scope = queryScope(query, ["search", "session"]);
  const search = normalized(query.search);
  const session = normalized(query.session);
  const filtered = [...program.speakers]
    .filter((speaker) => {
      if (session && !speaker.sessions.some((candidate) => candidate.id === query.session || matchesText(candidate.title, session))) return false;
      if (!search) return true;
      return matchesText(`${speaker.name} ${speaker.company} ${speaker.jobTitle} ${speaker.biography}`, search);
    })
    .sort(compareSpeakers);
  return paginate(program, "speakers", scope, filtered, query.limit, query.cursor);
}

export function speakerResource(program: PublishedProgram, speakerId: string): PublicSpeaker {
  const speaker = program.speakers.find((candidate) => candidate.id === speakerId);
  if (!speaker) throw new PublicApiError("speaker_not_found", "That speaker is not part of the live published program.");
  return speaker;
}

export function agendaCollection(program: PublishedProgram, query: AgendaQuery) {
  const scope = queryScope(query, ["track", "format", "room", "day"]);
  const filtered = [...program.sessions]
    .filter((session) => matchesCatalog(session.track, query.track)
      && matchesCatalog(session.format, query.format)
      && matchesCatalog(session.room, query.room)
      && (!query.day || session.day === query.day))
    .sort(compareSessions)
    .map((session) => ({
      id: session.id,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      day: session.day,
      room: session.room,
      track: session.track,
      format: session.format,
      session: {
        id: session.id,
        title: session.title,
        speakers: session.speakers.map(({ id, name, company, jobTitle }) => ({ id, name, company, jobTitle })),
      },
    }));
  return paginate(program, "agenda", scope, filtered, query.limit, query.cursor);
}

function paginate<T extends { id: string }>(
  program: PublishedProgram,
  resource: CursorResource,
  scope: string,
  values: T[],
  limit: number,
  cursor: string | undefined,
): { data: T[]; pagination: PageMetadata } {
  let start = 0;
  if (cursor) {
    const payload = decodeCursor(cursor);
    const validSnapshot = payload.resource === resource
      && payload.publicationId === program.publication.id
      && payload.publicRevision === program.publication.publicRevision
      && payload.scope === scope;
    const index = values.findIndex((value) => value.id === payload.id);
    if (!validSnapshot || index < 0) {
      throw new PublicApiError("invalid_cursor", "The cursor does not belong to this resource, filter set, or live publication revision.");
    }
    start = index + 1;
  }
  const data = values.slice(start, start + limit);
  const hasMore = start + data.length < values.length;
  const last = data.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({
      v: 1,
      resource,
      publicationId: program.publication.id,
      publicRevision: program.publication.publicRevision,
      scope,
      id: last.id,
    })
    : null;
  return { data, pagination: { limit, nextCursor, hasMore } };
}

function matchesCatalog(value: { id: string; name: string } | null, filter: string | undefined): boolean {
  if (!filter) return true;
  return value !== null && (value.id === filter || normalized(value.name) === normalized(filter));
}

function compareSessions(left: PublicSession, right: PublicSession): number {
  return compare(left.startsAt, right.startsAt) || compare(left.id, right.id);
}

function compareSpeakers(left: PublicSpeaker, right: PublicSpeaker): number {
  return compare(speakerSortKey(left.name), speakerSortKey(right.name)) || compare(left.id, right.id);
}

function speakerSortKey(name: string): string {
  const normalizedName = normalized(name);
  const surname = normalizedName.split(/\s+/).at(-1) ?? normalizedName;
  return `${surname}\u0000${normalizedName}`;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

function matchesText(value: string, normalizedFilter: string): boolean {
  return normalized(value).includes(normalizedFilter);
}

function queryScope<T extends object>(query: T, keys: Array<keyof T>): string {
  return keys.map((key) => `${String(key)}=${encodeURIComponent(String(query[key] ?? ""))}`).join("&");
}

function encodeCursor(payload: CursorPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - base64.length % 4) % 4);
    const binary = atob(`${base64}${padding}`);
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))) as Partial<CursorPayload>;
    if (value.v !== 1
      || !["sessions", "speakers", "agenda"].includes(value.resource ?? "")
      || typeof value.publicationId !== "string"
      || typeof value.publicRevision !== "number"
      || typeof value.scope !== "string"
      || typeof value.id !== "string") {
      throw new Error("invalid cursor payload");
    }
    return value as CursorPayload;
  } catch {
    throw new PublicApiError("invalid_cursor", "The cursor is malformed or unsupported.");
  }
}
