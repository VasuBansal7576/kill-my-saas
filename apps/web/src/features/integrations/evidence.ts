import type { AirtableSyncItem, AirtableSyncRun } from "./types";

export interface AirtableReceipt extends AirtableSyncItem {
  runId: string;
  direction: AirtableSyncRun["direction"];
  runCreatedAt: string;
}

export interface AirtableFailureGroup {
  key: string;
  errorCode: string;
  message: string;
  remediation: string;
  affected: number;
  examples: AirtableReceipt[];
}

export function flattenAirtableReceipts(runs: AirtableSyncRun[]): AirtableReceipt[] {
  return runs.flatMap((run) => run.items.map((item) => ({ ...item, runId: run.id, direction: run.direction, runCreatedAt: run.createdAt })));
}

export function groupAirtableFailures(receipts: AirtableReceipt[]): AirtableFailureGroup[] {
  const groups = new Map<string, AirtableFailureGroup>();
  for (const receipt of receipts) {
    if (!["failed", "conflict", "blocked_external"].includes(receipt.status)) continue;
    const errorCode = receipt.errorCode ?? "unknown_error";
    const key = `${receipt.direction}:${errorCode}`;
    const existing = groups.get(key) ?? {
      key,
      errorCode,
      message: receipt.errorMessage ?? "Synchronization item needs attention.",
      remediation: remediationFor(errorCode),
      affected: 0,
      examples: [],
    };
    existing.affected += 1;
    if (existing.examples.length < 3) existing.examples.push(receipt);
    groups.set(key, existing);
  }
  return [...groups.values()].sort((left, right) => right.affected - left.affected || left.key.localeCompare(right.key));
}

export function searchAirtableReceipts(receipts: AirtableReceipt[], search: string): AirtableReceipt[] {
  const query = search.trim().toLowerCase();
  if (!query) return receipts;
  return receipts.filter((receipt) => [receipt.id, receipt.runId, receipt.direction, receipt.status, receipt.entityType, receipt.canonicalId, receipt.airtableRecordId, receipt.operation, receipt.errorCode, receipt.errorMessage, JSON.stringify(receipt.requestMetadata), JSON.stringify(receipt.responseMetadata)]
    .some((value) => String(value ?? "").toLowerCase().includes(query)));
}

function remediationFor(errorCode: string): string {
  if (errorCode.includes("not_configured") || errorCode.includes("token") || errorCode.includes("credential")) return "Complete the connection metadata and secret binding, then start a new run.";
  if (errorCode.includes("canonical_record_not_found") || errorCode.includes("programflow_id")) return "Restore a valid _programflow_id that points to a canonical ProgramFlow record.";
  if (errorCode.includes("conflict") || errorCode.includes("newer_local")) return "Review the newer canonical value; Airtable cannot overwrite canonical fields. Keep the field as augmentation or export again.";
  if (errorCode.includes("mapping") || errorCode.includes("field")) return "Correct the field mapping and ownership, save the configuration, then retry.";
  if (errorCode.includes("rate") || errorCode.includes("timeout") || errorCode.includes("request")) return "Check the provider response metadata and retry after the provider condition clears.";
  return "Inspect the raw receipt metadata, correct the source condition, then start a new idempotent run.";
}
