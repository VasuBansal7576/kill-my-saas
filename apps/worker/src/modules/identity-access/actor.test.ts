import { describe, expect, it } from "vitest";
import { actorCanAccessEvent, type Actor, type EventRole } from "./actor";

describe("event role boundary", () => {
  const eventId = "event-devflow";
  const cases: Array<{ role: EventRole; allowed: EventRole; denied: EventRole }> = [
    { role: "organizer", allowed: "organizer", denied: "reviewer" },
    { role: "speaker", allowed: "speaker", denied: "organizer" },
    { role: "reviewer", allowed: "reviewer", denied: "speaker" },
  ];

  it.each(cases)("keeps $role grants event-scoped", ({ role, allowed, denied }) => {
    const actor: Actor = {
      identityId: `identity-${role}`,
      personId: `person-${role}`,
      organizationRoles: [],
      eventRoles: [{ eventId, role }],
    };

    expect(actorCanAccessEvent(actor, eventId, allowed)).toBe(true);
    expect(actorCanAccessEvent(actor, eventId, denied)).toBe(false);
    expect(actorCanAccessEvent(actor, "another-event", allowed)).toBe(false);
  });
});

