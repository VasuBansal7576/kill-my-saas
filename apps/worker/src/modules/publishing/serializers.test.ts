import { describe, expect, it } from "vitest";
import type { PublishedProgram } from "./contracts";
import { serializeCalendar, serializeStyledHtml, serializeXml } from "./serializers";

describe("public program exports", () => {
  it("produces one importable RFC 5545 event with stable UID and UTC boundaries", () => {
    const calendar = serializeCalendar(program());
    expect(calendar).toContain("BEGIN:VCALENDAR\r\n");
    expect(calendar).toContain("UID:session-1@programflow\r\n");
    expect(calendar).toContain("DTSTART:20270512T160000Z\r\n");
    expect(calendar).toContain("DTEND:20270512T170000Z\r\n");
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes XML content while retaining the canonical public revision", () => {
    const value = program();
    value.sessions[0]!.title = "Agents & <humans>";
    const xml = serializeXml(value);
    expect(xml).toContain('publicRevision="4"');
    expect(xml).toContain("Agents &amp; &lt;humans&gt;");
    expect(xml.includes("Agents & <humans>")).toBe(false);
  });

  it("renders an interactive styled embed with configured fields only", () => {
    const value = program();
    const output = serializeStyledHtml(value, {
      widgetType: "sessions",
      branding: { primaryColor: "#6c94f9", backgroundColor: "#111111", textColor: "#eeeeee", showEventBranding: true },
      fields: ["title", "date_time", "room", "track"],
    });
    expect(output).toContain("Taming CI");
    expect(output).toContain("Main Stage");
    expect(output).toContain("data-search");
    expect(output).toContain("addEventListener('input'");
    expect(output.includes("A practical playbook")).toBe(false);
  });
});

function program(): PublishedProgram {
  return {
    publication: { id: "publication-1", publicRevision: 4, scheduleRevisionId: "revision-1", liveAt: "2027-05-01T12:00:00.000Z" },
    event: {
      id: "event-1",
      slug: "devflow-conf-2027",
      name: "DevFlow Conf 2027",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      timezone: "America/Los_Angeles",
      location: "Moscone West",
      branding: { primaryColor: "#2d63e2" },
    },
    days: ["2027-05-12", "2027-05-13", "2027-05-14"],
    tracks: [{ id: "track-1", name: "Platform" }],
    formats: [{ id: "format-1", name: "Talk" }],
    rooms: [{ id: "room-1", name: "Main Stage" }],
    speakers: [],
    sessions: [{
      id: "session-1",
      title: "Taming CI",
      description: "A practical playbook",
      startsAt: "2027-05-12T16:00:00.000Z",
      endsAt: "2027-05-12T17:00:00.000Z",
      day: "2027-05-12",
      room: { id: "room-1", name: "Main Stage" },
      track: { id: "track-1", name: "Platform" },
      format: { id: "format-1", name: "Talk" },
      speakers: [],
    }],
  };
}
