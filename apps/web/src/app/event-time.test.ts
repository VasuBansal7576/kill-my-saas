import { describe, expect, it } from "vitest";
import { eventDateTimeInputValue, eventLocalDateTimeToIso, formatEventDateTime, formatEventTimeRange } from "./event-time";

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

  it("round-trips event-local form values without using the browser timezone", () => {
    const iso = eventLocalDateTimeToIso("2027-05-12T10:00", "America/Los_Angeles");
    expect(iso).toBe("2027-05-12T17:00:00.000Z");
    expect(eventDateTimeInputValue(iso, "America/Los_Angeles")).toBe("2027-05-12T10:00");
  });
});
