import { describe, expect, it } from "vitest";
import { assertPublishableRevision, PublicationRuleError, type PublishableRevisionSnapshot } from "./rules";

describe("publication transaction recheck", () => {
  it("accepts only the exact conflict-free Scheduling handoff", () => {
    assertPublishableRevision(snapshot());
    expect(() => assertPublishableRevision(snapshot({ handoff: { ...snapshot().handoff, version: 6 } })))
      .toThrowError(expect.objectContaining<Partial<PublicationRuleError>>({ code: "handoff_mismatch" }));
  });

  it("blocks concurrent room and speaker conflicts before go-live", () => {
    const roomConflict = snapshot({
      sessionIds: ["session-1", "session-2"],
      approvedSessionIds: ["session-1", "session-2"],
      handoff: { ...snapshot().handoff, placementCount: 2 },
      placements: [
        placement("session-1", "room-1", "2027-05-12T16:00:00Z", "2027-05-12T17:00:00Z"),
        placement("session-2", "room-1", "2027-05-12T16:30:00Z", "2027-05-12T17:30:00Z"),
      ],
    });
    expect(() => assertPublishableRevision(roomConflict))
      .toThrowError(expect.objectContaining<Partial<PublicationRuleError>>({ code: "room_conflict" }));

    const speakerConflict = {
      ...roomConflict,
      placements: [roomConflict.placements[0]!, { ...roomConflict.placements[1]!, roomId: "room-2" }],
      sessionSpeakers: [
        { sessionId: "session-1", personId: "speaker-1" },
        { sessionId: "session-2", personId: "speaker-1" },
      ],
    };
    expect(() => assertPublishableRevision(speakerConflict))
      .toThrowError(expect.objectContaining<Partial<PublicationRuleError>>({ code: "speaker_conflict" }));
  });

  it("requires approved content but allows unapproved sessions to remain excluded", () => {
    expect(() => assertPublishableRevision(snapshot({ approvedSessionIds: [] })))
      .toThrowError(expect.objectContaining<Partial<PublicationRuleError>>({ code: "no_approved_content" }));
    assertPublishableRevision(snapshot({
      sessionIds: ["session-1", "session-2"],
      approvedSessionIds: ["session-1"],
      handoff: { ...snapshot().handoff, placementCount: 2 },
      placements: [
        placement("session-1", "room-1", "2027-05-12T16:00:00Z", "2027-05-12T17:00:00Z"),
        placement("session-2", "room-1", "2027-05-12T17:00:00Z", "2027-05-12T18:00:00Z"),
      ],
    }));
  });
});

function snapshot(overrides: Partial<PublishableRevisionSnapshot> = {}): PublishableRevisionSnapshot {
  return {
    eventId: "event-1",
    revisionId: "revision-1",
    revisionStatus: "ready",
    handoff: { eventId: "event-1", revisionId: "revision-1", version: 5, placementCount: 1 },
    version: 5,
    sessionIds: ["session-1"],
    approvedSessionIds: ["session-1"],
    placements: [placement("session-1", "room-1", "2027-05-12T16:00:00Z", "2027-05-12T17:00:00Z")],
    sessionSpeakers: [{ sessionId: "session-1", personId: "speaker-1" }],
    ...overrides,
  };
}

function placement(sessionId: string, roomId: string, startsAt: string, endsAt: string) {
  return { sessionId, roomId, startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
}
