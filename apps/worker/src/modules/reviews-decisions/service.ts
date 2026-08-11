import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import type { ReviewsRepositoryPort } from "./repository";
import {
  buildConflictAwareDistribution,
  calculateWeightedScore,
  ReviewRuleError,
  toReviewResultsCsv,
  validateReviewPlan,
} from "./rules";
import type {
  AcceptancePort,
  DecisionResult,
  ReviewAiPort,
  ReviewPlanInput,
  ReviewReminderPort,
} from "./types";

export class ReviewsDecisionsError extends Error {
  constructor(
    readonly code:
      | "forbidden"
      | "acceptance_port_required"
      | "ai_provider_required"
      | "ai_provider_failed"
      | "review_reminder_port_required",
    message: string,
  ) {
    super(message);
  }
}

export class ReviewsDecisionsService {
  constructor(
    private readonly repository: ReviewsRepositoryPort,
    private readonly acceptancePort?: AcceptancePort,
    private readonly aiPort?: ReviewAiPort,
    private readonly reviewReminderPort?: ReviewReminderPort,
  ) {}

  async listOrganizerWorkspace(actor: Actor, eventSlug: string) {
    const event = await this.organizerEvent(actor, eventSlug);
    const [plans, results, reviewers, submissions, aiAssessments] = await Promise.all([
      this.repository.listPlans(event.id),
      this.repository.listResults(event.id),
      this.repository.listEligibleReviewers(event.id),
      this.repository.listSubmittedProposals(event.id),
      this.repository.listAiAssessments(event.id),
    ]);
    return { event, plans, results, reviewers, submissions, aiAssessments };
  }

  async createReviewPlan(actor: Actor, eventSlug: string, input: ReviewPlanInput) {
    const event = await this.organizerEvent(actor, eventSlug);
    validateReviewPlan(input.rounds);
    return this.repository.createPlan(event.id, input);
  }

  async distributeAssignments(
    actor: Actor,
    eventSlug: string,
    roundId: string,
    submissionIds: ReadonlyArray<string>,
  ) {
    const event = await this.organizerEvent(actor, eventSlug);
    const context = await this.repository.getDistributionContext(event.id, roundId, submissionIds);
    const planned = buildConflictAwareDistribution({
      submissionIds: [...new Set(submissionIds)],
      reviewers: context.reviewers,
      conflictKeys: context.conflictKeys,
    });
    const created = await this.repository.createAssignments(context.round.id, planned);
    return { roundId: context.round.id, requested: planned.length, created: created.length, assignments: created };
  }

  async assignReviewer(
    actor: Actor,
    eventSlug: string,
    roundId: string,
    submissionId: string,
    reviewerPersonId: string,
  ) {
    const event = await this.organizerEvent(actor, eventSlug);
    const context = await this.repository.getDistributionContext(event.id, roundId, [submissionId]);
    const reviewer = context.reviewers.find((candidate) => candidate.personId === reviewerPersonId);
    const planned = buildConflictAwareDistribution({
      submissionIds: [submissionId],
      reviewers: reviewer ? [reviewer] : [],
      conflictKeys: context.conflictKeys,
    });
    const [assignment] = await this.repository.createAssignments(roundId, planned);
    if (!assignment) throw new ReviewRuleError("no_conflict_free_assignment", "This reviewer is already assigned or no longer eligible.");
    return assignment;
  }

  async declareConflict(
    actor: Actor,
    eventSlug: string,
    input: { submissionId: string; reviewerPersonId: string; reason: string },
  ) {
    const event = await this.eventForRole(actor, eventSlug, input.reviewerPersonId === actor.personId ? "reviewer" : "organizer");
    if (input.reviewerPersonId !== actor.personId && !actorCanAccessEvent(actor, event.id, "organizer")) {
      throw new ReviewsDecisionsError("forbidden", "Only an organizer can declare a conflict for another reviewer.");
    }
    return this.repository.declareConflict({
      eventId: event.id,
      submissionId: input.submissionId,
      reviewerPersonId: input.reviewerPersonId,
      declaredByPersonId: actor.personId,
      reason: input.reason.trim(),
    });
  }

  async listReviewerQueue(actor: Actor, eventSlug: string) {
    const event = await this.eventForRole(actor, eventSlug, "reviewer");
    return { event, assignments: await this.repository.listReviewerQueue(event.id, actor.personId) };
  }

  async saveReview(
    actor: Actor,
    eventSlug: string,
    assignmentId: string,
    input: { answers: Record<string, unknown>; notes: string; finalize: boolean },
  ) {
    const event = await this.eventForRole(actor, eventSlug, "reviewer");
    const assignment = await this.repository.getAssignment(event.id, assignmentId, actor.personId);
    if (assignment.status === "submitted") {
      throw new ReviewsDecisionsError("forbidden", "A finalized review is immutable unless an organizer reopens it.");
    }
    if (assignment.status === "recused") {
      throw new ReviewsDecisionsError("forbidden", "A recused assignment cannot be reviewed.");
    }
    const weightedScore = calculateWeightedScore(assignment.scorecard, input.answers, input.finalize);
    return this.repository.saveResponse({
      assignmentId,
      reviewerPersonId: actor.personId,
      answers: input.answers,
      notes: input.notes.trim(),
      weightedScore,
      finalize: input.finalize,
    });
  }

  async recuse(actor: Actor, eventSlug: string, assignmentId: string, reason: string) {
    const event = await this.eventForRole(actor, eventSlug, "reviewer");
    return this.repository.recuse({
      eventId: event.id,
      assignmentId,
      reviewerPersonId: actor.personId,
      reason: reason.trim(),
    });
  }

  async listResults(actor: Actor, eventSlug: string, roundId?: string) {
    const event = await this.organizerEvent(actor, eventSlug);
    if (roundId) await this.repository.getRound(event.id, roundId);
    return this.repository.listResults(event.id, roundId);
  }

  async exportResults(actor: Actor, eventSlug: string, roundId?: string) {
    return toReviewResultsCsv(await this.listResults(actor, eventSlug, roundId));
  }

  async remindOutstanding(actor: Actor, eventSlug: string, roundId: string, idempotencyKey: string) {
    const event = await this.organizerEvent(actor, eventSlug);
    const recipientPersonIds = await this.repository.listOutstandingReviewerIds(event.id, roundId);
    if (!this.reviewReminderPort) {
      throw new ReviewsDecisionsError("review_reminder_port_required", "Reviewer reminders require the parent-owned Communications coordinator.");
    }
    return this.reviewReminderPort.remindOutstanding({ eventId: event.id, roundId, recipientPersonIds, idempotencyKey });
  }

  async decide(
    actor: Actor,
    eventSlug: string,
    input: { submissionId: string; outcome: "accepted" | "rejected"; reason: string; idempotencyKey: string },
  ): Promise<DecisionResult> {
    const event = await this.organizerEvent(actor, eventSlug);
    await this.repository.assertSubmission(event.id, input.submissionId);
    if (input.outcome === "accepted") {
      if (!this.acceptancePort) {
        throw new ReviewsDecisionsError(
          "acceptance_port_required",
          "Accepted decisions require the parent-owned atomic acceptance coordinator.",
        );
      }
      const handoff = await this.acceptancePort.accept({
        eventId: event.id,
        submissionId: input.submissionId,
        decidedByPersonId: actor.personId,
        reason: input.reason.trim(),
        idempotencyKey: input.idempotencyKey,
      });
      return { outcome: "accepted", handoff };
    }
    const rejection = await this.repository.recordRejection({
      eventId: event.id,
      submissionId: input.submissionId,
      decidedByPersonId: actor.personId,
      reason: input.reason.trim(),
      idempotencyKey: input.idempotencyKey,
    });
    return { outcome: "rejected", submissionId: input.submissionId, ...rejection };
  }

  async requestAiAssessment(actor: Actor, eventSlug: string, roundId: string, submissionId: string) {
    const event = await this.organizerEvent(actor, eventSlug);
    const [round, submission] = await Promise.all([
      this.repository.getRound(event.id, roundId),
      this.repository.assertSubmission(event.id, submissionId),
    ]);
    if (!this.aiPort) {
      throw new ReviewsDecisionsError("ai_provider_required", "Workers AI is not configured; no AI assessment was claimed or persisted.");
    }
    try {
      const assessment = await this.aiPort.assess({
        submissionId,
        title: submission.title,
        abstract: submission.abstract,
        criteria: round.scorecard,
      });
      return this.repository.recordAiAssessment({ submissionId, roundId, ...assessment });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The provider returned an unknown failure.";
      await this.repository.recordAiFailure({
        submissionId,
        roundId,
        provider: this.aiPort.provider,
        model: this.aiPort.model,
        promptVersion: this.aiPort.promptVersion,
        failureCode: detail.slice(0, 200),
      });
      throw new ReviewsDecisionsError("ai_provider_failed", `Workers AI assessment failed: ${detail}`);
    }
  }

  async overrideAiAssessment(
    actor: Actor,
    eventSlug: string,
    assessmentId: string,
    input: { score: number; reason: string },
  ) {
    const event = await this.organizerEvent(actor, eventSlug);
    await this.repository.assertAiAssessment(event.id, assessmentId);
    return this.repository.overrideAiAssessment({
      assessmentId,
      actorPersonId: actor.personId,
      score: input.score,
      reason: input.reason.trim(),
    });
  }

  private async organizerEvent(actor: Actor, eventSlug: string) {
    return this.eventForRole(actor, eventSlug, "organizer");
  }

  private async eventForRole(actor: Actor, eventSlug: string, role: "organizer" | "reviewer") {
    const event = await this.repository.findEventBySlug(eventSlug);
    if (!actorCanAccessEvent(actor, event.id, role)) {
      throw new ReviewsDecisionsError("forbidden", `${role === "organizer" ? "Organizer" : "Reviewer"} access is required for this event.`);
    }
    return event;
  }
}

export function isReviewRuleError(error: unknown): error is ReviewRuleError {
  return error instanceof ReviewRuleError;
}
