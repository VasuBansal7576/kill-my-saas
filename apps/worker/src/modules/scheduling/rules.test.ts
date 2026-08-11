import { describe, expect, it } from "vitest";
import { deriveScheduleConflicts, intervalsOverlap, planAutoPlacements, zonedDateTimeToIso } from "./rules";
import type { ScheduleEvent, SchedulePlacement, ScheduleRoom, ScheduleSession } from "./types";

const event: ScheduleEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "devflow",
  name: "DevFlow",
  startsOn: "2027-05-12",
  endsOn: "2027-05-14",
  timezone: "America/Los_Angeles",
};
const rooms: ScheduleRoom[] = [
  { id: "room-a", name: "Main Stage", sortOrder: 0 },
  { id: "room-b", name: "Room 2A", sortOrder: 1 },
];
const sessions: ScheduleSession[] = [
  session("session-a", "Taming CI", ["priya"]),
  session("session-b", "Pair Programmer", ["priya"]),
  session("session-c", "Stateful Edge", ["marcus"]),
];

describe("schedule interval and conflict rules", () => {
  it("uses half-open intervals so back-to-back sessions do not overlap", () => {
    expect(intervalsOverlap(interval("10:00", "10:30"), interval("10:30", "11:00"))).toBe(false);
    expect(intervalsOverlap(interval("10:00", "10:31"), interval("10:30", "11:00"))).toBe(true);
  });

  it("surfaces speaker and room overlap, then clears both when a session moves", () => {
    const conflicted = [
      placement("placement-a", "session-a", "room-a", "10:00", "10:45"),
      placement("placement-b", "session-b", "room-b", "10:15", "10:45"),
      placement("placement-c", "session-c", "room-a", "10:30", "11:00"),
    ];
    expect(deriveScheduleConflicts(sessions, conflicted, rooms).map((conflict) => conflict.type).sort())
      .toEqual(["room_overlap", "speaker_double_booking"]);

    const resolved = [conflicted[0]!, {
      ...conflicted[1]!,
      startsAt: "2027-05-12T19:00:00.000Z",
      endsAt: "2027-05-12T19:30:00.000Z",
    }, {
      ...conflicted[2]!,
      startsAt: "2027-05-12T18:00:00.000Z",
      endsAt: "2027-05-12T18:30:00.000Z",
    }];
    expect(deriveScheduleConflicts(sessions, resolved, rooms)).toEqual([]);
  });
});

describe("one-action auto placement", () => {
  it("deterministically places every session without room or speaker overlap", () => {
    const first = planAutoPlacements({ event, rooms, sessions, placements: [] });
    const second = planAutoPlacements({ event, rooms, sessions, placements: [] });
    expect(second).toEqual(first);
    expect(first.unplaced).toEqual([]);
    expect(first.placements).toHaveLength(3);
    const materialized = first.placements.map((placement, index) => ({ id: `p-${index}`, revisionId: "revision", ...placement }));
    expect(deriveScheduleConflicts(sessions, materialized, rooms)).toEqual([]);
  });

  it("uses the event timezone when it creates the earliest slot", () => {
    expect(zonedDateTimeToIso("2027-05-12", 9 * 60, "America/Los_Angeles")).toBe("2027-05-12T16:00:00.000Z");
  });
});

function session(id: string, title: string, speakerIds: string[]): ScheduleSession {
  return {
    id,
    title,
    trackId: "track",
    trackName: "Platform",
    formatName: "Talk",
    durationMinutes: 30,
    speakers: speakerIds.map((personId) => ({ personId, displayName: personId === "priya" ? "Priya Raman" : "Marcus Okafor" })),
  };
}

function interval(startsAt: string, endsAt: string) {
  return { startsAt: `2027-05-12T${startsAt}:00.000Z`, endsAt: `2027-05-12T${endsAt}:00.000Z` };
}

function placement(id: string, sessionId: string, roomId: string, startsAt: string, endsAt: string): SchedulePlacement {
  return { id, revisionId: "revision", sessionId, roomId, ...interval(startsAt, endsAt) };
}
