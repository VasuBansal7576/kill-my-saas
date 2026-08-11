import type { ExternalSyncReceipt } from "@programflow/contracts";

export type AirtableEntity = "person" | "speaker" | "session";
export type AirtableDirection = "export" | "import";
export type AirtableRunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "blocked_external";
export type AirtableItemStatus = "synced" | "skipped" | "conflict" | "failed" | "blocked_external";

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}
export interface AirtableMutation {
  fields: Record<string, unknown>;
}

export interface AirtableUpdateMutation extends AirtableMutation {
  id: string;
}

export interface AirtableProviderPort {
  listPage(input: { baseId: string; tableId: string; offset?: string; pageSize: number }): Promise<{
    records: AirtableRecord[];
    offset?: string;
    requestCount: number;
  }>;
  create(input: { baseId: string; tableId: string; records: AirtableMutation[] }): Promise<{
    records: AirtableRecord[];
    requestCount: number;
  }>;
  update(input: { baseId: string; tableId: string; records: AirtableUpdateMutation[] }): Promise<{
    records: AirtableRecord[];
    requestCount: number;
  }>;
}

export interface AirtableFieldMappingRecord {
  id: string;
  entityType: AirtableEntity;
  localField: string;
  externalField: string;
  direction: "export" | "import" | "both";
  owner: "programflow" | "airtable";
  enabled: boolean;
}

export interface AirtableConfigurationRecord {
  id: string;
  organizationId: string;
  eventId: string;
  baseId: string | null;
  tableId: string | null;
  credentialBinding: string;
  modifiedTimeField: string | null;
  enabled: boolean;
  pageSize: number;
  createdAt: Date;
  updatedAt: Date;
  mappings: AirtableFieldMappingRecord[];
}

export interface CanonicalSyncRecord {
  entityType: AirtableEntity;
  canonicalId: string;
  revision: number;
  updatedAt: Date;
  fields: Record<string, unknown>;
}

export interface AirtableRecordLinkRecord {
  id: string;
  entityType: AirtableEntity;
  canonicalId: string;
  airtableRecordId: string;
  canonicalRevision: number | null;
  externalModifiedAt: Date | null;
  lastSyncedAt: Date;
}

export interface AirtableSyncItemRecord {
  id: string;
  entityType: AirtableEntity | null;
  canonicalId: string | null;
  airtableRecordId: string | null;
  operation: "create" | "update" | "import" | "skip" | "configuration";
  status: AirtableItemStatus;
  attemptCount: number;
  providerResponded: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AirtableSyncRunRecord {
  id: string;
  direction: AirtableDirection;
  status: AirtableRunStatus;
  idempotencyKey: string;
  exportedCount: number;
  importedCount: number;
  failedCount: number;
  providerResponded: boolean;
  providerRequestCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  items: AirtableSyncItemRecord[];
}

export interface AirtableWorkspace {
  event: { id: string; organizationId: string; slug: string; name: string };
  configuration: AirtableConfigurationRecord | null;
  readiness: {
    exportReady: boolean;
    importReady: boolean;
    tokenAvailable: boolean;
    missing: string[];
  };
  lastRun: AirtableSyncRunRecord | null;
  recentRuns: AirtableSyncRunRecord[];
}

export interface AirtableRunResult extends ExternalSyncReceipt {
  providerResponded: boolean;
  providerRequestCount: number;
  idempotent: boolean;
}
