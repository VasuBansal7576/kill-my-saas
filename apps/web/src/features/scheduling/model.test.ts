import { describe, expect, it } from "vitest";
import { groupsForView, zonedDateTimeToIso } from "./model";
import type { AgendaWorkspace } from "./types";

describe("organizer agenda views", () => {
  it("projects the same canonical placements through list, week, track, and room", () => {
    const workspace = fixture();
    for (const view of ["list", "week", "track", "room"] as const) {
      const ids = groupsForView(workspace, view).flatMap((group) => group.sessions.map((session) => session.id));
      expect(ids.sort()).toEqual(["session-a", "session-b"]);
    }
  });

  it("converts click and keyboard placement time in the event timezone", () => {
    expect(zonedDateTimeToIso("2027-05-12", "09:00", "America/Los_Angeles")).toBe("2027-05-12T16:00:00.000Z");
  });
});

function fixture(): AgendaWorkspace {
  const base = {
    event: { id: "event", slug: "devflow", name: "DevFlow", startsOn: "2027-05-12", endsOn: "2027-05-13", timezone: "America/Los_Angeles" },
    revision: { id: "revision", version: 1, status: "ready" as const, inUse: false, createdAt: "2027-01-01T00:00:00Z", updatedAt: "2027-01-01T00:00:00Z" },
    revisions: [],
    days: ["2027-05-12", "2027-05-13"],
    rooms: [{ id: "main", name: "Main", sortOrder: 0 }, { id: "lab", name: "Lab", sortOrder: 1 }],
    tracks: [{ id: "platform", name: "Platform", sortOrder: 0 }, { id: "ai", name: "AI", sortOrder: 1 }],
    conflicts: [],
    repairSuggestions: [],
    readiness: { ready: true, revisionId: "revision", unscheduledCount: 0, conflictCount: 0, reasons: [] },
  };
  return {
    ...base,
    sessions: [
      { id: "session-a", title: "A", trackId: "platform", trackName: "Platform", formatName: "Talk", durationMinutes: 30, speakers: [], placement: { id: "p-a", revisionId: "revision", sessionId: "session-a", roomId: "main", startsAt: "2027-05-12T16:00:00Z", endsAt: "2027-05-12T16:30:00Z" } },
      { id: "session-b", title: "B", trackId: "ai", trackName: "AI", formatName: "Talk", durationMinutes: 30, speakers: [], placement: { id: "p-b", revisionId: "revision", sessionId: "session-b", roomId: "lab", startsAt: "2027-05-13T17:00:00Z", endsAt: "2027-05-13T17:30:00Z" } },
    ],
  };
}
