import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../identity-access/actor";
import { SchedulingError, SchedulingService } from "./service";
import type { ScheduleSnapshot, SchedulingRepositoryPort } from "./types";

const eventId = "00000000-0000-4000-8000-000000000001";
const revisionId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const roomId = "00000000-0000-4000-8000-000000000004";
const organizer: Actor = {
  identityId: "organizer",
  personId: "00000000-0000-4000-8000-000000000005",
  organizationRoles: [],
  eventRoles: [{ eventId, role: "organizer" }],
};

describe("SchedulingService", () => {
  it("persists the frozen PlaceSession command and returns reloadable readiness", async () => {
    const after = snapshot({
      placements: [{ id: "placement", revisionId, sessionId, roomId, startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-12T16:30:00.000Z" }],
    });
    const placeSession = vi.fn().mockResolvedValue(undefined);
    const repository = repo({ placeSession, loadSnapshot: vi.fn().mockResolvedValue(after) });
    const service = new SchedulingService(repository);
    const result = await service.placeSession(organizer, "devflow", {
      eventId,
      revisionId,
      sessionId,
      roomId,
      startsAt: "2027-05-12T16:00:00.000Z",
      endsAt: "2027-05-12T16:30:00.000Z",
    });
    expect(placeSession).toHaveBeenCalledWith(expect.objectContaining({ eventId, revisionId, sessionId, roomId }));
    expect(result.readiness).toMatchObject({ ready: true, unscheduledCount: 0, conflictCount: 0 });
    expect(repository.setRevisionStatus).toHaveBeenCalledWith(eventId, revisionId, "ready");
  });

  it("shows a shared-speaker conflict and clears it after the persisted move", async () => {
    const conflicted = snapshot({
      sessions: [
        snapshot().sessions[0]!,
        { ...snapshot().sessions[0]!, id: "session-two", title: "Second", speakers: [{ personId: "speaker", displayName: "Priya Raman" }] },
      ],
      placements: [
        { id: "p1", revisionId, sessionId, roomId, startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-12T16:30:00.000Z" },
        { id: "p2", revisionId, sessionId: "session-two", roomId: "room-two", startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-12T16:30:00.000Z" },
      ],
      rooms: [...snapshot().rooms, { id: "room-two", name: "Room 2", sortOrder: 1 }],
    });
    const resolved = { ...conflicted, placements: [conflicted.placements[0]!, { ...conflicted.placements[1]!, startsAt: "2027-05-12T17:00:00.000Z", endsAt: "2027-05-12T17:30:00.000Z" }] };
    const repository = repo({ loadSnapshot: vi.fn().mockResolvedValueOnce(conflicted).mockResolvedValue(resolved) });
    const service = new SchedulingService(repository);
    expect((await service.getWorkspace(organizer, "devflow")).conflicts).toMatchObject([{ type: "speaker_double_booking" }]);
    expect((await service.getWorkspace(organizer, "devflow")).conflicts).toEqual([]);
  });

  it("denies non-organizers before any scheduling state is read", async () => {
    const repository = repo();
    const reviewer: Actor = { ...organizer, eventRoles: [{ eventId, role: "reviewer" }] };
    await expect(new SchedulingService(repository).getWorkspace(reviewer, "devflow"))
      .rejects.toMatchObject({ code: "forbidden" } satisfies Partial<SchedulingError>);
    expect(repository.loadSnapshot).not.toHaveBeenCalled();
  });

  it("exposes only a currently conflict-free complete revision to Publishing", async () => {
    const service = new SchedulingService(repo({
      loadSnapshot: vi.fn().mockResolvedValue(snapshot({
        placements: [{ id: "placement", revisionId, sessionId, roomId, startsAt: "2027-05-12T16:00:00.000Z", endsAt: "2027-05-12T16:30:00.000Z" }],
      })),
    }));
    await expect(service.getConflictFreeRevision(organizer, "devflow", revisionId)).resolves.toMatchObject({
      eventId,
      revisionId,
      placementCount: 1,
    });
  });
});

function snapshot(overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    event: { id: eventId, slug: "devflow", name: "DevFlow", startsOn: "2027-05-12", endsOn: "2027-05-14", timezone: "America/Los_Angeles" },
    revision: { id: revisionId, eventId, version: 1, status: "draft", inUse: false, createdAt: new Date("2027-01-01T00:00:00Z"), updatedAt: new Date("2027-01-01T00:00:00Z") },
    revisions: [{ id: revisionId, eventId, version: 1, status: "draft", inUse: false, createdAt: new Date("2027-01-01T00:00:00Z"), updatedAt: new Date("2027-01-01T00:00:00Z") }],
    rooms: [{ id: roomId, name: "Main", sortOrder: 0 }],
    tracks: [{ id: "track", name: "Platform", sortOrder: 0 }],
    sessions: [{ id: sessionId, title: "Taming CI", trackId: "track", trackName: "Platform", formatName: "Talk", durationMinutes: 30, speakers: [{ personId: "speaker", displayName: "Priya Raman" }] }],
    placements: [],
    ...overrides,
  };
}

function repo(overrides: Partial<SchedulingRepositoryPort> = {}): SchedulingRepositoryPort {
  return {
    findEventBySlug: vi.fn().mockResolvedValue(snapshot().event),
    loadSnapshot: vi.fn().mockResolvedValue(snapshot()),
    createDraftRevision: vi.fn().mockResolvedValue(snapshot().revision),
    placeSession: vi.fn(),
    unplaceSession: vi.fn(),
    applyAutoPlacements: vi.fn(),
    setRevisionStatus: vi.fn(),
    ...overrides,
  } as SchedulingRepositoryPort;
}
