import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConflictRepairPanel } from "./AgendaPage";
import type { AgendaWorkspace } from "./types";

describe("agenda conflict repair", () => {
  it("explains validated alternatives in operator language and exposes one-click move actions", () => {
    const markup = renderToStaticMarkup(
      <ConflictRepairPanel workspace={workspace} suggestions={workspace.repairSuggestions} busy={false} move={vi.fn()} />,
    );

    expect(markup).toContain("1 conflict to repair");
    expect(markup).toContain("Priya Raman is double-booked for overlapping sessions.");
    expect(markup).toContain("These alternatives are conflict-free in the current schedule version.");
    expect(markup).toContain("Move Pair Programmer");
    expect(markup).toContain("Main Stage");
    expect(markup).toContain("Move here");
    expect(markup).toContain("aria-label=\"Move Pair Programmer to Wednesday, May 12 at 10:30 AM in Main Stage\"");
  });

  it("keeps repair copy readable and the action comfortably keyboard-operable", () => {
    const css = readFileSync(new URL("./scheduling.css", import.meta.url), "utf8");
    expect(css).toContain(".agenda-repair-list article strong { font-size: 13px; }");
    expect(css).toContain(".agenda-repair-list article span { color: var(--agenda-muted); font-size: 12px;");
    expect(css).toMatch(/\.agenda-repair-list button \{[^}]*min-height: 40px;[^}]*font-size: 13px;/);
    expect(css).toContain(".agenda-repair-list button:focus-visible { outline: 3px solid #c8c0ff; outline-offset: 2px; }");
  });
});

const workspace: AgendaWorkspace = {
  event: { id: "event", slug: "devflow", name: "DevFlow", startsOn: "2027-05-12", endsOn: "2027-05-14", timezone: "America/Los_Angeles" },
  revision: { id: "revision", version: 3, status: "draft", inUse: false, createdAt: "2027-01-01T00:00:00Z", updatedAt: "2027-01-01T00:00:00Z" },
  revisions: [],
  days: ["2027-05-12", "2027-05-13", "2027-05-14"],
  rooms: [{ id: "main", name: "Main Stage", sortOrder: 0 }, { id: "room-two", name: "Room 2A", sortOrder: 1 }],
  tracks: [{ id: "platform", name: "Platform", sortOrder: 0 }],
  sessions: [
    { id: "session-a", title: "Taming CI", trackId: "platform", trackName: "Platform", formatName: "Talk", durationMinutes: 30, speakers: [{ personId: "priya", displayName: "Priya Raman" }], placement: { id: "p-a", revisionId: "revision", sessionId: "session-a", roomId: "main", startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-12T16:30:00.000Z" } },
    { id: "session-b", title: "Pair Programmer", trackId: "platform", trackName: "Platform", formatName: "Talk", durationMinutes: 30, speakers: [{ personId: "priya", displayName: "Priya Raman" }], placement: { id: "p-b", revisionId: "revision", sessionId: "session-b", roomId: "room-two", startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-12T16:30:00.000Z" } },
  ],
  conflicts: [{ id: "speaker:priya:session-a:session-b", type: "speaker_double_booking", sessionIds: ["session-a", "session-b"], startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-12T16:30:00.000Z", speaker: { personId: "priya", displayName: "Priya Raman" }, message: "Priya Raman is double-booked for overlapping sessions." }],
  repairSuggestions: [{ id: "repair", revisionId: "revision", sessionId: "session-b", roomId: "main", startsAt: "2027-05-12T17:30:00.000Z", endsAt: "2027-05-12T18:00:00.000Z", resolvesConflictIds: ["speaker:priya:session-a:session-b"] }],
  readiness: { ready: false, revisionId: "revision", unscheduledCount: 0, conflictCount: 1, reasons: ["1 scheduling conflict remains."] },
};
