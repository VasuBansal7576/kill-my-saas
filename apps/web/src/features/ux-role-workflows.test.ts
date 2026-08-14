import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decisionLabel } from "./forms-submissions/presentation";
import { fileRequestActionLabel } from "./speaker-operations/presentation";
import { reviewCriterionSummary, reviewerCriterionHelp } from "./reviews-decisions/presentation";

describe("role workflow discoverability", () => {
  it("exposes conventional organizer task, resource, and speaker-detail routes in navigation", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const navigation = readFileSync(new URL("../app/organizer-navigation.ts", import.meta.url), "utf8");

    expect(app).toContain('path="events/:eventSlug/tasks"');
    expect(app).toContain('path="events/:eventSlug/resources"');
    expect(app).toContain('path="events/:eventSlug/speakers/:eventSpeakerId"');
    expect(navigation).toContain('["Tasks", `${base}/tasks`]');
    expect(navigation).toContain('["Portal resources", `${base}/resources`]');
  });

  it("uses an obvious file action for new and existing file versions", () => {
    expect(fileRequestActionLabel("pending")).toBe("Upload file");
    expect(fileRequestActionLabel("complete")).toBe("Replace file");
  });

  it("projects final speaker decisions as plain Accepted or Rejected labels", () => {
    expect(decisionLabel({ decision: "accepted", state: "submitted" })).toBe("Accepted");
    expect(decisionLabel({ decision: "rejected", state: "submitted" })).toBe("Rejected");
    expect(decisionLabel({ decision: null, state: "submitted" })).toBe("Submitted");
  });

  it("renders relative weights honestly and states numeric rating bounds", () => {
    const weightedTwo = { key: "fit", label: "Program fit", type: "numeric", required: true, weight: 2, min: 1, max: 5 } as const;
    const weightedOne = { key: "clarity", label: "Clarity", type: "numeric", required: true, weight: 1, min: 0, max: 10 } as const;

    expect(reviewerCriterionHelp(weightedTwo)).toBe("Required · Weight 2 · Rating scale 1 (minimum) to 5 (maximum)");
    expect(reviewCriterionSummary(weightedOne)).toBe("Numeric rating · Weight 1 · Rating scale 0 (minimum) to 10 (maximum)");
    expect(reviewerCriterionHelp(weightedTwo)).not.toContain("2%");
  });
});
