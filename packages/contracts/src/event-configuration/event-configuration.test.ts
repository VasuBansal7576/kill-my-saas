import { describe, expect, it } from "vitest";
import { EventConfigurationInputSchema, WorkspaceSetupInputSchema } from "./event-configuration";

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

  it("validates the first organization and event as one setup contract", () => {
    const valid = WorkspaceSetupInputSchema.safeParse({
      organization: { name: "Latent Space", slug: "latent-space" },
      event: {
        name: "AI Engineer Summit",
        slug: "ai-engineer-summit-2027",
        startsOn: "2027-06-01",
        endsOn: "2027-06-03",
        timezone: "America/Los_Angeles",
        location: "San Francisco",
        primaryColor: "#7c5cff",
      },
    });
    expect(valid.success).toBe(true);

    const invalid = WorkspaceSetupInputSchema.safeParse({
      organization: { name: "Latent Space", slug: "Latent Space" },
      event: {
        name: "AI Engineer Summit",
        slug: "ai-engineer-summit-2027",
        startsOn: "2027-06-03",
        endsOn: "2027-06-01",
        timezone: "not-a-timezone",
        location: "San Francisco",
        primaryColor: "#7c5cff",
      },
    });
    expect(invalid.success).toBe(false);
  });
});
