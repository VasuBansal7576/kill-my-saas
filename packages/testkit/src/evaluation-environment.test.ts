import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertCleanEvaluationWorkflowState,
  assertGoldenPathSeedViability,
  buildEvaluationRunIdentity,
  cleanEvaluationWorkflowState,
  orderedDecisionContract,
  readEvaluationEnvironmentConfig,
} from "./evaluation-environment";

describe("evaluation environment guard and run isolation", () => {
  it("exposes one guarded judge-preparation command and consistent operator instructions", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const releaseRunbook = readFileSync(new URL("../../../docs/runbooks/evaluation.md", import.meta.url), "utf8");

    expect(packageJson.scripts["prepare:evaluation"]).toBe(
      "npm run reset:evaluation && npm run db:migrate && npm run seed:evaluation && npm run sync:evaluator-auth",
    );
    expect(releaseRunbook).toContain("EVALUATION_SEED_CONFIRM=\"CREATE judge-YYYY-MM-DD-N\"");
    expect(releaseRunbook).toContain("EVALUATION_RESET_CONFIRM=\"RESET judge-YYYY-MM-DD-N\"");
    expect(releaseRunbook).toContain("npm run prepare:evaluation");
    expect(releaseRunbook).not.toContain("EVALUATION_SEED_CONFIRM=\"DevFlow Conf 2027\"");
  });

  it("keeps CI on the same explicit seed contract", () => {
    const workflow = readFileSync(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8");

    expect(workflow).toContain("APP_ENV: evaluation");
    expect(workflow).toContain("EVALUATION_RUN_ID: ci-golden-path");
    expect(workflow).toContain("EVALUATION_DATABASE_SCOPE: run_scoped");
    expect(workflow).toContain("EVALUATION_SEED_CONFIRM: CREATE ci-golden-path");
    expect(workflow).toContain("EVALUATION_RESET_CONFIRM: RESET ci-golden-path");
    expect(workflow).not.toContain("EVALUATION_SEED_CONFIRM: DevFlow Conf 2027");
  });

  it("produces the same deterministic scope on repeated seed planning", () => {
    const first = buildEvaluationRunIdentity("judge-2026-08-13");
    const retry = buildEvaluationRunIdentity("judge-2026-08-13");
    expect(retry).toEqual(first);
  });

  it("rejects production and requires an operation-specific confirmation", () => {
    expect(() => readEvaluationEnvironmentConfig({
      APP_ENV: "production",
      EVALUATION_RUN_ID: "judge-run",
      EVALUATION_SEED_CONFIRM: "CREATE judge-run",
    }, "seed")).toThrow(/forbidden in production/);

    expect(() => readEvaluationEnvironmentConfig({
      APP_ENV: "evaluation",
      EVALUATION_RUN_ID: "judge-run",
      EVALUATION_SEED_CONFIRM: "DevFlow Conf 2027",
    }, "seed")).toThrow(/CREATE judge-run/);

    expect(readEvaluationEnvironmentConfig({
      APP_ENV: "evaluation",
      EVALUATION_RUN_ID: "judge-run",
      EVALUATION_RESET_CONFIRM: "RESET judge-run",
    }, "reset")).toMatchObject({ runId: "judge-run", databaseScope: "run_scoped" });
  });

  it("defines a clean ordered decision, session, and publication starting state", () => {
    expect(() => assertCleanEvaluationWorkflowState(cleanEvaluationWorkflowState)).not.toThrow();
    expect(orderedDecisionContract).toEqual([
      expect.objectContaining({ outcome: "accepted", decisionScenario: "CFP-S4", initialDecision: null, initialSession: false, initialPublicRecord: false }),
      expect.objectContaining({ outcome: "rejected", decisionScenario: "CFP-S4", initialDecision: null, initialSession: false, initialPublicRecord: false }),
    ]);
    expect(() => assertCleanEvaluationWorkflowState({
      ...cleanEvaluationWorkflowState,
      decisions: 1,
      sessions: 1,
      publications: 1,
    })).toThrow(/will not repair it/);
  });

  it("keeps run-scoped organizations and events isolated", () => {
    const first = buildEvaluationRunIdentity("judge-run-a");
    const second = buildEvaluationRunIdentity("judge-run-b");
    expect(first.organizationId).not.toBe(second.organizationId);
    expect(first.organizationSlug).not.toBe(second.organizationSlug);
    expect(first.eventId).not.toBe(second.eventId);
    expect(first.eventSlug).not.toBe(second.eventSlug);
  });

  it("uses canonical judge-facing slugs only inside an isolated database", () => {
    const isolated = buildEvaluationRunIdentity("judge-final", "evaluation", "disposable_neon_branch");
    const shared = buildEvaluationRunIdentity("judge-final", "evaluation", "run_scoped");
    expect(isolated).toMatchObject({
      organizationSlug: "programflow-evaluation",
      eventSlug: "devflow-conf-2027",
    });
    expect(shared.eventSlug).toBe("devflow-conf-2027-judge-final");
  });

  it("accepts the minimum clean state needed for the serial golden path", () => {
    expect(() => assertGoldenPathSeedViability({
      eventCount: 1,
      trackCount: 3,
      formatCount: 5,
      roomCount: 4,
      personaEventRoles: {
        organizer: ["organizer"],
        speaker: ["speaker"],
        speaker2: ["speaker"],
        reviewer: ["reviewer"],
      },
      workflowState: cleanEvaluationWorkflowState,
    })).not.toThrow();
  });
});
