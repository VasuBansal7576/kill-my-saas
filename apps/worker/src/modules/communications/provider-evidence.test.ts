import { describe, expect, it } from "vitest";
import { communicationSource } from "./service";

describe("organizer provider-evidence workflow context", () => {
  it.each([
    ["submission_confirmation", "transactional", "CFP confirmation", "/submissions"],
    ["decision_notification", "transactional", "Accept / reject decision", "/submissions"],
    ["outstanding_reviews", "reminder", "Reviewer reminder", "/evaluations"],
    ["portal_invitation", "transactional", "Portal invitation", "/speakers"],
    ["speaker_bulk", "campaign", "Bulk speaker message", "/speakers"],
    ["outstanding_tasks", "reminder", "Overdue task reminder", "/tasks"],
    ["speaker_crm", "campaign", "CRM bulk outreach", "/organizer/speaker-crm"],
  ] as const)("classifies %s evidence", (type, kind, label, path) => {
    const source = communicationSource({ name: "Evidence fixture", kind, audienceSnapshot: { type, sourceRecordId: "record-1" } }, "devflow-conf-2027");
    expect(source).toMatchObject({ label, context: { sourceRecordId: "record-1" } });
    expect(source.workflowHref).toContain(path);
  });
});
