export type AcceleventsEntity = "speaker" | "session";
export interface AcceleventsFieldMapping {
  id?: string;
  entityType: AcceleventsEntity;
  canonicalField: string;
  externalField: string;
  required: boolean;
  enabled: boolean;
}
export interface AcceleventsReferenceMapping {
  id?: string;
  referenceType: "track" | "format";
  canonicalId: string;
  canonicalLabel: string;
  externalValue: string;
}
export interface AcceleventsAttempt {
  id: string;
  attemptNumber: number;
  status: "succeeded" | "failed" | "blocked_external" | "not_sent";
  providerResponded: boolean;
  httpStatus: number | null;
  providerRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}
export interface AcceleventsSyncRecord {
  id: string;
  entityType: AcceleventsEntity;
  canonicalId: string;
  externalId: string | null;
  operation: "create" | "update" | "skip" | "validate";
  status: "pending" | "previewed" | "synced" | "skipped" | "failed" | "blocked_external";
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  attempts: AcceleventsAttempt[];
}
export interface AcceleventsSyncRun {
  id: string;
  sourceRunId: string | null;
  mode: "preview" | "manual" | "retry";
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "blocked_external";
  idempotencyKey: string;
  plannedCount: number;
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
  providerResponded: boolean;
  providerRequestCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  records: AcceleventsSyncRecord[];
}
export interface AcceleventsWorkspace {
  event: { id: string; organizationId: string; slug: string; name: string; timezone: string };
  configuration: {
    id: string;
    externalEventUrl: string | null;
    apiBaseUrl: string;
    credentialBinding: string;
    authorizationHeader: string;
    enabled: boolean;
    mappings: AcceleventsFieldMapping[];
    referenceMappings: AcceleventsReferenceMapping[];
  };
  readiness: { ready: boolean; tokenAvailable: boolean; missing: string[] };
  canonicalCounts: { speakers: number; sessions: number };
  availableReferences: Array<{ referenceType: "track" | "format"; canonicalId: string; canonicalLabel: string }>;
  lastRun: AcceleventsSyncRun | null;
  recentRuns: AcceleventsSyncRun[];
}
export interface AcceleventsRunReceipt {
  provider: "accelevents";
  runId: string;
  mode: "preview" | "manual" | "retry";
  status: "complete" | "partial_failure" | "failed" | "blocked_external";
  planned: number;
  synced: number;
  skipped: number;
  failed: number;
  providerResponded: boolean;
  providerRequestCount: number;
  idempotent: boolean;
}
