import { describe, expect, it } from "vitest";
import { readinessAction } from "./readiness";

describe("program readiness actions", () => {
  it("routes every responsible workspace to its existing organizer surface", () => {
    const event = { organizationId: "organization 1", slug: "devflow conf" };

    expect([
      readinessAction(event, { code: "portal_invitation_failed", workspace: "communications" }),
      readinessAction(event, { code: "employer_approval_pending", workspace: "communications" }),
      readinessAction(event, { code: "portal_identity_conflict", workspace: "speaker_crm" }),
      readinessAction(event, { code: "publication_handoff_failed", workspace: "publishing" }),
      readinessAction(event, { code: "accelevents_run_failed", workspace: "accelevents" }),
      readinessAction(event, { code: "airtable_run_failed", workspace: "airtable" }),
    ]).toEqual([
      { label: "Inspect & retry", to: "/organizer/events/devflow%20conf/communications" },
      { label: "Draft a chase", to: "/organizer/events/devflow%20conf/communications?chase=employer-approval" },
      { label: "Review identity", to: "/organizer/organizations/organization%201/speaker-crm" },
      { label: "Open publication", to: "/organizer/events/devflow%20conf/publish" },
      { label: "Inspect & retry", to: "/organizer/events/devflow%20conf/integrations/accelevents" },
      { label: "Inspect & rerun", to: "/organizer/events/devflow%20conf/integrations/airtable" },
    ]);
  });
});
