export interface DashboardSnapshot {
  event: { id: string; organizationId: string; slug: string; name: string; startsOn: string; endsOn: string; timezone: string };
  generatedAt: string;
  cfp: {
    status: "not_configured" | "draft" | "open" | "closed";
    forms: number;
    drafts: number;
    submitted: number;
    submittedTrend: Array<{ day: string; count: number }>;
  };
  reviews: { assigned: number; completed: number; recused: number; outstanding: number; percentComplete: number; activeConflicts: number };
  decisions: { undecided: number; accepted: number; rejected: number; notified: number };
  speakers: {
    accepted: number;
    ready: number;
    needingAttention: number;
    tasks: { total: number; completed: number; overdue: number };
    attention: Array<{ eventSpeakerId: string; displayName: string; completed: number; total: number; overdue: number }>;
  };
  deliverables: { total: number; approved: number; outstanding: number; overdue: number; awaitingReview: number; changesRequested: number };
  communications: { recipients: number; successful: number; inFlight: number; failed: number; deliveryRate: number };
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
  publication: { state: "draft" | "live" | "paused"; scheduleRevisionId: string | null; publicRevision: number; liveAt: string | null; updatedAt: string | null };
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
  | "employer_approval_pending"
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
