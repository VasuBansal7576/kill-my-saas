import { createHash } from "node:crypto";

export const evaluationWorkflowTables = [
  "cfpForms",
  "submissions",
  "decisions",
  "sessions",
  "reviewPlans",
  "reviewAssignments",
  "eventSpeakers",
  "speakerTasks",
  "scheduleRevisions",
  "placements",
  "publications",
  "widgetConfigurations",
] as const;

export type EvaluationWorkflowTable = typeof evaluationWorkflowTables[number];
export type EvaluationOperation = "seed" | "reset" | "sync-auth";
export type EvaluationDatabaseScope = "run_scoped" | "disposable_neon_branch";

export interface EvaluationEnvironmentConfig {
  appEnvironment: "local" | "preview" | "evaluation";
  databaseScope: EvaluationDatabaseScope;
  runId: string;
  organizationId: string;
  organizationSlug: string;
  eventId: string;
  eventSlug: string;
}

export type EvaluationWorkflowState = Record<EvaluationWorkflowTable, number>;

export const cleanEvaluationWorkflowState: EvaluationWorkflowState = Object.fromEntries(
  evaluationWorkflowTables.map((table) => [table, 0]),
) as EvaluationWorkflowState;

export const orderedDecisionContract = [
  {
    title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
    decisionScenario: "CFP-S4",
    outcome: "accepted",
    initialDecision: null,
    initialSession: false,
    initialPublicRecord: false,
  },
  {
    title: "Your AI Pair Programmer Is Lying to You: Verification Patterns That Scale",
    decisionScenario: "CFP-S4",
    outcome: "rejected",
    initialDecision: null,
    initialSession: false,
    initialPublicRecord: false,
  },
] as const;

export function readEvaluationEnvironmentConfig(
  environment: Readonly<Record<string, string | undefined>>,
  operation: EvaluationOperation,
): EvaluationEnvironmentConfig {
  const appEnvironment = environment.APP_ENV?.trim().toLowerCase();
  if (appEnvironment === "production") {
    throw new Error("Evaluation setup and reset are forbidden in production.");
  }
  if (!appEnvironment || !["local", "preview", "evaluation"].includes(appEnvironment)) {
    throw new Error("Evaluation tooling is allowed only in local, preview, or evaluation environments.");
  }

  const runId = normalizeRunId(environment.EVALUATION_RUN_ID ?? "");
  const databaseScope = environment.EVALUATION_DATABASE_SCOPE?.trim() || "run_scoped";
  if (databaseScope !== "run_scoped" && databaseScope !== "disposable_neon_branch") {
    throw new Error("EVALUATION_DATABASE_SCOPE must be run_scoped or disposable_neon_branch.");
  }

  const confirmationName = operation === "reset" ? "EVALUATION_RESET_CONFIRM" : "EVALUATION_SEED_CONFIRM";
  const confirmationPrefix = operation === "reset" ? "RESET" : "CREATE";
  const expectedConfirmation = `${confirmationPrefix} ${runId}`;
  if (environment[confirmationName] !== expectedConfirmation) {
    throw new Error(`Set ${confirmationName}=${JSON.stringify(expectedConfirmation)} to continue intentionally.`);
  }

  return buildEvaluationRunIdentity(runId, appEnvironment as EvaluationEnvironmentConfig["appEnvironment"], databaseScope);
}

export function buildEvaluationRunIdentity(
  runId: string,
  appEnvironment: EvaluationEnvironmentConfig["appEnvironment"] = "evaluation",
  databaseScope: EvaluationDatabaseScope = "run_scoped",
): EvaluationEnvironmentConfig {
  const normalizedRunId = normalizeRunId(runId);
  return {
    appEnvironment,
    databaseScope,
    runId: normalizedRunId,
    organizationId: deterministicEvaluationUuid(`run:${normalizedRunId}:organization`),
    organizationSlug: `programflow-eval-${normalizedRunId}`,
    eventId: deterministicEvaluationUuid(`run:${normalizedRunId}:event:devflow-conf-2027`),
    eventSlug: `devflow-conf-2027-${normalizedRunId}`,
  };
}

export function normalizeRunId(runId: string): string {
  const normalized = runId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(normalized)) {
    throw new Error("EVALUATION_RUN_ID must be 3-48 lowercase letters, digits, or hyphens and start with a letter or digit.");
  }
  return normalized;
}

export function assertCleanEvaluationWorkflowState(state: EvaluationWorkflowState): void {
  const polluted = evaluationWorkflowTables
    .filter((table) => state[table] !== 0)
    .map((table) => `${table}=${state[table]}`);
  if (polluted.length > 0) {
    throw new Error(
      `Evaluation run is not at the ordered starting state (${polluted.join(", ")}). `
      + "The seed will not repair it; use the explicitly confirmed reset command or choose a fresh run ID/Neon branch.",
    );
  }
}

export function assertGoldenPathSeedViability(input: {
  eventCount: number;
  trackCount: number;
  formatCount: number;
  roomCount: number;
  personaEventRoles: Readonly<Record<string, readonly string[]>>;
  workflowState: EvaluationWorkflowState;
}): void {
  assertCleanEvaluationWorkflowState(input.workflowState);
  if (input.eventCount !== 1 || input.trackCount !== 3 || input.formatCount !== 5 || input.roomCount !== 4) {
    throw new Error("Evaluation seed catalogs do not match the DevFlow ordered starting state.");
  }
  const requiredRoles: Readonly<Record<string, string>> = {
    organizer: "organizer",
    speaker: "speaker",
    speaker2: "speaker",
    reviewer: "reviewer",
  };
  for (const [persona, role] of Object.entries(requiredRoles)) {
    if (!input.personaEventRoles[persona]?.includes(role)) {
      throw new Error(`Evaluation persona ${persona} is missing the ${role} event membership.`);
    }
  }
}

export function deterministicEvaluationUuid(key: string): string {
  const hex = createHash("sha256").update(`programflow:evaluation:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
