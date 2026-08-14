import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import type { PublishedProgram, PublicSession, PublicSpeaker } from "../publishing/contracts";
import { PublishingError } from "../publishing/service";
import { createPublicApiRoutes } from "./routes";

const ids = {
  event: "00000000-0000-4000-8000-000000000001",
  publication: "00000000-0000-4000-8000-000000000002",
  revision: "00000000-0000-4000-8000-000000000003",
  track: "00000000-0000-4000-8000-000000000004",
  format: "00000000-0000-4000-8000-000000000005",
  room: "00000000-0000-4000-8000-000000000006",
  speakerA: "00000000-0000-4000-8000-000000000007",
  speakerB: "00000000-0000-4000-8000-000000000008",
  eventSpeakerA: "00000000-0000-4000-8000-000000000009",
  eventSpeakerB: "00000000-0000-4000-8000-000000000010",
  sessionA: "00000000-0000-4000-8000-000000000011",
  sessionB: "00000000-0000-4000-8000-000000000012",
  sessionC: "00000000-0000-4000-8000-000000000013",
} as const;

describe("public developer API contract", () => {
  it("publishes an inspectable OpenAPI 3.1 document for only the implemented reads and liveness endpoint", async () => {
    const response = await testApp(program).request("/api/v1/openapi.json", {}, environment);
    const document = await response.json() as { openapi: string; security: unknown[]; paths: Record<string, Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(document.openapi).toBe("3.1.0");
    expect(document.security).toEqual([]);
    expect(Object.keys(document.paths)).toEqual([
      "/api/v1/health/live",
      "/api/v1/openapi.json",
      "/api/v1/public/events/{eventSlug}",
      "/api/v1/public/events/{eventSlug}/sessions",
      "/api/v1/public/events/{eventSlug}/sessions/{sessionId}",
      "/api/v1/public/events/{eventSlug}/speakers",
      "/api/v1/public/events/{eventSlug}/speakers/{speakerId}",
      "/api/v1/public/events/{eventSlug}/agenda",
    ]);
    expect(Object.values(document.paths).every((path) => Object.keys(path).every((method) => method === "get"))).toBe(true);
  });

  it("returns body-derived ETags and a 304 for an unchanged representation", async () => {
    const app = testApp(program);
    const first = await app.request("/api/v1/public/events/devflow-conf-2027/sessions?track=Applied%20AI", {}, environment);
    const etag = first.headers.get("etag");
    const unchanged = await app.request("/api/v1/public/events/devflow-conf-2027/sessions?track=Applied%20AI", {
      headers: { "if-none-match": `W/${etag}` },
    }, environment);
    const different = await app.request("/api/v1/public/events/devflow-conf-2027/sessions?track=Platform", {}, environment);

    expect(first.status).toBe(200);
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(first.headers.get("cache-control")).toBe("public, max-age=30, stale-while-revalidate=60");
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get("etag")).toBe(etag);
    expect(different.headers.get("etag")).not.toBe(etag);
  });

  it("paginates in stable start-time order and binds cursors to filters and the publication revision", async () => {
    const app = testApp(program);
    const firstResponse = await app.request("/api/v1/public/events/devflow-conf-2027/sessions?limit=1&track=Applied%20AI", {}, environment);
    const first = await firstResponse.json() as Page<PublicSession>;
    const secondResponse = await app.request(`/api/v1/public/events/devflow-conf-2027/sessions?limit=1&track=Applied%20AI&cursor=${encodeURIComponent(first.pagination.nextCursor ?? "")}`, {}, environment);
    const second = await secondResponse.json() as Page<PublicSession>;
    const wrongScope = await app.request(`/api/v1/public/events/devflow-conf-2027/sessions?limit=1&track=Platform&cursor=${encodeURIComponent(first.pagination.nextCursor ?? "")}`, {}, environment);

    expect(first.data.map((session) => session.id)).toEqual([ids.sessionB]);
    expect(first.pagination).toMatchObject({ limit: 1, hasMore: true });
    expect(first.pagination.nextCursor).toEqual(expect.any(String));
    expect(second.data.map((session) => session.id)).toEqual([ids.sessionA]);
    expect(second.pagination).toEqual({ limit: 1, hasMore: false, nextCursor: null });
    expect(wrongScope.status).toBe(400);
    await expect(wrongScope.json()).resolves.toMatchObject({ error: { code: "invalid_cursor" } });
  });

  it("distinguishes absent events, paused publications, and absent children with JSON errors", async () => {
    const notFound = errorApp(new PublishingError("event_not_found", "Event not found."));
    const paused = errorApp(new PublishingError("publication_not_live", "This event's public program is not live."));
    const [missingEvent, pausedEvent, missingSession] = await Promise.all([
      notFound.request("/api/v1/public/events/missing", {}, environment),
      paused.request("/api/v1/public/events/devflow-conf-2027", {}, environment),
      testApp(program).request("/api/v1/public/events/devflow-conf-2027/sessions/missing", {}, environment),
    ]);

    expect(missingEvent.status).toBe(404);
    expect(pausedEvent.status).toBe(409);
    expect(missingSession.status).toBe(404);
    expect(pausedEvent.headers.get("cache-control")).toBe("no-store");
    await expect(pausedEvent.json()).resolves.toEqual({ error: { code: "publication_not_live", message: "This event's public program is not live." } });
  });
});

interface Page<T> {
  data: T[];
  pagination: { limit: number; nextCursor: string | null; hasMore: boolean };
}

const environment = {} as Env;

function testApp(publishedProgram: PublishedProgram) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/v1", createPublicApiRoutes({ loadPublishedProgram: async () => publishedProgram }));
  return app;
}

function errorApp(error: PublishingError) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/v1", createPublicApiRoutes({ loadPublishedProgram: async () => { throw error; } }));
  return app;
}

const speakerA: PublicSpeaker = {
  id: ids.speakerA,
  eventSpeakerId: ids.eventSpeakerA,
  name: "Priya Raman",
  biography: "Builds reliable AI systems.",
  company: "Signal Labs",
  jobTitle: "Principal Engineer",
  headshotUrl: null,
  sessions: [],
};

const speakerB: PublicSpeaker = {
  id: ids.speakerB,
  eventSpeakerId: ids.eventSpeakerB,
  name: "Ada Zhou",
  biography: "Teaches evaluation design.",
  company: "Proof Works",
  jobTitle: "Founder",
  headshotUrl: null,
  sessions: [],
};

function session(id: string, title: string, startsAt: string, trackName: string, speakers: PublicSpeaker[]): PublicSession {
  return {
    id,
    title,
    description: `${title} description`,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 45 * 60_000).toISOString(),
    day: "2027-05-12",
    room: { id: ids.room, name: "Room 2A" },
    track: { id: ids.track, name: trackName },
    format: { id: ids.format, name: "Talk" },
    speakers,
  };
}

const sessions = [
  session(ids.sessionA, "Reliable Agents", "2027-05-12T10:00:00.000Z", "Applied AI", [speakerA]),
  session(ids.sessionB, "Evaluation Without Vibes", "2027-05-12T09:00:00.000Z", "Applied AI", [speakerB]),
  session(ids.sessionC, "Stateful Edge", "2027-05-12T11:00:00.000Z", "Platform", [speakerA]),
];

speakerA.sessions = sessions.filter((candidate) => candidate.speakers.includes(speakerA)).map(({ id, title, startsAt, endsAt, room }) => ({ id, title, startsAt, endsAt, room: room.name }));
speakerB.sessions = sessions.filter((candidate) => candidate.speakers.includes(speakerB)).map(({ id, title, startsAt, endsAt, room }) => ({ id, title, startsAt, endsAt, room: room.name }));

const program: PublishedProgram = {
  publication: { id: ids.publication, publicRevision: 7, scheduleRevisionId: ids.revision, liveAt: "2027-05-01T12:00:00.000Z" },
  event: {
    id: ids.event,
    slug: "devflow-conf-2027",
    name: "DevFlow Conf 2027",
    startsOn: "2027-05-12",
    endsOn: "2027-05-14",
    timezone: "America/Los_Angeles",
    location: "Moscone West, San Francisco",
    branding: { primaryColor: "#6c94f9" },
  },
  days: ["2027-05-12", "2027-05-13", "2027-05-14"],
  tracks: [{ id: ids.track, name: "Applied AI" }],
  formats: [{ id: ids.format, name: "Talk" }],
  rooms: [{ id: ids.room, name: "Room 2A" }],
  sessions,
  speakers: [speakerA, speakerB],
};
