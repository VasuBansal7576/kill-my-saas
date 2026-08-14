import { describe, expect, it, vi } from "vitest";
import { itineraryMutationKey, itineraryMutationMatchesSelection, persistItineraryMutation, readPendingItineraryMutation, type PendingItineraryMutation } from "./itinerary-persistence";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const mutation: PendingItineraryMutation = { eventId: "event-1", eventSlug: "devflow", sessionId: "session-1", method: "PUT", selected: true };

describe("navigation-safe itinerary persistence", () => {
  it("continues a keepalive save after the initiating view navigates away", async () => {
    const storage = memoryStorage();
    let finish!: (value: { selectedSessionIds: string[] }) => void;
    const request = vi.fn((url: string, init: RequestInit) => {
      expect(url).toContain("/anonymous-itinerary/sessions/session-1");
      expect(init).toMatchObject({ method: "PUT", keepalive: true, headers: { "x-itinerary-recovery": "recovery-token" } });
      return new Promise<{ selectedSessionIds: string[] }>((resolve) => { finish = resolve; });
    });

    const saving = persistItineraryMutation(mutation, "recovery-token", storage, request);
    expect(readPendingItineraryMutation(storage, mutation.eventId)).toEqual(mutation);
    expect(request).toHaveBeenCalledOnce();

    // The caller can now unmount/navigate; persistence is owned by this module-level promise.
    finish({ selectedSessionIds: ["session-1"] });
    await expect(saving).resolves.toEqual({ selectedSessionIds: ["session-1"] });
    expect(storage.getItem(itineraryMutationKey(mutation.eventId))).toBeNull();
  });

  it("retains failed intent for explicit retry and reconciles against saved server truth", async () => {
    const storage = memoryStorage();
    await expect(persistItineraryMutation(mutation, null, storage, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    const pending = readPendingItineraryMutation(storage, mutation.eventId);
    expect(pending).toEqual(mutation);
    expect(itineraryMutationMatchesSelection(mutation, new Set())).toBe(false);
    expect(itineraryMutationMatchesSelection(mutation, new Set(["session-1"]))).toBe(true);

    await expect(persistItineraryMutation(pending!, null, storage, async () => ({ selectedSessionIds: ["session-1"] })))
      .resolves.toEqual({ selectedSessionIds: ["session-1"] });
    expect(readPendingItineraryMutation(storage, mutation.eventId)).toBeNull();
  });
});
