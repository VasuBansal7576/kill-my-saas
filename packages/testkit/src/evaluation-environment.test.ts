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
