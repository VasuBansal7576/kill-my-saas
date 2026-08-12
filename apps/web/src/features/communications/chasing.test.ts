import { describe, expect, it } from "vitest";
import { employerApprovalChaseDraft, employerApprovalHistory } from "./chasing";

describe("assisted employer-approval chasing", () => {
  it("opens a reviewed draft for only pending speakers without selecting or sending anyone", () => {
    expect(employerApprovalChaseDraft()).toMatchObject({
      filters: { employerApprovalStatus: "pending" },
      compose: { kind: "reminder", name: "Employer approval check-in" },
      selectedPersonIds: [],
    });
  });

  it("summarizes only prior employer-approval follow-ups for the visible speaker", () => {
    expect(employerApprovalHistory("speaker-1", [
      { type: "employer_approval_chase", createdAt: "2027-04-01T09:00:00.000Z", recipientPersonIds: ["speaker-1"] },
      { type: "selected_speakers", createdAt: "2027-04-02T09:00:00.000Z", recipientPersonIds: ["speaker-1"] },
      { type: "employer_approval_chase", createdAt: "2027-04-03T09:00:00.000Z", recipientPersonIds: ["speaker-1", "speaker-2"] },
    ])).toEqual({ count: 2, lastAt: "2027-04-03T09:00:00.000Z" });
  });
});
