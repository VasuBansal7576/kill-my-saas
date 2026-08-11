import { describe, expect, it } from "vitest";
import { EventConfigurationInputSchema } from "./event-configuration";

describe("event configuration contract", () => {
  it("rejects reversed dates and duplicate catalogs in one validation pass", () => {
    const result = EventConfigurationInputSchema.safeParse({
      name: "DevFlow Conf",
      startsOn: "2027-05-14",
      endsOn: "2027-05-12",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
      primaryColor: "#2d63e2",
      tracks: ["AI", "ai"],
      formats: [{ name: "Talk", durationMinutes: 30 }],
      rooms: ["Main"],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["endsOn", "tracks"]));
  });
});

