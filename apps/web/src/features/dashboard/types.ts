export interface DashboardSnapshot {
  event: { id: string; slug: string; name: string; startsOn: string; endsOn: string; timezone: string };
  generatedAt: string;
  cfp: {
    status: "not_configured" | "draft" | "open" | "closed";
    forms: number;
    drafts: number;
    submitted: number;
    submittedTrend: Array<{ day: string; count: number }>;
  };
  reviews: { assigned: number; completed: number; recused: number; outstanding: number; percentComplete: number; activeConflicts: number };
  decisions: { undecided: number; accepted: number; rejected: number; notified: number; notificationPending: number };
  speakers: {
    accepted: number;
    ready: number;
    needingAttention: number;
    tasks: { total: number; completed: number; overdue: number };
    attention: Array<{ eventSpeakerId: string; displayName: string; completed: number; total: number; overdue: number }>;
  };
  deliverables: { total: number; approved: number; outstanding: number; overdue: number; awaitingReview: number; changesRequested: number; missing: number };
  communications: { recipients: number; successful: number; inFlight: number; failed: number; deliveryRate: number; undelivered: number };
  integrations: { failures: number; providers: Array<{ provider: "airtable" | "accelevents"; status: string; failedItems: number }> };
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
  publication: { state: "draft" | "live" | "paused"; publicRevision: number; liveAt: string | null; updatedAt: string | null };
  activity: Array<{
    id: string;
    kind: "submission" | "review" | "decision" | "task" | "deliverable" | "communication" | "publication";
    title: string;
    detail: string;
    occurredAt: string;
  }>;
}
