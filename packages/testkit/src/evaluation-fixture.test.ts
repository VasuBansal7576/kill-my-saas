import { describe, expect, it } from "vitest";
import { applyPersonaEmailOverrides } from "./evaluation-fixture";

const fixture = {
  schema_version: 1,
  event: {
    name: "DevFlow Conf 2027",
    starts_on: "2027-05-12",
    ends_on: "2027-05-14",
    location: "San Francisco",
    timezone: "America/Los_Angeles",
    tracks: [],
    formats: [],
    rooms: [],
  },
  personas: [
    { persona: "organizer", canonical_person_key: "jordan", name: "Jordan", canonical_email: "jordan@example.com", aliases: [], memberships: [{ scope: "event", role: "organizer" }], login_required: true },
    { persona: "speaker", canonical_person_key: "priya", name: "Priya", canonical_email: "priya@example.com", aliases: [], memberships: [{ scope: "event", role: "speaker" }], login_required: true },
  ],
};

describe("evaluator identity overrides", () => {
  it("preserves the previous address as an alias and rejects cross-person collisions", () => {
    const overridden = applyPersonaEmailOverrides(fixture, { organizer: "live@example.com" });
    expect(overridden.personas[0]?.canonical_email).toBe("live@example.com");
    expect(overridden.personas[0]?.aliases).toContain("jordan@example.com");
    expect(() => applyPersonaEmailOverrides(fixture, { organizer: "priya@example.com" })).toThrow(/resolves to both/);
  });
});

