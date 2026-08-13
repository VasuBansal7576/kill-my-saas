import { describe, expect, it } from "vitest";
import { biographyForDisplay, filterSessions, filterSpeakers, optimisticItinerarySelection, sessionsByStart } from "./model";
import type { PublishedProgram } from "./types";

describe("public program read models", () => {
  it("matches session title or speaker name and composes track, format, and location facets", () => {
    const value = program();
    expect(filterSessions(value, { search: "priya", trackId: "", formatId: "", roomId: "" }).map((session) => session.id)).toEqual(["session-2"]);
    expect(filterSessions(value, { search: "", trackId: "track-1", formatId: "format-1", roomId: "room-1" }).map((session) => session.id)).toEqual(["session-1"]);
  });

  it("keeps speakers surname-ordered from the canonical response and itinerary chronological", () => {
    const value = program();
    expect(filterSpeakers(value, "").map((speaker) => speaker.name)).toEqual(["Ada Lovelace", "Priya Raman"]);
    expect(sessionsByStart(value.sessions).map((session) => session.id)).toEqual(["session-2", "session-1"]);
  });

  it("updates itinerary counts optimistically without mutating the last saved selection", () => {
    const current = new Set(["session-1"]);
    const added = optimisticItinerarySelection(current, "session-2");
    expect(added.method).toBe("PUT");
    expect([...added.next]).toEqual(["session-1", "session-2"]);
    expect([...current]).toEqual(["session-1"]);
    expect(optimisticItinerarySelection(added.next, "session-1")).toMatchObject({ method: "DELETE" });
  });

  it("removes accidental repeated biography presentation without rewriting distinct paragraphs", () => {
    expect(biographyForDisplay("Builds reliable systems.Builds reliable systems.")).toBe("Builds reliable systems.");
    expect(biographyForDisplay("First paragraph.\n\nFirst paragraph.\n\nSecond paragraph.")).toBe("First paragraph.\n\nSecond paragraph.");
  });
});

function program(): PublishedProgram {
  const ada = { id: "person-1", eventSpeakerId: "speaker-1", name: "Ada Lovelace", biography: "", company: "Analytical", jobTitle: "Engineer", headshotUrl: null, sessions: [] };
  const priya = { id: "person-2", eventSpeakerId: "speaker-2", name: "Priya Raman", biography: "", company: "Northstar", jobTitle: "Staff Engineer", headshotUrl: null, sessions: [] };
  return {
    publication: { id: "publication-1", publicRevision: 2, scheduleRevisionId: "revision-1", liveAt: "2027-05-01T00:00:00Z" },
    event: { id: "event-1", slug: "devflow", name: "DevFlow", startsOn: "2027-05-12", endsOn: "2027-05-12", timezone: "UTC", location: "Moscone", branding: { primaryColor: "#6c94f9" } },
    days: ["2027-05-12"],
    tracks: [{ id: "track-1", name: "Platform" }, { id: "track-2", name: "AI" }],
    formats: [{ id: "format-1", name: "Talk" }],
    rooms: [{ id: "room-1", name: "Main" }, { id: "room-2", name: "Studio" }],
    speakers: [ada, priya],
    sessions: [
      { id: "session-1", title: "Compilers", description: "", startsAt: "2027-05-12T11:00:00Z", endsAt: "2027-05-12T12:00:00Z", day: "2027-05-12", room: { id: "room-1", name: "Main" }, track: { id: "track-1", name: "Platform" }, format: { id: "format-1", name: "Talk" }, speakers: [ada] },
      { id: "session-2", title: "Agent evals", description: "", startsAt: "2027-05-12T09:00:00Z", endsAt: "2027-05-12T10:00:00Z", day: "2027-05-12", room: { id: "room-2", name: "Studio" }, track: { id: "track-2", name: "AI" }, format: { id: "format-1", name: "Talk" }, speakers: [priya] },
    ],
  };
}
