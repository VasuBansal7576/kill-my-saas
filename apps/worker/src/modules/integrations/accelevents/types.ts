export type AcceleventsEntity = "speaker" | "session";
export type AcceleventsReference = "track" | "format";
export type AcceleventsRunMode = "preview" | "manual" | "retry";
export type AcceleventsRunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "blocked_external";
export type AcceleventsRecordStatus = "pending" | "previewed" | "synced" | "skipped" | "failed" | "blocked_external";

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
  referenceType: AcceleventsReference;
  canonicalId: string;
  canonicalLabel: string;
  externalValue: string;
}

export interface AcceleventsConfiguration {
  id: string;
  organizationId: string;
  eventId: string;
  externalEventUrl: string | null;
  apiBaseUrl: string;
  credentialBinding: string;
  authorizationHeader: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  mappings: AcceleventsFieldMapping[];
  referenceMappings: AcceleventsReferenceMapping[];
}

export interface CanonicalAcceleventsSpeaker {
  entityType: "speaker";
  canonicalId: string;
  displayName: string;
  email: string | null;
  biography: string;
  company: string;
  jobTitle: string;
  updatedAt: Date;
}

export interface CanonicalAcceleventsSession {
  entityType: "session";
  canonicalId: string;
  title: string;
  abstract: string;
  track: { id: string; name: string } | null;
  format: { id: string; name: string } | null;
  placement: {
    startsAt: Date;
    endsAt: Date;
    room: { id: string; name: string };
  };
  speakerIds: string[];
  updatedAt: Date;
}

export type CanonicalAcceleventsRecord = CanonicalAcceleventsSpeaker | CanonicalAcceleventsSession;

export interface AcceleventsRecordLink {
  entityType: AcceleventsEntity;
  canonicalId: string;
  externalId: string;
  canonicalFingerprint: string;
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
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AcceleventsSyncRecord {
  id: string;
  entityType: AcceleventsEntity;
  canonicalId: string;
  externalId: string | null;
  operation: "create" | "update" | "skip" | "validate";
  status: AcceleventsRecordStatus;
  fingerprint: string;
  idempotencyKey: string;
  errorCode: string | null;
  errorMessage: string | null;
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  createdAt: Date;
  attempts: AcceleventsAttempt[];
}

export interface AcceleventsSyncRun {
  id: string;
  organizationId: string;
  eventId: string;
  sourceRunId: string | null;
  mode: AcceleventsRunMode;
  status: AcceleventsRunStatus;
  idempotencyKey: string;
  plannedCount: number;
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
  providerResponded: boolean;
  providerRequestCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  records: AcceleventsSyncRecord[];
}

export interface AcceleventsWorkspace {
  event: { id: string; organizationId: string; slug: string; name: string; timezone: string };
  configuration: AcceleventsConfiguration;
  readiness: { ready: boolean; tokenAvailable: boolean; missing: string[] };
  canonicalCounts: { speakers: number; sessions: number };
  availableReferences: Array<{ referenceType: AcceleventsReference; canonicalId: string; canonicalLabel: string }>;
  lastRun: AcceleventsSyncRun | null;
  recentRuns: AcceleventsSyncRun[];
}

export interface AcceleventsProviderResult {
  externalId: string;
  operation: "create" | "update";
  httpStatus: number;
  requestId?: string;
  responseMetadata: Record<string, unknown>;
  requestCount: number;
}

export interface AcceleventsProviderPort {
  upsert(input: {
    eventUrl: string;
    entityType: AcceleventsEntity;
    externalId?: string;
    payload: Record<string, unknown>;
  }): Promise<AcceleventsProviderResult>;
}

export interface AcceleventsRunReceipt {
  provider: "accelevents";
  runId: string;
  mode: AcceleventsRunMode;
  status: "complete" | "partial_failure" | "failed" | "blocked_external";
  planned: number;
  synced: number;
  skipped: number;
  failed: number;
  providerResponded: boolean;
  providerRequestCount: number;
  idempotent: boolean;
}
