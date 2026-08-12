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
  }>;
}

export interface CommunicationCampaign {
  id: string;
  name: string;
  kind: "transactional" | "campaign" | "reminder" | "calendar";
  status: CommunicationStatus;
  audienceSnapshot: Record<string, unknown>;
  createdAt: string;
  recipients: CommunicationRecipient[];
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

export interface AudienceSpeaker {
  personId: string;
  displayName: string;
  email: string | null;
  status: "invited" | "onboarding" | "ready" | "withdrawn";
  employerApprovalStatus: "not_required" | "pending" | "approved";
  company: string;
  jobTitle: string;
  taskProgress: { complete: number; total: number; overdue: number };
}

export interface ApiErrorBody { error?: { message?: string } }
