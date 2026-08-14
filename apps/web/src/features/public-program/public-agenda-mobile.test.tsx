import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Agenda } from "./PublicProgramPage";
import type { PublishedProgram } from "./types";

describe("public agenda mobile presentation", () => {
  it("renders every session as a room-labeled item in the selected day list", () => {
    const markup = renderToStaticMarkup(<Agenda program={program} day="2027-05-12" setDay={vi.fn()} open={vi.fn()} />);

    expect(markup).toContain('class="public-agenda-mobile"');
    expect(markup).toContain("Main Stage");
    expect(markup).toContain("Studio");
    expect(markup).toContain("Compilers at the edge");
    expect(markup).toContain("Practical agent evals");
    expect(markup).toContain('aria-label="Compilers at the edge, Main Stage');
    expect(markup).toContain('aria-label="Practical agent evals, Studio');
  });

  it("switches from the desktop grid to a sticky-oriented list at phone widths", () => {
    const css = readFileSync(new URL("./public-program.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media \(max-width: 650px\)[\s\S]*\.public-agenda \{ display: none; \}/);
    expect(css).toMatch(/\.agenda-mobile-time > header \{[^}]*position: sticky;/);
    expect(css).toMatch(/\.public-agenda-mobile \{ display: grid;/);
  });
});

const speaker = { id: "person-1", eventSpeakerId: "speaker-1", name: "Priya Raman", biography: "", company: "Northstar", jobTitle: "Staff Engineer", headshotUrl: null, sessions: [] };
const program: PublishedProgram = {
  publication: { id: "publication-1", publicRevision: 2, scheduleRevisionId: "revision-1", liveAt: "2027-05-01T00:00:00Z" },
  event: { id: "event-1", slug: "devflow", name: "DevFlow", startsOn: "2027-05-12", endsOn: "2027-05-14", timezone: "America/Los_Angeles", location: "Moscone", branding: { primaryColor: "#6c94f9" } },
  days: ["2027-05-12", "2027-05-13", "2027-05-14"],
  tracks: [{ id: "track-1", name: "Platform" }],
  formats: [{ id: "format-1", name: "Talk" }],
  rooms: [{ id: "room-1", name: "Main Stage" }, { id: "room-2", name: "Studio" }],
  speakers: [speaker],
  sessions: [
    { id: "session-1", title: "Compilers at the edge", description: "", startsAt: "2027-05-12T17:00:00Z", endsAt: "2027-05-12T17:30:00Z", day: "2027-05-12", room: { id: "room-1", name: "Main Stage" }, track: { id: "track-1", name: "Platform" }, format: { id: "format-1", name: "Talk" }, speakers: [speaker] },
    { id: "session-2", title: "Practical agent evals", description: "", startsAt: "2027-05-12T17:00:00Z", endsAt: "2027-05-12T17:45:00Z", day: "2027-05-12", room: { id: "room-2", name: "Studio" }, track: { id: "track-1", name: "Platform" }, format: { id: "format-1", name: "Talk" }, speakers: [speaker] },
  ],
};
