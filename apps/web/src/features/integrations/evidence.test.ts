import { describe, expect, it } from "vitest";
import { groupAirtableFailures, searchAirtableReceipts, type AirtableReceipt } from "./evidence";

const receipts: AirtableReceipt[] = [
  receipt({ id: "one", canonicalId: "speaker-one", errorCode: "canonical_record_not_found" }),
  receipt({ id: "two", canonicalId: "speaker-two", errorCode: "canonical_record_not_found" }),
  receipt({ id: "three", status: "synced", canonicalId: "session-ok", errorCode: null }),
];

describe("Airtable evidence grouping", () => {
  it("groups repeated failures by direction and cause with affected counts and examples", () => {
    const groups = groupAirtableFailures(receipts);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ errorCode: "canonical_record_not_found", affected: 2 });
    expect(groups[0]?.examples.map((item) => item.canonicalId)).toEqual(["speaker-one", "speaker-two"]);
    expect(groups[0]?.remediation).toContain("_programflow_id");
  });

  it("searches successful and failed raw receipts including metadata", () => {
    expect(searchAirtableReceipts(receipts, "session-ok").map((item) => item.id)).toEqual(["three"]);
    expect(searchAirtableReceipts(receipts, "request-123")).toHaveLength(3);
  });
});

function receipt(overrides: Partial<AirtableReceipt>): AirtableReceipt {
  return { id: "receipt", runId: "run", direction: "import", runCreatedAt: "2027-01-01T00:00:00.000Z", entityType: "speaker", canonicalId: null, airtableRecordId: null, operation: "import", status: "failed", attemptCount: 1, providerResponded: true, errorCode: "unknown", errorMessage: "Failed", requestMetadata: { requestId: "request-123" }, responseMetadata: {}, createdAt: "2027-01-01T00:00:00.000Z", ...overrides };
}
