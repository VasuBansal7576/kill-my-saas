import { describe, expect, it } from "vitest";
import type { Actor } from "../identity-access/actor";
import { canAccessPrivateSpeakerFile } from "./authorization";

const actor = (personId: string, role: "organizer" | "speaker" | "reviewer", eventId = "event-a"): Actor => ({
  identityId: `identity-${personId}`,
  personId,
  organizationRoles: [],
  eventRoles: [{ eventId, role }],
});

describe("private deliverable authorization", () => {
  it("allows the event organizer and owning speaker while denying another speaker and reviewer", () => {
    expect(canAccessPrivateSpeakerFile(actor("organizer", "organizer"), "event-a", "speaker-a")).toBe(true);
    expect(canAccessPrivateSpeakerFile(actor("speaker-a", "speaker"), "event-a", "speaker-a")).toBe(true);
    expect(canAccessPrivateSpeakerFile(actor("speaker-b", "speaker"), "event-a", "speaker-a")).toBe(false);
    expect(canAccessPrivateSpeakerFile(actor("reviewer", "reviewer"), "event-a", "speaker-a")).toBe(false);
    expect(canAccessPrivateSpeakerFile(actor("organizer", "organizer", "event-b"), "event-a", "speaker-a")).toBe(false);
  });
});
