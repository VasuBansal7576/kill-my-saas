import { describe, expect, it } from "vitest";
import { deliveryStateForProviderEvent } from "./service";

describe("durable provider outcomes", () => {
  it.each([
    ["accepted", "delivered", "delivered"],
    ["accepted", "hardBounce", "bounced"],
    ["accepted", "softBounce", "bounced"],
    ["accepted", "blocked", "failed"],
    ["sending", "sent", "accepted"],
    ["accepted", "deferred", "accepted"],
  ] as const)("maps %s + %s to %s", (current, providerEvent, expected) => {
    expect(deliveryStateForProviderEvent(current, providerEvent)).toBe(expected);
  });

  it("never lets a late provider event downgrade a delivered message", () => {
    expect(deliveryStateForProviderEvent("delivered", "hardBounce")).toBe("delivered");
  });
});
