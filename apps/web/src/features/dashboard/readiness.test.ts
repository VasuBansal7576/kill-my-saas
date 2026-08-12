import { describe, expect, it } from "vitest";
import { readinessAction } from "./readiness";

describe("program readiness actions", () => {
  it("routes every responsible workspace to its existing organizer surface", () => {
    const event = { organizationId: "organization 1", slug: "devflow conf" };

    expect([
      readinessAction(event, "communications"),
      readinessAction(event, "speaker_crm"),
      readinessAction(event, "publishing"),
      readinessAction(event, "accelevents"),
      readinessAction(event, "airtable"),
    ]).toEqual([
      { label: "Inspect & retry", to: "/organizer/events/devflow%20conf/communications" },
      { label: "Review identity", to: "/organizer/organizations/organization%201/speaker-crm" },
      { label: "Open publication", to: "/organizer/events/devflow%20conf/publish" },
      { label: "Inspect & retry", to: "/organizer/events/devflow%20conf/integrations/accelevents" },
      { label: "Inspect & rerun", to: "/organizer/events/devflow%20conf/integrations/airtable" },
    ]);
  });
});
