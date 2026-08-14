export type DeliveryStatus = "queued" | "sending" | "accepted" | "delivered" | "bounced" | "failed" | "blocked_external";
export type CommunicationStatus = "draft" | "queued" | "sending" | "complete" | "partial_failure" | "failed" | "blocked_external";

export interface CommunicationTemplate {
  id: string;
  name: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  mergeFields: string[];
  revision: number;
}

export interface DeliveryAttempt {
  id: string;
  attemptNumber: number;
  status: "sending" | "accepted" | "failed" | "blocked_external";
  providerMessageId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  responseMetadata?: Record<string, unknown>;
}

export interface CommunicationRecipient {
  id: string;
  personId: string;
  toEmail: string | null;
  toName: string;
  renderedSubject: string;
  renderedHtml: string;
  renderedText: string;
  status: DeliveryStatus;
  providerMessageId: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  failedAt: string | null;
  attempts: DeliveryAttempt[];
  providerEvents: Array<{
    id: string;
    providerEventId: string;
    eventType: string;
    occurredAt: string;
    metadata?: Record<string, unknown>;
  }>;
  proof?: DeliveryProof;
  retry?: DeliveryRetry;
  outbox?: OutboxEvidence[];
}

export interface DeliveryProof {
  claim: DeliveryStatus | "provider_accepted";
  delivered: boolean;
  providerMessageId: string | null;
  explanation: string;
}

export interface DeliveryRetry {
  eligible: boolean;
  nextAttempt: number | null;
  remediation: string;
}

export interface OutboxEvidence {
  id: string;
  status: "pending" | "claimed" | "dispatched" | "failed" | "dead_letter";
  attempts: number;
  availableAt: string;
  dispatchedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface CommunicationSource {
  type: string;
  label: string;
  workflowHref: string;
  context: Record<string, unknown>;
}

export interface CommunicationCampaign {
  id: string;
  name: string;
  kind: "transactional" | "campaign" | "reminder" | "calendar";
  status: CommunicationStatus;
  audienceSnapshot: Record<string, unknown>;
  createdAt: string;
  source?: CommunicationSource;
  recipients: CommunicationRecipient[];
}

export interface CommunicationCampaignSummary extends Omit<CommunicationCampaign, "recipients"> {
  source: CommunicationSource;
  recipientCounts: Partial<Record<DeliveryStatus, number>>;
}

export interface CommunicationHistoryPage {
  campaigns: CommunicationCampaignSummary[];
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
}

export interface CommunicationDetail extends Omit<CommunicationCampaign, "source"> {
  source: CommunicationSource;
  recipients: Array<CommunicationRecipient & { proof: DeliveryProof; retry: DeliveryRetry; outbox: OutboxEvidence[] }>;
}

export interface CalendarArtifact {
  id: string;
  personId: string;
  revision: number;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  filename: string;
  createdAt: string;
}

export interface CommunicationsWorkspace {
  event: { id: string; slug: string; name: string };
  templates: CommunicationTemplate[];
  campaigns: CommunicationCampaign[];
  calendarArtifacts: CalendarArtifact[];
}

export interface CommunicationsSummary {
  event: { id: string; slug: string; name: string };
  templates: CommunicationTemplate[];
  calendarArtifacts: CalendarArtifact[];
  historyPageSize: number;
  maxDeliveryAttempts: number;
  operations: {
    outboxCounts: Partial<Record<OutboxEvidence["status"], number>>;
    latestActivityAt: string | null;
  };
}

export interface DeliveryPollReceipt {
  recipientId: string;
  status: DeliveryStatus;
  pending: boolean;
  outcomesApplied: number;
  proof: DeliveryProof;
}

export interface AudienceSpeaker {
  personId: string;
  displayName: string;
  email: string | null;
  status: "invited" | "onboarding" | "ready" | "withdrawn";
  company: string;
  jobTitle: string;
  taskProgress: { complete: number; total: number; overdue: number };
}

export interface ApiErrorBody { error?: { message?: string } }
