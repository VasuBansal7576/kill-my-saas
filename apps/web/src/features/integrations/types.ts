export type AirtableEntity = "person" | "speaker" | "session";

export interface AirtableFieldMapping {
  id?: string;
  entityType: AirtableEntity;
  localField: string;
  externalField: string;
  direction: "export" | "import" | "both";
  owner: "programflow" | "airtable";
  enabled: boolean;
}
export interface AirtableConfiguration {
  id: string;
  organizationId: string;
  eventId: string;
  baseId: string | null;
  tableId: string | null;
  credentialBinding: string;
  modifiedTimeField: string | null;
  enabled: boolean;
  pageSize: number;
  mappings: AirtableFieldMapping[];
  updatedAt: string;
}

export interface AirtableSyncItem {
  id: string;
  entityType: AirtableEntity | null;
  canonicalId: string | null;
  airtableRecordId: string | null;
  operation: "create" | "update" | "import" | "skip" | "configuration";
  status: "synced" | "skipped" | "conflict" | "failed" | "blocked_external";
  attemptCount: number;
  providerResponded: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface AirtableSyncRun {
  id: string;
  direction: "export" | "import";
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "blocked_external";
  idempotencyKey: string;
  exportedCount: number;
  importedCount: number;
  failedCount: number;
  providerResponded: boolean;
  providerRequestCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  items: AirtableSyncItem[];
}

export interface AirtableWorkspace {
  event: { id: string; organizationId: string; slug: string; name: string };
  configuration: AirtableConfiguration;
  readiness: {
    exportReady: boolean;
    importReady: boolean;
    tokenAvailable: boolean;
    missing: string[];
  };
  lastRun: AirtableSyncRun | null;
  recentRuns: AirtableSyncRun[];
}

export interface AirtableRunReceipt {
  provider: "airtable";
  runId: string;
  status: "complete" | "partial_failure" | "blocked_external";
  exported: number;
  imported: number;
  failed: number;
  providerResponded: boolean;
  providerRequestCount: number;
  idempotent: boolean;
}
