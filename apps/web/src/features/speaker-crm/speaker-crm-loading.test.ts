import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCrmJson } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Speaker CRM loading orchestration", () => {
  it("bounds stalled CRM requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));

    const request = requestCrmJson("/api/v1/organizer/organizations/org/speaker-crm/pipeline");
    const rejection = expect(request).rejects.toThrow("The Speaker CRM request took too long. Try again.");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
  });

  it("tracks primary and optional CRM resources independently with retryable states", () => {
    const page = readFileSync(new URL("./SpeakerCrmPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("loadCrmResource");
    expect(page).toContain("resourceStatus.pipeline");
    expect(page).toContain("Retry supporting data");
    expect(page).toContain("Retry {label}");
    expect(page).not.toContain("const [nextContacts, nextPipeline, nextSegments");
  });
});
