import { describe, expect, it } from "vitest";
import { localValueIsNewer, mapAirtableAugmentation, mapCanonicalRecord, readCanonicalIdentity } from "./reconciliation";
import type { AirtableConfigurationRecord } from "./types";

const configuration: AirtableConfigurationRecord = {
  id: crypto.randomUUID(),
  organizationId: crypto.randomUUID(),
  eventId: crypto.randomUUID(),
  baseId: "app_base",
  tableId: "Program",
  credentialBinding: "AIRTABLE_TOKEN",
  modifiedTimeField: "Last modified",
  enabled: true,
  pageSize: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
  mappings: [
    { id: crypto.randomUUID(), entityType: "session", localField: "title", externalField: "Title", direction: "export", owner: "programflow", enabled: true },
    { id: crypto.randomUUID(), entityType: "session", localField: "decision", externalField: "Decision", direction: "import", owner: "programflow", enabled: true },
    { id: crypto.randomUUID(), entityType: "session", localField: "researchNotes", externalField: "Research notes", direction: "import", owner: "airtable", enabled: true },
  ],
};

describe("Airtable canonical reconciliation", () => {
  it("exports stable identity and only ProgramFlow-owned mapped fields", () => {
    const canonicalId = crypto.randomUUID();
    expect(mapCanonicalRecord({
      entityType: "session",
      canonicalId,
      revision: 4,
      updatedAt: new Date("2027-05-01T10:00:00.000Z"),
      fields: { title: "Stateful Edge", researchNotes: "private" },
    }, configuration)).toEqual({
      _programflow_id: canonicalId,
      _programflow_type: "session",
      _programflow_revision: 4,
      _programflow_updated_at: "2027-05-01T10:00:00.000Z",
      Title: "Stateful Edge",
    });
  });

  it("imports only Airtable-owned augmentation fields and never canonical fields", () => {
    const canonicalId = crypto.randomUUID();
    const record = {
      id: "rec_session",
      fields: { _programflow_id: canonicalId, _programflow_type: "session", Decision: "rejected", "Research notes": "Invite again" },
    };
    expect(readCanonicalIdentity(record)).toEqual({ canonicalId, entityType: "session" });
    expect(mapAirtableAugmentation(record, "session", configuration)).toEqual({ researchNotes: "Invite again" });
  });

  it("detects a newer local augmentation instead of silently overwriting it", () => {
    expect(localValueIsNewer(new Date("2027-05-02T10:00:00Z"), new Date("2027-05-01T10:00:00Z"))).toBe(true);
    expect(localValueIsNewer(new Date("2027-05-01T10:00:00Z"), new Date("2027-05-02T10:00:00Z"))).toBe(false);
  });
});
