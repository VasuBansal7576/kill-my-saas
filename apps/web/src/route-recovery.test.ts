import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bounded route recovery", () => {
  it("keeps organizer and lazy-route structure visible with timeout recovery", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(app).toContain("ProductShellLoading");
    expect(app).toContain("Your workspace took longer than 8 seconds to respond.");
    expect(app).toContain("Retry workspace");
    expect(app).toContain("RouteLoading label=");
    expect(app).toContain("The ${label} is taking longer than expected.");
    expect(app).toContain("Retry route");
    expect(app).toContain("route-loading-skeleton");
    expect(app).not.toContain('product-shell-loading">Loading your workspace');
  });

  it("gives unknown public program and CFP routes branded recovery choices", () => {
    const program = readFileSync(new URL("./features/public-program/PublicProgramPage.tsx", import.meta.url), "utf8");
    const cfp = readFileSync(new URL("./features/forms-submissions/PublicCfpPage.tsx", import.meta.url), "utf8");
    for (const source of [program, cfp]) {
      expect(source).toContain('id="main-content"');
      expect(source).toContain("ProgramFlow home");
      expect(source).toContain('to="/help"');
      expect(source).toContain("8 seconds");
    }
    expect(program).toContain("Retry program");
    expect(program).toContain("Open this event’s CFP");
    expect(cfp).toContain("Retry CFP");
  });
});
