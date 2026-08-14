import { describe, expect, it } from "vitest";
import { buildSpeakerCalendar } from "./icalendar";

describe("speaker iCalendar artifacts", () => {
  it("produces an independently parseable, versioned RFC 5545 event", () => {
    const artifact = buildSpeakerCalendar({
      uid: "placement-1.person-1@programflow",
      sequence: 3,
      method: "REQUEST",
      startsAt: new Date("2027-05-12T17:00:00.000Z"),
      endsAt: new Date("2027-05-12T17:30:00.000Z"),
      generatedAt: new Date("2027-05-01T10:00:00.000Z"),
      summary: "Taming 40-Minute CI",
      description: "Speaker calendar invitation for DevFlow Conf 2027",
      location: "Moscone West — Main Stage",
      organizer: { name: "Jordan Alvarez", email: "organizer@example.com" },
      attendee: { name: "Priya Raman", email: "priya@example.com" },
    });

    const parsed = parseCalendar(artifact);
    expect(parsed.method).toBe("REQUEST");
    expect(parsed.event.UID).toBe("placement-1.person-1@programflow");
    expect(parsed.event.SEQUENCE).toBe("3");
    expect(parsed.event.DTSTART).toBe("20270512T170000Z");
    expect(parsed.event.DTEND).toBe("20270512T173000Z");
    expect(parsed.event.STATUS).toBe("CONFIRMED");
    expect(artifact.endsWith("\r\n")).toBe(true);
    for (const line of artifact.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

function parseCalendar(source: string) {
  const unfolded = source.replace(/\r\n[ \t]/g, "");
  const lines = unfolded.split("\r\n").filter(Boolean);
  if (lines[0] !== "BEGIN:VCALENDAR" || lines.at(-1) !== "END:VCALENDAR") throw new Error("Not a complete VCALENDAR");
  if (!lines.includes("VERSION:2.0") || !lines.includes("BEGIN:VEVENT") || !lines.includes("END:VEVENT")) {
    throw new Error("Required calendar components are missing");
  }
  const method = lines.find((line) => line.startsWith("METHOD:"))?.slice(7);
  const event: Record<string, string> = {};
  let insideEvent = false;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") insideEvent = true;
    else if (line === "END:VEVENT") insideEvent = false;
    else if (insideEvent) {
      const separator = line.indexOf(":");
      const property = line.slice(0, separator).split(";")[0];
      if (separator > 0 && property) event[property] = line.slice(separator + 1);
    }
  }
  for (const required of ["UID", "DTSTAMP", "DTSTART", "DTEND", "SEQUENCE", "STATUS", "SUMMARY"]) {
    if (!event[required]) throw new Error(`Missing ${required}`);
  }
  return { method, event };
}
