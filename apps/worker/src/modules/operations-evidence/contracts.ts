export type EvidenceState = "missing" | "recorded" | "verified";

export interface EvaluationScenarioDefinition {
  id: string;
  area: string;
  title: string;
  persona: string;
  entryRoute: string;
  routes: string[];
  requirementIds: string[];
  persistedTransition: string;
  downstreamHandoff: string;
}

export interface RequirementEvidence {
  requirementId: string;
  state: EvidenceState;
  records: Array<{
    id: string;
    operation: string;
    artifactUrl: string | null;
    verified: boolean;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
}

export interface ScenarioEvidence extends EvaluationScenarioDefinition {
  state: EvidenceState;
  requirements: RequirementEvidence[];
}

export interface ProviderEvidenceStatus {
  provider: "email" | "files" | "workers_ai" | "airtable" | "accelevents";
  state: EvidenceState;
  detail: string;
  receipts: number;
}

export interface EvaluationEvidenceCenter {
  event: { id: string; slug: string; name: string };
  generatedAt: string;
  readiness: {
    state: EvidenceState;
    verified: number;
    recorded: number;
    missing: number;
    requiredVerified: number;
    requiredTotal: 86;
    extraCreditVerified: number;
    extraCreditTotal: 12;
    scenarioVerified: number;
    scenarioTotal: 20;
  };
  goldenThread: Array<{
    order: number;
    label: string;
    route: string;
    scenarioIds: string[];
    state: EvidenceState;
  }>;
  scenarios: ScenarioEvidence[];
  providers: ProviderEvidenceStatus[];
  reset: {
    available: boolean;
    environment: string;
    detail: string;
    runbookUrl: string | null;
    instructions: string[];
  };
  releaseManifest: ReleaseEvidenceManifest;
}

export interface ReleaseEvidenceManifest {
  schemaVersion: 1;
  product: "ProgramFlow";
  event: { slug: string; name: string };
  generatedAt: string;
  commit: string | null;
  migration: string | null;
  deploymentId: string | null;
  sourceUrl: string | null;
  evaluationUrl: string;
  rubric: EvaluationEvidenceCenter["readiness"];
  providers: ProviderEvidenceStatus[];
}
