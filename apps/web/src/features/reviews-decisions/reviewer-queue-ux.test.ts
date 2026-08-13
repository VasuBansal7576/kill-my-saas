import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reviewerAssignmentsForFilter } from "./presentation";
import type { ReviewerQueue } from "./types";

const assignment = (assignmentId: string, status: ReviewerQueue["assignments"][number]["status"]) => ({ assignmentId, status }) as ReviewerQueue["assignments"][number];

describe("reviewer queue presentation", () => {
  it("filters incomplete work without changing assignment status", () => {
    const assignments = [assignment("new", "assigned"), assignment("draft", "in_progress"), assignment("done", "submitted"), assignment("conflict", "recused")];
    expect(reviewerAssignmentsForFilter(assignments, "incomplete").map((item) => item.assignmentId)).toEqual(["new", "draft"]);
    expect(reviewerAssignmentsForFilter(assignments, "all")).toEqual(assignments);
  });

  it("exposes the current assignment and a compact mobile queue", () => {
    const page = readFileSync(new URL("./ReviewerQueuePage.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./reviewer-queue.css", import.meta.url), "utf8");
    expect(page).toContain("aria-current=");
    expect(page).toContain('aria-controls="review-assignment-detail"');
    expect(page).toContain('aria-label="Filter review assignments"');
    expect(css).toContain(".rd-queue-items {");
    expect(css).toContain("overflow-x: auto");
  });
});
