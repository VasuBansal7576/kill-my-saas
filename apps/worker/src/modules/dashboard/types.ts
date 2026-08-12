export interface DashboardSnapshot {
  event: {
    id: string;
    organizationId: string;
    slug: string;
    name: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
  };
  generatedAt: string;
  cfp: {
    status: "not_configured" | "draft" | "open" | "closed";
    forms: number;
    drafts: number;
    submitted: number;
    submittedTrend: Array<{ day: string; count: number }>;
  };
  reviews: {
    assigned: number;
    completed: number;
    recused: number;
    outstanding: number;
    percentComplete: number;
    activeConflicts: number;
  };
  decisions: {
    undecided: number;
    accepted: number;
    rejected: number;
    notified: number;
  };
  speakers: {
    accepted: number;
    ready: number;
    needingAttention: number;
    tasks: { total: number; completed: number; overdue: number };
    attention: Array<{
      eventSpeakerId: string;
      displayName: string;
      completed: number;
      total: number;
      overdue: number;
    }>;
  };
  deliverables: {
    total: number;
    approved: number;
    outstanding: number;
    overdue: number;
    awaitingReview: number;
    changesRequested: number;
  };
  communications: {
    recipients: number;
    successful: number;
    inFlight: number;
    failed: number;
    deliveryRate: number;
  };
  agenda: {
    revisionId: string | null;
    revisionVersion: number | null;
    revisionStatus: "draft" | "ready" | null;
    sessions: number;
    scheduled: number;
    unscheduled: number;
    conflicts: number;
    percentReady: number;
  };
  publication: {
    state: "draft" | "live" | "paused";
    scheduleRevisionId: string | null;
    publicRevision: number;
    liveAt: string | null;
    updatedAt: string | null;
  };
  readiness: {
    status: "ready" | "needs_attention";
    exceptions: ProgramReadinessException[];
  };
  activity: Array<{
    id: string;
    kind: "submission" | "review" | "decision" | "task" | "deliverable" | "communication" | "publication";
    title: string;
    detail: string;
    occurredAt: string;
  }>;
}

export type ProgramReadinessExceptionCode =
  | "portal_invitation_failed"
  | "portal_identity_conflict"
  | "publication_handoff_failed"
  | "publication_behind_ready_revision"
  | "accelevents_run_failed"
  | "accelevents_out_of_date"
  | "airtable_run_failed";

export interface ProgramReadinessException {
  id: string;
  code: ProgramReadinessExceptionCode;
  severity: "blocker" | "warning";
  title: string;
  detail: string;
  affectedCount: number;
  workspace: "communications" | "speaker_crm" | "publishing" | "accelevents" | "airtable";
  sourceId: string;
  proof: {
    sourceType: "communication_recipient" | "event_speaker" | "outbox_event" | "schedule_revision" | "accelevents_run" | "airtable_run";
    status: string;
    occurredAt: string | null;
    facts: Record<string, string | number | boolean | null>;
  };
}

export interface DashboardRows {
  forms: Array<{ status: "draft" | "published" | "closed"; opensAt: Date | null; closesAt: Date | null }>;
  submissions: Array<{ id: string; title: string; state: "draft" | "submitted"; submittedAt: Date | null; updatedAt: Date }>;
  reviewAssignments: Array<{ id: string; status: "assigned" | "in_progress" | "submitted" | "recused"; updatedAt: Date }>;
  activeReviewConflicts: Array<{ id: string }>;
  decisions: Array<{ id: string; outcome: "accepted" | "rejected"; notifiedAt: Date | null; decidedAt: Date }>;
  speakers: Array<{ id: string; displayName: string; status: "invited" | "onboarding" | "ready" | "withdrawn" }>;
  taskAssignments: Array<{
    id: string;
    eventSpeakerId: string;
    displayName: string;
    status: "pending" | "complete";
    dueAt: Date | null;
    dueAtOverride: Date | null;
    completedAt: Date | null;
  }>;
  deliverables: Array<{
    id: string;
    status: "pending" | "submitted" | "changes_requested" | "approved";
    dueAt: Date | null;
    updatedAt: Date;
  }>;
  recipients: Array<{
    id: string;
    status: "queued" | "sending" | "accepted" | "delivered" | "bounced" | "failed" | "blocked_external";
    updatedAt: Date;
    lastOutcomeAt: Date | null;
  }>;
  sessions: Array<{ id: string }>;
  latestRevision: { id: string; version: number; status: "draft" | "ready" } | null;
  latestReadyRevision: { id: string; version: number; status: "ready" } | null;
  placements: Array<{ id: string; revisionId: string; sessionId: string; roomId: string; startsAt: Date; endsAt: Date }>;
  rooms: Array<{ id: string; name: string }>;
  sessionSpeakers: Array<{ sessionId: string; personId: string; displayName: string }>;
  publication: { state: "draft" | "live" | "paused"; scheduleRevisionId: string | null; publicRevision: number; liveAt: Date | null; updatedAt: Date } | null;
  portalInvitationRecipients: Array<{
    id: string;
    personId: string;
    displayName: string;
    status: "queued" | "sending" | "accepted" | "delivered" | "bounced" | "failed" | "blocked_external";
    attemptCount: number;
    lastErrorCode: string | null;
    lastOutcomeAt: Date | null;
  }>;
  speakerIdentities: Array<{
    eventSpeakerId: string;
    personId: string;
    displayName: string;
    canonicalEmail: string | null;
    aliasPersonId: string | null;
    hasSpeakerMembership: boolean;
  }>;
  publicationHandoffs: Array<{
    id: string;
    status: "pending" | "claimed" | "dispatched" | "failed" | "dead_letter";
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  accelevents: null | {
    enabled: boolean;
    latestRun: null | {
      id: string;
      mode: "preview" | "manual" | "retry";
      status: "queued" | "running" | "succeeded" | "partial" | "failed" | "blocked_external";
      failedCount: number;
      providerResponded: boolean;
      failureCode: string | null;
      createdAt: Date;
      completedAt: Date | null;
    };
    latestSuccessfulLiveRun: null | { id: string; createdAt: Date };
  };
  airtable: null | {
    enabled: boolean;
    latestRun: null | {
      id: string;
      direction: "export" | "import";
      status: "queued" | "running" | "succeeded" | "partial" | "failed" | "blocked_external";
      failedCount: number;
      providerResponded: boolean;
      failureCode: string | null;
      createdAt: Date;
      completedAt: Date | null;
    };
  };
}
