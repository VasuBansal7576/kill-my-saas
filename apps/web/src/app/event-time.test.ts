import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eventDateTimeInputValue, eventLocalDateTimeToIso, formatEventDateRange, formatEventDateTime, formatEventDueDate, formatEventTimeRange } from "./event-time";

describe("event time formatting", () => {
  it("uses the event timezone and names it explicitly", () => {
    const formatted = formatEventDateTime("2027-05-12T17:00:00.000Z", "America/Los_Angeles");
    expect(formatted).toContain("May");
    expect(formatted).toContain("10:00");
    expect(formatted).toMatch(/PDT|GMT-7/);
  });

  it("formats a range with one explicit event timezone", () => {
    const formatted = formatEventTimeRange("2027-05-12T17:00:00.000Z", "2027-05-12T17:30:00.000Z", "America/Los_Angeles", true);
    expect(formatted).toContain("10:00");
    expect(formatted).toContain("10:30");
    expect(formatted).toMatch(/PDT|GMT-7/);
  });

  it("keeps due dates on the event day and names the event timezone", () => {
    const formatted = formatEventDueDate("2027-05-13T01:30:00.000Z", "America/Los_Angeles");
    expect(formatted).toContain("May 12, 2027");
    expect(formatted).toMatch(/(PDT|GMT-7)/);
    expect(formatEventDueDate(null, "America/Los_Angeles")).toBe("No due date");
  });

  it("compacts public event date ranges without repeating month and year", () => {
    expect(formatEventDateRange("2027-05-12", "2027-05-14")).toBe("May 12–14, 2027");
    expect(formatEventDateRange("2027-05-12", "2027-05-12")).toBe("May 12, 2027");
  });

  it("round-trips event-local form values without using the browser timezone", () => {
    const iso = eventLocalDateTimeToIso("2027-05-12T10:00", "America/Los_Angeles");
    expect(iso).toBe("2027-05-12T17:00:00.000Z");
    expect(eventDateTimeInputValue(iso, "America/Los_Angeles")).toBe("2027-05-12T10:00");
  });

  it("routes organizer and speaker due-date surfaces through the event formatter", () => {
    const files = [
      "../features/speaker-operations/SpeakerTasksPage.tsx",
      "../features/speaker-operations/SpeakerPortalPage.tsx",
      "../features/files-deliverables/OrganizerFilesPage.tsx",
      "../features/files-deliverables/SpeakerFilesPage.tsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    files.forEach((source) => expect(source).toContain("formatEventDueDate"));
    expect(files[2]).toContain("eventLocalDateTimeToIso");
    expect(files[3]).toContain("row.eventTimezone");
  });
});
