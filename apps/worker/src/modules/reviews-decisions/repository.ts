import {
  decisions,
  decisionAuditEvents,
  eventMemberships,
  events,
  outboxEvents,
  people,
  reviewAiAssessments,
  reviewAssignments,
  reviewConflicts,
  reviewPlans,
  reviewResponses,
  reviewRoundReviewers,
  reviewRounds,
  submissionParticipants,
  submissions,
  submissionVersions,
  type Database,
} from "@programflow/database";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type {
  ReviewPlanInput,
  ReviewPlanView,
  ReviewQueueItem,
  ReviewResultRow,
} from "./types";
import { assertSubmissionRouting } from "./rules";

export class ReviewsRepositoryError extends Error {
  constructor(
    readonly code:
      | "event_not_found"
      | "round_not_found"
      | "submission_not_found"
      | "assignment_not_found"
      | "review_already_finalized"
      | "review_recused"
      | "decision_requires_acceptance_port",
    message: string,
  ) {
    super(message);
  }
}

export class ReviewsDecisionsRepository {
  constructor(private readonly database: Database) {}

  async findEventBySlug(eventSlug: string): Promise<{ id: string; slug: string; name: string; timezone: string }> {
    const [event] = await this.database.select({ id: events.id, slug: events.slug, name: events.name, timezone: events.timezone })
      .from(events)
      .where(eq(events.slug, eventSlug))
      .limit(1);
    if (!event) throw new ReviewsRepositoryError("event_not_found", "Event not found.");
    return event;
  }

  async assertSubmission(eventId: string, submissionId: string): Promise<{ id: string; title: string; abstract: string }> {
    const [row] = await this.database.select({
      id: submissions.id,
      state: submissions.state,
      title: submissionVersions.title,
      answers: submissionVersions.answers,
    }).from(submissions)
      .innerJoin(submissionVersions, and(
        eq(submissionVersions.submissionId, submissions.id),
        eq(submissionVersions.version, submissions.currentVersion),
      ))
      .where(and(eq(submissions.id, submissionId), eq(submissions.eventId, eventId)))
      .limit(1);
    if (!row || row.state !== "submitted") throw new ReviewsRepositoryError("submission_not_found", "Submitted proposal not found in this event.");
    return { id: row.id, title: row.title, abstract: stringAnswer(row.answers.abstract) };
  }

  async createPlan(eventId: string, input: ReviewPlanInput): Promise<ReviewPlanView> {
    const reviewerIds = [...new Set(input.rounds.flatMap((round) => round.reviewers.map((reviewer) => reviewer.personId)))];
    if (reviewerIds.length > 0) {
      const memberships = await this.database.select({ personId: eventMemberships.personId }).from(eventMemberships).where(and(
        eq(eventMemberships.eventId, eventId),
        eq(eventMemberships.role, "reviewer"),
        inArray(eventMemberships.personId, reviewerIds),
      ));
      if (memberships.length !== reviewerIds.length) {
        throw new ReviewsRepositoryError("assignment_not_found", "Every round reviewer must have reviewer membership for this event.");
      }
    }
    const planId = await this.database.transaction(async (transaction) => {
      const [plan] = await transaction.insert(reviewPlans).values({ eventId, name: input.name.trim() }).returning({ id: reviewPlans.id });
      if (!plan) throw new Error("The review plan insert did not return a record.");
      for (const roundInput of input.rounds) {
        const [round] = await transaction.insert(reviewRounds).values({
          planId: plan.id,
          eventId,
          name: roundInput.name.trim(),
          opensAt: new Date(roundInput.opensAt),
          closesAt: new Date(roundInput.closesAt),
          blindPolicy: roundInput.blindPolicy,
          routingKeys: [...new Set(roundInput.routingKeys.map((key) => key.trim()))],
          scorecard: [...roundInput.scorecard],
        }).returning({ id: reviewRounds.id });
        if (!round) throw new Error("The review round insert did not return a record.");
        if (roundInput.reviewers.length > 0) {
          await transaction.insert(reviewRoundReviewers).values(roundInput.reviewers.map((reviewer) => ({
            roundId: round.id,
            reviewerPersonId: reviewer.personId,
            assignmentCap: reviewer.assignmentCap,
          })));
        }
      }
      return plan.id;
    });
    const plans = await this.listPlans(eventId);
    const plan = plans.find((candidate) => candidate.id === planId);
    if (!plan) throw new Error("The persisted review plan could not be reloaded.");
    return plan;
  }

  async listPlans(eventId: string): Promise<Array<ReviewPlanView>> {
    const [planRows, roundRows] = await Promise.all([
      this.database.select().from(reviewPlans).where(eq(reviewPlans.eventId, eventId)).orderBy(asc(reviewPlans.createdAt)),
      this.database.select().from(reviewRounds).where(eq(reviewRounds.eventId, eventId)).orderBy(asc(reviewRounds.opensAt)),
    ]);
    const roundIds = roundRows.map((round) => round.id);
    const [reviewerRows, assignmentRows] = await Promise.all([
      roundIds.length === 0 ? [] : this.database.select({
        roundId: reviewRoundReviewers.roundId,
        personId: reviewRoundReviewers.reviewerPersonId,
        assignmentCap: reviewRoundReviewers.assignmentCap,
        name: people.displayName,
      }).from(reviewRoundReviewers)
        .innerJoin(people, eq(people.id, reviewRoundReviewers.reviewerPersonId))
        .where(inArray(reviewRoundReviewers.roundId, roundIds)),
      roundIds.length === 0 ? [] : this.database.select({ roundId: reviewAssignments.roundId, reviewerPersonId: reviewAssignments.reviewerPersonId, status: reviewAssignments.status })
        .from(reviewAssignments)
        .where(inArray(reviewAssignments.roundId, roundIds)),
    ]);
    return planRows.map((plan) => ({
      id: plan.id,
      eventId: plan.eventId,
      name: plan.name,
      rounds: roundRows.filter((round) => round.planId === plan.id).map((round) => {
        const assigned = assignmentRows.filter((assignment) => assignment.roundId === round.id);
        const submitted = assigned.filter((assignment) => assignment.status === "submitted").length;
        const recused = assigned.filter((assignment) => assignment.status === "recused").length;
        const completable = assigned.length - recused;
        return {
          id: round.id,
          name: round.name,
          status: round.status,
          opensAt: round.opensAt.toISOString(),
          closesAt: round.closesAt.toISOString(),
          blindPolicy: round.blindPolicy,
          routingKeys: round.routingKeys,
          scorecard: round.scorecard,
          reviewers: reviewerRows.filter((reviewer) => reviewer.roundId === round.id).map((reviewer) => ({
            personId: reviewer.personId,
            name: reviewer.name,
            assignmentCap: reviewer.assignmentCap,
            ...reviewerProgress(assigned.filter((assignment) => assignment.reviewerPersonId === reviewer.personId)),
          })),
          progress: {
            assigned: assigned.length,
            submitted,
            recused,
            percentComplete: completable === 0 ? 0 : Math.round((submitted / completable) * 100),
          },
        };
      }),
    }));
  }

  async listEligibleReviewers(eventId: string): Promise<Array<{ personId: string; name: string }>> {
    return this.database.select({ personId: people.id, name: people.displayName }).from(eventMemberships)
      .innerJoin(people, eq(people.id, eventMemberships.personId))
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.role, "reviewer")))
      .orderBy(asc(people.displayName));
  }

  async listSubmittedProposals(eventId: string): Promise<Array<{ submissionId: string; title: string; track: string | null; routingKey: string | null }>> {
    const rows = await this.database.select({
      submissionId: submissions.id,
      title: submissionVersions.title,
      answers: submissionVersions.answers,
      routingKey: submissions.routingKey,
    }).from(submissions)
      .innerJoin(submissionVersions, and(
        eq(submissionVersions.submissionId, submissions.id),
        eq(submissionVersions.version, submissions.currentVersion),
      ))
      .where(and(eq(submissions.eventId, eventId), eq(submissions.state, "submitted")))
      .orderBy(asc(submissionVersions.title));
    return rows.map((row) => ({ submissionId: row.submissionId, title: row.title, track: optionalStringAnswer(row.answers.track), routingKey: row.routingKey }));
  }

  async listAiAssessments(eventId: string) {
    const rows = await this.database.select({
      id: reviewAiAssessments.id,
      submissionId: reviewAiAssessments.submissionId,
      roundId: reviewAiAssessments.roundId,
      status: reviewAiAssessments.status,
      provider: reviewAiAssessments.provider,
      model: reviewAiAssessments.model,
      score: reviewAiAssessments.score,
      reasoning: reviewAiAssessments.reasoning,
      failureCode: reviewAiAssessments.failureCode,
      humanOverrideScore: reviewAiAssessments.humanOverrideScore,
      humanOverrideReason: reviewAiAssessments.humanOverrideReason,
      overriddenAt: reviewAiAssessments.overriddenAt,
      createdAt: reviewAiAssessments.createdAt,
    }).from(reviewAiAssessments)
      .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAiAssessments.roundId))
      .where(eq(reviewRounds.eventId, eventId))
      .orderBy(desc(reviewAiAssessments.createdAt));
    return rows.map((row) => ({
      ...row,
      score: row.score === null ? null : row.score / 100,
      humanOverrideScore: row.humanOverrideScore === null ? null : row.humanOverrideScore / 100,
      overriddenAt: row.overriddenAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getRound(eventId: string, roundId: string) {
    const [round] = await this.database.select().from(reviewRounds)
      .where(and(eq(reviewRounds.id, roundId), eq(reviewRounds.eventId, eventId)))
      .limit(1);
    if (!round) throw new ReviewsRepositoryError("round_not_found", "Review round not found in this event.");
    return round;
  }

  async listOutstandingReviewerIds(eventId: string, roundId: string): Promise<Array<string>> {
    await this.getRound(eventId, roundId);
    const rows = await this.database.select({ reviewerPersonId: reviewAssignments.reviewerPersonId }).from(reviewAssignments)
      .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAssignments.roundId))
      .where(and(
        eq(reviewRounds.eventId, eventId),
        eq(reviewAssignments.roundId, roundId),
        inArray(reviewAssignments.status, ["assigned", "in_progress"]),
      ));
    return [...new Set(rows.map((row) => row.reviewerPersonId))];
  }

  async getDistributionContext(eventId: string, roundId: string, submissionIds: ReadonlyArray<string>) {
    const round = await this.getRound(eventId, roundId);
    if (submissionIds.length === 0) return { round, reviewers: [], conflictKeys: new Set<string>() };
    const submissionRows = await this.database.select({ id: submissions.id, routingKey: submissions.routingKey }).from(submissions)
      .where(and(eq(submissions.eventId, eventId), inArray(submissions.id, [...submissionIds])));
    if (submissionRows.length !== new Set(submissionIds).size) {
      throw new ReviewsRepositoryError("submission_not_found", "At least one submission is not part of this event.");
    }
    assertSubmissionRouting(round.routingKeys, submissionRows);
    const [poolRows, assignmentRows, conflictRows] = await Promise.all([
      this.database.select().from(reviewRoundReviewers).where(eq(reviewRoundReviewers.roundId, roundId)),
      this.database.select({ submissionId: reviewAssignments.submissionId, reviewerPersonId: reviewAssignments.reviewerPersonId }).from(reviewAssignments)
        .where(eq(reviewAssignments.roundId, roundId)),
      this.database.select({ submissionId: reviewConflicts.submissionId, reviewerPersonId: reviewConflicts.reviewerPersonId })
        .from(reviewConflicts)
        .where(and(eq(reviewConflicts.eventId, eventId), isNull(reviewConflicts.resolvedAt))),
    ]);
    return {
      round,
      reviewers: poolRows.map((reviewer) => ({
        personId: reviewer.reviewerPersonId,
        assignmentCap: reviewer.assignmentCap,
        existingAssignments: assignmentRows.filter((assignment) => assignment.reviewerPersonId === reviewer.reviewerPersonId).length,
      })),
      conflictKeys: new Set([
        ...conflictRows.map((conflict) => `${conflict.submissionId}:${conflict.reviewerPersonId}`),
        ...assignmentRows.map((assignment) => `${assignment.submissionId}:${assignment.reviewerPersonId}`),
      ]),
    };
  }

  async createAssignments(roundId: string, assignments: ReadonlyArray<{ submissionId: string; reviewerPersonId: string }>) {
    if (assignments.length === 0) return [];
    return this.database.insert(reviewAssignments).values(assignments.map((assignment) => ({ ...assignment, roundId })))
      .onConflictDoNothing()
      .returning({ id: reviewAssignments.id, submissionId: reviewAssignments.submissionId, reviewerPersonId: reviewAssignments.reviewerPersonId });
  }

  async declareConflict(input: {
    eventId: string;
    submissionId: string;
    reviewerPersonId: string;
    declaredByPersonId: string;
    reason: string;
  }): Promise<{ id: string }> {
    await this.assertSubmission(input.eventId, input.submissionId);
    const [created] = await this.database.insert(reviewConflicts).values(input).onConflictDoNothing().returning({ id: reviewConflicts.id });
    if (created) return created;
    const [existing] = await this.database.select({ id: reviewConflicts.id }).from(reviewConflicts).where(and(
      eq(reviewConflicts.submissionId, input.submissionId),
      eq(reviewConflicts.reviewerPersonId, input.reviewerPersonId),
      isNull(reviewConflicts.resolvedAt),
    )).limit(1);
    if (!existing) throw new Error("The conflict declaration could not be persisted.");
    return existing;
  }

  async listReviewerQueue(eventId: string, reviewerPersonId: string): Promise<Array<ReviewQueueItem>> {
    const rows = await this.database.select({
      assignmentId: reviewAssignments.id,
      roundId: reviewRounds.id,
      roundName: reviewRounds.name,
      blindPolicy: reviewRounds.blindPolicy,
      scorecard: reviewRounds.scorecard,
      submissionId: submissions.id,
      title: submissionVersions.title,
      answers: submissionVersions.answers,
      status: reviewAssignments.status,
      responseAnswers: reviewResponses.answers,
      notes: reviewResponses.notes,
      weightedScore: reviewResponses.weightedScore,
      revision: reviewResponses.revision,
      submittedAt: reviewResponses.submittedAt,
    }).from(reviewAssignments)
      .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAssignments.roundId))
      .innerJoin(submissions, eq(submissions.id, reviewAssignments.submissionId))
      .innerJoin(submissionVersions, and(
        eq(submissionVersions.submissionId, submissions.id),
        eq(submissionVersions.version, submissions.currentVersion),
      ))
      .leftJoin(reviewResponses, eq(reviewResponses.assignmentId, reviewAssignments.id))
      .where(and(eq(reviewRounds.eventId, eventId), eq(reviewAssignments.reviewerPersonId, reviewerPersonId)))
      .orderBy(asc(reviewRounds.closesAt), asc(submissionVersions.title));
    const visibleSubmissionIds = rows.filter((row) => row.blindPolicy === "none").map((row) => row.submissionId);
    const participantRows = visibleSubmissionIds.length === 0 ? [] : await this.database.select({
      submissionId: submissionParticipants.submissionId,
      name: submissionParticipants.name,
      role: submissionParticipants.role,
      sortOrder: submissionParticipants.sortOrder,
    }).from(submissionParticipants)
      .where(inArray(submissionParticipants.submissionId, visibleSubmissionIds))
      .orderBy(asc(submissionParticipants.sortOrder));
    return rows.map((row) => ({
      assignmentId: row.assignmentId,
      roundId: row.roundId,
      roundName: row.roundName,
      submissionId: row.submissionId,
      title: row.title,
      abstract: stringAnswer(row.answers.abstract),
      track: optionalStringAnswer(row.answers.track),
      status: row.status,
      blind: row.blindPolicy !== "none",
      participants: row.blindPolicy === "none"
        ? participantRows.filter((participant) => participant.submissionId === row.submissionId).map(({ name, role }) => ({ name, role }))
        : null,
      scorecard: row.scorecard,
      ownResponse: row.responseAnswers === null ? null : {
        answers: row.responseAnswers,
        notes: row.notes ?? "",
        weightedScore: row.weightedScore === null ? null : row.weightedScore / 100,
        revision: row.revision ?? 1,
        submittedAt: row.submittedAt?.toISOString() ?? null,
      },
    }));
  }

  async getAssignment(eventId: string, assignmentId: string, reviewerPersonId: string) {
    const [row] = await this.database.select({
      id: reviewAssignments.id,
      status: reviewAssignments.status,
      submissionId: reviewAssignments.submissionId,
      scorecard: reviewRounds.scorecard,
    }).from(reviewAssignments)
      .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAssignments.roundId))
      .where(and(
        eq(reviewAssignments.id, assignmentId),
        eq(reviewAssignments.reviewerPersonId, reviewerPersonId),
        eq(reviewRounds.eventId, eventId),
      ))
      .limit(1);
    if (!row) throw new ReviewsRepositoryError("assignment_not_found", "This review assignment is not in the reviewer's queue.");
    return row;
  }

  async saveResponse(input: {
    assignmentId: string;
    reviewerPersonId: string;
    answers: Record<string, unknown>;
    notes: string;
    weightedScore: number | null;
    finalize: boolean;
  }): Promise<{ revision: number; submittedAt: string | null }> {
    return this.database.transaction(async (transaction) => {
      const [assignment] = await transaction.select({ id: reviewAssignments.id, status: reviewAssignments.status })
        .from(reviewAssignments)
        .where(and(eq(reviewAssignments.id, input.assignmentId), eq(reviewAssignments.reviewerPersonId, input.reviewerPersonId)))
        .limit(1);
      if (!assignment) throw new ReviewsRepositoryError("assignment_not_found", "This review assignment is not in the reviewer's queue.");
      if (assignment.status === "submitted") throw new ReviewsRepositoryError("review_already_finalized", "A finalized review is immutable unless an organizer reopens it.");
      if (assignment.status === "recused") throw new ReviewsRepositoryError("review_recused", "A recused assignment cannot be reviewed.");
      const [existing] = await transaction.select({ id: reviewResponses.id, revision: reviewResponses.revision })
        .from(reviewResponses)
        .where(eq(reviewResponses.assignmentId, assignment.id))
        .limit(1);
      const now = new Date();
      const submittedAt = input.finalize ? now : null;
      const weightedScore = input.weightedScore === null ? null : Math.round(input.weightedScore * 100);
      let revision = 1;
      if (existing) {
        revision = existing.revision + 1;
        await transaction.update(reviewResponses).set({
          answers: input.answers,
          notes: input.notes,
          weightedScore,
          revision,
          submittedAt,
          updatedAt: now,
        }).where(eq(reviewResponses.id, existing.id));
      } else {
        await transaction.insert(reviewResponses).values({
          assignmentId: assignment.id,
          answers: input.answers,
          notes: input.notes,
          weightedScore,
          revision,
          submittedAt,
        });
      }
      await transaction.update(reviewAssignments).set({
        status: input.finalize ? "submitted" : "in_progress",
        updatedAt: now,
      }).where(eq(reviewAssignments.id, assignment.id));
      return { revision, submittedAt: submittedAt?.toISOString() ?? null };
    });
  }

  async recuse(input: { eventId: string; assignmentId: string; reviewerPersonId: string; reason: string }) {
    return this.database.transaction(async (transaction) => {
      const [assignment] = await transaction.select({
        id: reviewAssignments.id,
        status: reviewAssignments.status,
        submissionId: reviewAssignments.submissionId,
      }).from(reviewAssignments)
        .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAssignments.roundId))
        .where(and(
          eq(reviewAssignments.id, input.assignmentId),
          eq(reviewAssignments.reviewerPersonId, input.reviewerPersonId),
          eq(reviewRounds.eventId, input.eventId),
        ))
        .limit(1);
      if (!assignment) throw new ReviewsRepositoryError("assignment_not_found", "This review assignment is not in the reviewer's queue.");
      if (assignment.status === "submitted") throw new ReviewsRepositoryError("review_already_finalized", "A finalized review cannot be recused.");
      if (assignment.status !== "recused") {
        await transaction.update(reviewAssignments).set({ status: "recused", recusalReason: input.reason, updatedAt: new Date() })
          .where(eq(reviewAssignments.id, assignment.id));
        await transaction.insert(reviewConflicts).values({
          eventId: input.eventId,
          submissionId: assignment.submissionId,
          reviewerPersonId: input.reviewerPersonId,
          declaredByPersonId: input.reviewerPersonId,
          reason: input.reason,
        }).onConflictDoNothing();
      }
      return { assignmentId: assignment.id, status: "recused" as const };
    });
  }

  async listResults(eventId: string, roundId?: string): Promise<Array<ReviewResultRow>> {
    const assignmentRows = await this.database.select({
      submissionId: reviewAssignments.submissionId,
      status: reviewAssignments.status,
      weightedScore: reviewResponses.weightedScore,
    }).from(reviewAssignments)
      .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAssignments.roundId))
      .leftJoin(reviewResponses, eq(reviewResponses.assignmentId, reviewAssignments.id))
      .where(roundId
        ? and(eq(reviewRounds.eventId, eventId), eq(reviewRounds.id, roundId))
        : eq(reviewRounds.eventId, eventId));
    const submissionIds = [...new Set(assignmentRows.map((assignment) => assignment.submissionId))];
    if (submissionIds.length === 0) return [];
    const [submissionRows, participantRows, decisionRows] = await Promise.all([
      this.database.select({ id: submissions.id, title: submissionVersions.title }).from(submissions)
        .innerJoin(submissionVersions, and(
          eq(submissionVersions.submissionId, submissions.id),
          eq(submissionVersions.version, submissions.currentVersion),
        ))
        .where(and(eq(submissions.eventId, eventId), inArray(submissions.id, submissionIds))),
      this.database.select({
        submissionId: submissionParticipants.submissionId,
        name: submissionParticipants.name,
        role: submissionParticipants.role,
        sortOrder: submissionParticipants.sortOrder,
      }).from(submissionParticipants)
        .where(inArray(submissionParticipants.submissionId, submissionIds))
        .orderBy(asc(submissionParticipants.sortOrder)),
      this.database.select({ submissionId: decisions.submissionId, outcome: decisions.outcome }).from(decisions)
        .where(inArray(decisions.submissionId, submissionIds)),
    ]);
    return submissionRows.map((submission) => {
      const assigned = assignmentRows.filter((assignment) => assignment.submissionId === submission.id);
      const submittedScores = assigned
        .filter((assignment) => assignment.status === "submitted" && assignment.weightedScore !== null)
        .map((assignment) => assignment.weightedScore as number);
      const aggregateScore = submittedScores.length === 0
        ? null
        : Math.round((submittedScores.reduce((sum, score) => sum + score, 0) / submittedScores.length)) / 100;
      return {
        submissionId: submission.id,
        title: submission.title,
        participants: participantRows.filter((participant) => participant.submissionId === submission.id).map(({ name, role }) => ({ name, role })),
        assigned: assigned.length,
        submitted: assigned.filter((assignment) => assignment.status === "submitted").length,
        recused: assigned.filter((assignment) => assignment.status === "recused").length,
        aggregateScore,
        decision: decisionRows.find((decision) => decision.submissionId === submission.id)?.outcome ?? null,
      };
    }).sort((left, right) => (right.aggregateScore ?? -1) - (left.aggregateScore ?? -1) || left.title.localeCompare(right.title));
  }

  async getDecision(submissionId: string) {
    const [decision] = await this.database.select().from(decisions).where(eq(decisions.submissionId, submissionId)).limit(1);
    return decision ?? null;
  }

  async recordRejection(input: {
    eventId: string;
    submissionId: string;
    decidedByPersonId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ decisionId: string; outboxEventId: string; idempotent: boolean }> {
    await this.assertSubmission(input.eventId, input.submissionId);
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction.select().from(decisions).where(eq(decisions.submissionId, input.submissionId)).limit(1);
      if (existing) {
        if (existing.outcome === "accepted") {
          throw new ReviewsRepositoryError("decision_requires_acceptance_port", "Changing an accepted decision requires the parent-owned atomic acceptance coordinator.");
        }
        const [outbox] = await transaction.select({ id: outboxEvents.id }).from(outboxEvents)
          .where(eq(outboxEvents.idempotencyKey, `decision-notification:${existing.id}`)).limit(1);
        if (!outbox) throw new Error("The rejection exists without its transactional notification handoff.");
        return { decisionId: existing.id, outboxEventId: outbox.id, idempotent: true };
      }
      const [decision] = await transaction.insert(decisions).values({
        submissionId: input.submissionId,
        outcome: "rejected",
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        decidedByPersonId: input.decidedByPersonId,
      }).returning({ id: decisions.id });
      if (!decision) throw new Error("The rejection insert did not return a record.");
      await transaction.insert(decisionAuditEvents).values({
        decisionId: decision.id,
        outcome: "rejected",
        reason: input.reason,
        actorPersonId: input.decidedByPersonId,
        idempotencyKey: input.idempotencyKey,
      });
      const [outbox] = await transaction.insert(outboxEvents).values({
        aggregateType: "decision",
        aggregateId: decision.id,
        eventType: "decision.rejected",
        payload: { decisionId: decision.id, submissionId: input.submissionId, eventId: input.eventId, outcome: "rejected" },
        idempotencyKey: `decision-notification:${decision.id}`,
      }).returning({ id: outboxEvents.id });
      if (!outbox) throw new Error("The rejection notification handoff insert did not return a record.");
      return { decisionId: decision.id, outboxEventId: outbox.id, idempotent: false };
    });
  }

  async recordAiAssessment(input: {
    submissionId: string;
    roundId: string;
    provider: string;
    model: string;
    promptVersion: string;
    score: number;
    reasoning: string;
  }) {
    const [assessment] = await this.database.insert(reviewAiAssessments).values({
      ...input,
      status: "completed",
      score: Math.round(input.score * 100),
    }).returning({ id: reviewAiAssessments.id });
    if (!assessment) throw new Error("The AI assessment insert did not return a record.");
    return { id: assessment.id, score: input.score, reasoning: input.reasoning };
  }

  async recordAiFailure(input: {
    submissionId: string;
    roundId: string;
    provider: string;
    model: string;
    promptVersion: string;
    failureCode: string;
  }) {
    const [assessment] = await this.database.insert(reviewAiAssessments).values({ ...input, status: "failed" })
      .returning({ id: reviewAiAssessments.id });
    if (!assessment) throw new Error("The failed AI assessment insert did not return a record.");
    return assessment;
  }

  async assertAiAssessment(eventId: string, assessmentId: string): Promise<void> {
    const [assessment] = await this.database.select({ id: reviewAiAssessments.id }).from(reviewAiAssessments)
      .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAiAssessments.roundId))
      .where(and(eq(reviewAiAssessments.id, assessmentId), eq(reviewRounds.eventId, eventId)))
      .limit(1);
    if (!assessment) throw new ReviewsRepositoryError("submission_not_found", "AI assessment not found in this event.");
  }

  async overrideAiAssessment(input: { assessmentId: string; actorPersonId: string; score: number; reason: string }) {
    const [assessment] = await this.database.update(reviewAiAssessments).set({
      humanOverrideScore: Math.round(input.score * 100),
      humanOverrideReason: input.reason,
      overriddenByPersonId: input.actorPersonId,
      overriddenAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reviewAiAssessments.id, input.assessmentId)).returning({ id: reviewAiAssessments.id });
    if (!assessment) throw new ReviewsRepositoryError("submission_not_found", "AI assessment not found.");
    return { id: assessment.id, overrideScore: input.score, overrideReason: input.reason };
  }
}

export type ReviewsRepositoryPort = Pick<ReviewsDecisionsRepository,
  | "findEventBySlug"
  | "assertSubmission"
  | "createPlan"
  | "listPlans"
  | "listEligibleReviewers"
  | "listSubmittedProposals"
  | "listAiAssessments"
  | "getRound"
  | "listOutstandingReviewerIds"
  | "getDistributionContext"
  | "createAssignments"
  | "declareConflict"
  | "listReviewerQueue"
  | "getAssignment"
  | "saveResponse"
  | "recuse"
  | "listResults"
  | "recordRejection"
  | "recordAiAssessment"
  | "recordAiFailure"
  | "assertAiAssessment"
  | "overrideAiAssessment"
>;

function stringAnswer(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalStringAnswer(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function reviewerProgress(assignments: ReadonlyArray<{ status: "assigned" | "in_progress" | "submitted" | "recused" }>) {
  const submitted = assignments.filter((assignment) => assignment.status === "submitted").length;
  const recused = assignments.filter((assignment) => assignment.status === "recused").length;
  const completable = assignments.length - recused;
  return { assigned: assignments.length, submitted, recused, percentComplete: completable === 0 ? 0 : Math.round((submitted / completable) * 100) };
}
