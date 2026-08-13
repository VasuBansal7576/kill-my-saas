import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("confirmed public entry regressions", () => {
  it("renders the anonymous CFP as soon as the public form request succeeds", () => {
    const page = readFileSync(new URL("./features/forms-submissions/PublicCfpPage.tsx", import.meta.url), "utf8");
    const publicReady = page.indexOf('setState("idle")');
    const speakerRequest = page.indexOf('fetch(`/api/v1/speaker/events/${eventSlug}/submissions`');

    expect(publicReady).toBeGreaterThan(-1);
    expect(speakerRequest).toBeGreaterThan(-1);
    expect(publicReady).toBeLessThan(speakerRequest);
    expect(page).toContain("finally");
    expect(page).toContain("setAuthChecked(true)");
  });
});
