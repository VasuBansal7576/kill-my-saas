import { describe, expect, it } from "vitest";
import type { Actor } from "../identity-access/actor";
import { evaluationScenarios } from "./scenarios";
import { buildEvaluationEvidenceCenter, canViewEvaluationEvidence } from "./service";

const event = { id: "event-devflow", organizationId: "organization-programflow", slug: "devflow-conf-2027", name: "DevFlow Conf 2027" };
const runtime = {
  appEnvironment: "evaluation" as const,
  commit: "abc123",
  migration: "0009",
  deploymentId: "deployment-42",
  sourceUrl: "https://github.com/example/programflow",
  evaluationUrl: "https://evaluation.example.com",
  resetRunbookUrl: "https://private.example.com/runbook",
};
const emptyProviders = { email: [], files: [], ai: [], airtable: [], accelevents: [] };

describe("evaluation evidence truthfulness", () => {
  it("maps exactly 20 scenarios and all 96 unique V1 rubric items", () => {
    const ids = evaluationScenarios.flatMap((scenario) => scenario.requirementIds);
    expect(evaluationScenarios).toHaveLength(20);
    expect(new Set(ids).size).toBe(96);
    expect(ids.filter((id) => !id.startsWith("CRM-"))).toHaveLength(84);
    expect(ids.filter((id) => id.startsWith("CRM-"))).toHaveLength(12);
  });

  it("never promotes implementation or an unverified record into verified readiness", () => {
    const center = buildEvaluationEvidenceCenter({
      event,
      generatedAt: "2026-08-13T12:00:00.000Z",
      runtime,
      providers: { ...emptyProviders, email: [{ status: "queued", providerMessageId: null }] },
      evidence: [{
        id: "evidence-one",
        requirementId: "CFP-01",
        operation: "cfp-form-published",
        artifactUrl: null,
        metadata: {},
        verified: false,
        createdAt: "2026-08-13T11:00:00.000Z",
      }],
    });

    expect(center.readiness).toMatchObject({ state: "missing", verified: 0, recorded: 1, missing: 95, requiredVerified: 0 });
    expect(center.scenarios.find((scenario) => scenario.id === "CFP-S1")?.requirements[0]?.state).toBe("recorded");
    expect(center.providers.find((provider) => provider.provider === "email")?.state).toBe("recorded");
  });

  it("requires explicit verified evidence for every item before claiming full readiness", () => {
    const ids = evaluationScenarios.flatMap((scenario) => scenario.requirementIds);
    const center = buildEvaluationEvidenceCenter({
      event,
      generatedAt: "2026-08-13T12:00:00.000Z",
      runtime,
      providers: emptyProviders,
      evidence: ids.map((requirementId, index) => ({
        id: `evidence-${index}`,
        requirementId,
        operation: "verified-evaluation-step",
        artifactUrl: `https://evidence.example.com/${requirementId}`,
        metadata: {},
        verified: true,
        createdAt: "2026-08-13T11:00:00.000Z",
      })),
    });

    expect(center.readiness).toMatchObject({ state: "verified", requiredVerified: 84, extraCreditVerified: 12, scenarioVerified: 20, missing: 0 });
    expect(center.goldenThread.every((step) => step.state === "verified")).toBe(true);
  });

  it("withholds reset instructions and links outside evaluation or preview", () => {
    const center = buildEvaluationEvidenceCenter({
      event,
      generatedAt: "2026-08-13T12:00:00.000Z",
      runtime: { ...runtime, appEnvironment: "production" },
      providers: emptyProviders,
      evidence: [],
    });
    expect(center.reset).toMatchObject({ available: false, runbookUrl: null, instructions: [] });
  });
});

describe("evaluation evidence authorization", () => {
  const actor = (role: "organizer" | "speaker" | "reviewer", eventId = event.id): Actor => ({
    identityId: `identity-${role}`,
    personId: `person-${role}`,
    organizationRoles: [],
    eventRoles: [{ eventId, role }],
  });

  it("allows only an organizer grant for the same event", () => {
    expect(canViewEvaluationEvidence(actor("organizer"), event.id)).toBe(true);
    expect(canViewEvaluationEvidence(actor("speaker"), event.id)).toBe(false);
    expect(canViewEvaluationEvidence(actor("reviewer"), event.id)).toBe(false);
    expect(canViewEvaluationEvidence(actor("organizer", "another-event"), event.id)).toBe(false);
  });
});
