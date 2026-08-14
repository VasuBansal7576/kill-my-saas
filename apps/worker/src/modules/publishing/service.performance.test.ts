import { describe, expect, it } from "vitest";
import type { Database } from "@programflow/database";
import { getPublishedWidgetProgram } from "./service";

describe("public widget program query budget", () => {
  it("loads a complete filtered widget feed in three queries and two sequential waves", async () => {
    const harness = publicProgramDatabaseHarness();

    const pending = getPublishedWidgetProgram(
      harness.database,
      "devflow-conf-2027",
      "public-sessions",
    );

    expect(harness.queryCount()).toBe(1);
    harness.releaseMetadata();
    await harness.contentQueriesStarted();
    expect(harness.queryCount()).toBe(3);
    harness.releaseContent();

    const result = await pending;
    expect(result.widget.slug).toBe("public-sessions");
    expect(result.program.sessions).toEqual([
      expect.objectContaining({
        title: "Taming CI",
        speakers: [expect.objectContaining({ name: "Priya Raman" })],
      }),
    ]);
    expect(harness.queryCount()).toBe(3);
  });
});

function publicProgramDatabaseHarness() {
  let queryCount = 0;
  let releaseMetadata!: () => void;
  let releaseContent!: () => void;
  let contentQueriesStarted!: () => void;
  const metadataGate = new Promise<void>((resolve) => { releaseMetadata = resolve; });
  const contentGate = new Promise<void>((resolve) => { releaseContent = resolve; });
  const contentStarted = new Promise<void>((resolve) => { contentQueriesStarted = resolve; });

  const database = {
    select(selection: Record<string, unknown> = {}) {
      queryCount += 1;
      const keys = new Set(Object.keys(selection));
      const isMetadata = keys.has("publicationId") && keys.has("widgetId");
      const isSessions = keys.has("startsAt") && keys.has("roomName");
      const isSpeakers = keys.has("eventSpeakerId") && keys.has("headshotStatus");
      if (queryCount === 3) contentQueriesStarted();

      const rows = isMetadata
        ? [metadataRow()]
        : isSessions
          ? [sessionRow()]
          : isSpeakers
            ? [speakerRow()]
            : [];
      const gate = isMetadata ? metadataGate : contentGate;
      const query: Record<string, unknown> = {};
      for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
        query[method] = () => query;
      }
      query.then = (resolve: (value: unknown[]) => unknown, reject: (reason?: unknown) => unknown) =>
        gate.then(() => rows).then(resolve, reject);
      return query;
    },
  };

  return {
    database: database as unknown as Database,
    queryCount: () => queryCount,
    releaseMetadata,
    releaseContent,
    contentQueriesStarted: () => contentStarted,
  };
}

function metadataRow() {
  return {
    eventId: "event-1",
    eventSlug: "devflow-conf-2027",
    eventName: "DevFlow Conf 2027",
    startsOn: "2027-05-12",
    endsOn: "2027-05-14",
    timezone: "America/Los_Angeles",
    location: "Moscone West",
    eventBranding: { primaryColor: "#2d63e2" },
    publicationId: "publication-1",
    publicRevision: 4,
    scheduleRevisionId: "revision-1",
    liveAt: new Date("2027-05-01T12:00:00.000Z"),
    widgetId: "widget-1",
    widgetSlug: "public-sessions",
    widgetName: "Public sessions",
    widgetType: "sessions",
    widgetBranding: {
      primaryColor: "#6c94f9",
      backgroundColor: "#111111",
      textColor: "#eeeeee",
      showEventBranding: true,
    },
    widgetFilters: { trackIds: [], formatIds: [], roomIds: [] },
    widgetFields: ["title", "date_time", "room", "speakers"],
    widgetOutputFormats: ["styled", "json"],
    widgetRevision: 2,
    widgetUpdatedAt: new Date("2027-05-02T12:00:00.000Z"),
  };
}

function sessionRow() {
  return {
    id: "session-1",
    title: "Taming CI",
    description: "A practical playbook",
    startsAt: new Date("2027-05-12T16:00:00.000Z"),
    endsAt: new Date("2027-05-12T17:00:00.000Z"),
    roomId: "room-1",
    roomName: "Main Stage",
    trackId: "track-1",
    trackName: "Platform",
    formatId: "format-1",
    formatName: "Talk",
  };
}

function speakerRow() {
  return {
    sessionId: "session-1",
    personId: "person-1",
    eventSpeakerId: "event-speaker-1",
    name: "Priya Raman",
    biography: "Build systems engineer",
    company: "Latticework Systems",
    jobTitle: "Principal Engineer",
    headshotFileId: null,
    headshotStatus: null,
  };
}
