export type EvidenceState = "missing" | "recorded" | "verified";

export interface EvaluationEvidenceCenter {
  event: { id: string; slug: string; name: string };
  generatedAt: string;
  readiness: {
    state: EvidenceState;
    verified: number;
    recorded: number;
    missing: number;
    requiredVerified: number;
    requiredTotal: number;
    extraCreditVerified: number;
    extraCreditTotal: number;
    scenarioVerified: number;
    scenarioTotal: number;
  };
  goldenThread: Array<{ order: number; label: string; route: string; scenarioIds: string[]; state: EvidenceState }>;
  scenarios: Array<{
    id: string;
    area: string;
    title: string;
    persona: string;
    entryRoute: string;
    routes: string[];
    requirementIds: string[];
    persistedTransition: string;
    downstreamHandoff: string;
    state: EvidenceState;
    requirements: Array<{
      requirementId: string;
      state: EvidenceState;
      records: Array<{ id: string; operation: string; artifactUrl: string | null; verified: boolean; createdAt: string; metadata: Record<string, unknown> }>;
    }>;
  }>;
  providers: Array<{ provider: string; state: EvidenceState; detail: string; receipts: number }>;
  reset: { available: boolean; environment: string; detail: string; runbookUrl: string | null; instructions: string[] };
  releaseManifest: {
    schemaVersion: number;
    product: string;
    event: { slug: string; name: string };
    generatedAt: string;
    commit: string | null;
    migration: string | null;
    deploymentId: string | null;
    sourceUrl: string | null;
    evaluationUrl: string;
  };
}
