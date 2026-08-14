import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../identity-access/actor";
import type { ReviewsRepositoryPort } from "./repository";
import { ReviewsDecisionsError, ReviewsDecisionsService } from "./service";
import type { DecisionCoordinatorPort, ReviewCriterion } from "./types";

const event = { id: "00000000-0000-4000-8000-000000000001", slug: "devflow", name: "DevFlow" };
const submissionId = "00000000-0000-4000-8000-000000000002";
const assignmentId = "00000000-0000-4000-8000-000000000003";
const organizer = actor("organizer", "00000000-0000-4000-8000-000000000010");
const reviewer = actor("reviewer", "00000000-0000-4000-8000-000000000011");
const scorecard: ReviewCriterion[] = [{ key: "score", label: "Score", type: "numeric", required: true, weight: 100, min: 1, max: 5 }];

describe("authoritative decision boundary", () => {
  it("delegates every final outcome to the injected atomic Decision coordinator", async () => {
    const repository = makeRepository();
    const decide = vi.fn<DecisionCoordinatorPort["decide"]>().mockResolvedValue({
      decisionId: "00000000-0000-4000-8000-000000000020",
      submissionId,
      sessionId: "00000000-0000-4000-8000-000000000021",
      eventSpeakerIds: ["00000000-0000-4000-8000-000000000022"],
      outboxEventId: "00000000-0000-4000-8000-000000000023",
    });
    const service = new ReviewsDecisionsService(repository, { decide });

    const result = await service.decide(organizer, event.slug, {
      submissionId,
      outcome: "accepted",
      reason: "Strong fit for the program",
      idempotencyKey: "decision-command-0001",
    });

    expect(result.outcome).toBe("accepted");
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ submissionId, eventId: event.id, outcome: "accepted" }));
  });

  it("refuses acceptance when the parent-owned coordinator is not wired", async () => {
    const service = new ReviewsDecisionsService(makeRepository());
    await expect(service.decide(organizer, event.slug, {
      submissionId,
      outcome: "accepted",
      reason: "Accept",
      idempotencyKey: "decision-command-0002",
    })).rejects.toMatchObject({ code: "acceptance_port_required" } satisfies Partial<ReviewsDecisionsError>);
  });

  it("uses the same coordinator for rejection so staging and audit behavior cannot diverge", async () => {
    const decide = vi.fn<DecisionCoordinatorPort["decide"]>().mockResolvedValue({
      decisionId: "decision-r",
      submissionId,
      sessionId: null,
      eventSpeakerIds: [],
      outboxEventId: "outbox-r",
    });
    const service = new ReviewsDecisionsService(makeRepository(), { decide });
    const result = await service.decide(organizer, event.slug, {
      submissionId,
      outcome: "rejected",
      reason: "Outside this year's scope",
      idempotencyKey: "decision-command-0003",
    });
    expect(result).toMatchObject({ outcome: "rejected", handoff: { decisionId: "decision-r", sessionId: null } });
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ outcome: "rejected", decidedByPersonId: organizer.personId }));
  });
});

describe("reviewer isolation and finalization", () => {
  it("loads only the current reviewer's explicit queue", async () => {
    const listReviewerQueue = vi.fn().mockResolvedValue([]);
    const service = new ReviewsDecisionsService(makeRepository({ listReviewerQueue }));
    await service.listReviewerQueue(reviewer, event.slug);
    expect(listReviewerQueue).toHaveBeenCalledWith(event.id, reviewer.personId);
  });

  it("persists an incomplete draft, then validates the scorecard on finalization", async () => {
    const saveResponse = vi.fn().mockResolvedValue({ revision: 1, submittedAt: null });
    const service = new ReviewsDecisionsService(makeRepository({
      getAssignment: vi.fn().mockResolvedValue({ id: assignmentId, status: "assigned", submissionId, scorecard }),
      saveResponse,
    }));
    await service.saveReview(reviewer, event.slug, assignmentId, { answers: {}, notes: "Starting", finalize: false });
    expect(saveResponse).toHaveBeenCalledWith(expect.objectContaining({ reviewerPersonId: reviewer.personId, finalize: false }));
    await expect(service.saveReview(reviewer, event.slug, assignmentId, { answers: {}, notes: "", finalize: true }))
      .rejects.toMatchObject({ code: "incomplete_scorecard" });
  });

  it("denies an organizer-only workspace to a reviewer even when the event matches", async () => {
    const service = new ReviewsDecisionsService(makeRepository());
    await expect(service.listOrganizerWorkspace(reviewer, event.slug)).rejects.toMatchObject({ code: "forbidden" });
  });
});

it("records a visible failed AI attempt instead of returning fabricated advice", async () => {
  const recordAiFailure = vi.fn().mockResolvedValue({ id: "assessment-failed" });
  const service = new ReviewsDecisionsService(
    makeRepository({ recordAiFailure }),
    undefined,
    {
      provider: "cloudflare_workers_ai",
      model: "provider-model",
      promptVersion: "prompt-v1",
      async assess() { throw new Error("provider unavailable"); },
    },
  );
  await expect(service.requestAiAssessment(organizer, event.slug, "round", submissionId))
    .rejects.toMatchObject({ code: "ai_provider_failed" });
  expect(recordAiFailure).toHaveBeenCalledWith(expect.objectContaining({ failureCode: "provider unavailable" }));
});

function actor(role: "organizer" | "reviewer", personId: string): Actor {
  return {
    identityId: `identity-${personId}`,
    personId,
    organizationRoles: [],
    eventRoles: [{ eventId: event.id, role }],
  };
}

function makeRepository(overrides: Partial<ReviewsRepositoryPort> = {}): ReviewsRepositoryPort {
  const repository: ReviewsRepositoryPort = {
    findEventBySlug: vi.fn().mockResolvedValue(event),
    assertSubmission: vi.fn().mockResolvedValue({ id: submissionId, title: "Proposal", abstract: "Abstract" }),
    createPlan: vi.fn(),
    listPlans: vi.fn().mockResolvedValue([]),
    listEligibleReviewers: vi.fn().mockResolvedValue([]),
    listSubmittedProposals: vi.fn().mockResolvedValue([]),
    listAiAssessments: vi.fn().mockResolvedValue([]),
    getRound: vi.fn().mockResolvedValue({ id: "round", eventId: event.id, scorecard }),
    listOutstandingReviewerIds: vi.fn().mockResolvedValue([]),
    getDistributionContext: vi.fn(),
    createAssignments: vi.fn().mockResolvedValue([]),
    declareConflict: vi.fn(),
    listReviewerQueue: vi.fn().mockResolvedValue([]),
    getAssignment: vi.fn().mockResolvedValue({ id: assignmentId, status: "assigned", submissionId, scorecard }),
    saveResponse: vi.fn(),
    recuse: vi.fn(),
    listResults: vi.fn().mockResolvedValue([]),
    recordAiAssessment: vi.fn(),
    recordAiFailure: vi.fn(),
    assertAiAssessment: vi.fn(),
    overrideAiAssessment: vi.fn(),
    ...overrides,
  };
  return repository;
}
