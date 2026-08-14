import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { ReviewsDecisionsRepository, ReviewsRepositoryError } from "./repository";
import { ReviewRuleError } from "./rules";
import { ReviewsDecisionsError, ReviewsDecisionsService } from "./service";
import type { DecisionCoordinatorPort, DecisionResult, ReviewReminderPort } from "./types";
import { WorkersAiReviewAdapter, type WorkersAiBinding } from "./workers-ai-adapter";

type ReviewsContext = { Bindings: Env } & ActorContext;

const NumericCriterionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  type: z.literal("numeric"),
  required: z.boolean(),
  weight: z.number().int().min(1).max(100),
  min: z.number(),
  max: z.number(),
});
const DropdownCriterionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  type: z.literal("dropdown"),
  required: z.boolean(),
  weight: z.number().int().min(0).max(100),
  options: z.array(z.object({ label: z.string().trim().min(1), score: z.number().min(0).max(100) })).min(2),
});
const FreeTextCriterionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  type: z.literal("free_text"),
  required: z.boolean(),
  weight: z.literal(0),
});
const ReviewCriterionSchema = z.discriminatedUnion("type", [NumericCriterionSchema, DropdownCriterionSchema, FreeTextCriterionSchema]);
const ReviewPlanSchema = z.object({
  name: z.string().trim().min(1).max(160),
  rounds: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    opensAt: z.iso.datetime(),
    closesAt: z.iso.datetime(),
    blindPolicy: z.enum(["none", "single_blind", "double_blind"]),
    routingKeys: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
    scorecard: z.array(ReviewCriterionSchema).min(1),
    reviewers: z.array(z.object({ personId: z.uuid(), assignmentCap: z.number().int().positive().nullable() })),
  })).min(2),
});
const SaveReviewSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  notes: z.string().max(10_000).default(""),
  finalize: z.boolean().default(false),
});
const DecisionSchema = z.object({
  submissionId: z.uuid(),
  outcome: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().min(1).max(5_000),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export function createOrganizerReviewsDecisionsRoutes(dependencies: {
  decisionCoordinatorFactory?: (environment: Env) => DecisionCoordinatorPort;
  reviewReminderPortFactory?: (environment: Env) => ReviewReminderPort;
  onDecisionRecorded?: (environment: Env, result: DecisionResult) => Promise<void>;
} = {}) {
  const routes = new Hono<ReviewsContext>();

  routes.get("/:eventSlug/evaluations", async (context) => run(context, async (service) =>
    context.json(await service.listOrganizerWorkspace(context.get("actor"), context.req.param("eventSlug"))),
  ));

  routes.post("/:eventSlug/evaluations/plans", async (context) => {
    const parsed = ReviewPlanSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_review_plan", parsed.error.flatten().fieldErrors);
    return run(context, async (service) =>
      context.json(await service.createReviewPlan(context.get("actor"), context.req.param("eventSlug"), parsed.data), 201),
    );
  });

  routes.post("/:eventSlug/evaluations/rounds/:roundId/distribute", async (context) => {
    const parsed = z.object({ submissionIds: z.array(z.uuid()).min(1) }).safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_distribution", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => context.json(await service.distributeAssignments(
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("roundId"),
      parsed.data.submissionIds,
    ), 201));
  });

  routes.post("/:eventSlug/evaluations/rounds/:roundId/assignments", async (context) => {
    const parsed = z.object({ submissionId: z.uuid(), reviewerPersonId: z.uuid() }).safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_assignment", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => context.json(await service.assignReviewer(
      context.get("actor"), context.req.param("eventSlug"), context.req.param("roundId"), parsed.data.submissionId, parsed.data.reviewerPersonId,
    ), 201));
  });

  routes.post("/:eventSlug/evaluations/conflicts", async (context) => {
    const parsed = z.object({
      submissionId: z.uuid(),
      reviewerPersonId: z.uuid(),
      reason: z.string().trim().min(3).max(2_000),
    }).safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_conflict", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => context.json(await service.declareConflict(
      context.get("actor"), context.req.param("eventSlug"), parsed.data,
    ), 201));
  });

  routes.get("/:eventSlug/evaluations/results", async (context) => run(context, async (service) =>
    context.json(await service.listResults(context.get("actor"), context.req.param("eventSlug"), context.req.query("roundId"))),
  ));

  routes.post("/:eventSlug/evaluations/rounds/:roundId/reminders", async (context) => {
    const parsed = z.object({ idempotencyKey: z.string().trim().min(12).max(200) }).safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_review_reminder", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => context.json(await service.remindOutstanding(
      context.get("actor"), context.req.param("eventSlug"), context.req.param("roundId"), parsed.data.idempotencyKey,
    ), 201));
  });

  routes.get("/:eventSlug/evaluations/results.csv", async (context) => run(context, async (service) => {
    const csv = await service.exportResults(context.get("actor"), context.req.param("eventSlug"), context.req.query("roundId"));
    return context.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${context.req.param("eventSlug")}-review-results.csv"`,
    });
  }));

  routes.post("/:eventSlug/evaluations/decisions", async (context) => {
    const parsed = DecisionSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_decision", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => {
      const result = await service.decide(context.get("actor"), context.req.param("eventSlug"), parsed.data);
      await dependencies.onDecisionRecorded?.(context.env, result);
      return context.json(result, 201);
    });
  });

  routes.post("/:eventSlug/evaluations/rounds/:roundId/submissions/:submissionId/ai-assessments", async (context) =>
    run(context, async (service) => context.json(await service.requestAiAssessment(
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("roundId"),
      context.req.param("submissionId"),
    ), 201)),
  );

  routes.post("/:eventSlug/evaluations/ai-assessments/:assessmentId/override", async (context) => {
    const parsed = z.object({ score: z.number().min(0).max(100), reason: z.string().trim().min(3).max(2_000) })
      .safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_ai_override", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => context.json(await service.overrideAiAssessment(
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("assessmentId"),
      parsed.data,
    )));
  });

  function service(context: Context<ReviewsContext>) {
    const databaseUrl = context.env.DATABASE_URL;
    if (!databaseUrl) throw new HttpDependencyError("database_not_configured", "Database configuration is required.");
    const aiPort = context.env.AI
      ? new WorkersAiReviewAdapter(context.env.AI as unknown as WorkersAiBinding)
      : undefined;
    return new ReviewsDecisionsService(
      new ReviewsDecisionsRepository(createDatabase(databaseUrl)),
      dependencies.decisionCoordinatorFactory?.(context.env),
      aiPort,
      dependencies.reviewReminderPortFactory?.(context.env),
    );
  }

  async function run<T>(context: Context<ReviewsContext>, operation: (service: ReviewsDecisionsService) => Promise<T>) {
    try {
      return await operation(service(context));
    } catch (error) {
      return reviewError(context, error);
    }
  }

  return routes;
}

export function createReviewerReviewsDecisionsRoutes() {
  const routes = new Hono<ReviewsContext>();
  routes.get("/:eventSlug/reviews", async (context) => run(context, async (service) =>
    context.json(await service.listReviewerQueue(context.get("actor"), context.req.param("eventSlug"))),
  ));
  routes.put("/:eventSlug/reviews/:assignmentId", async (context) => {
    const parsed = SaveReviewSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_review_response", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => context.json(await service.saveReview(
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("assignmentId"),
      parsed.data,
    )));
  });
  routes.post("/:eventSlug/reviews/:assignmentId/recuse", async (context) => {
    const parsed = z.object({ reason: z.string().trim().min(3).max(2_000) }).safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalid(context, "invalid_recusal", parsed.error.flatten().fieldErrors);
    return run(context, async (service) => context.json(await service.recuse(
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("assignmentId"),
      parsed.data.reason,
    )));
  });

  function service(context: Context<ReviewsContext>) {
    const databaseUrl = context.env.DATABASE_URL;
    if (!databaseUrl) throw new HttpDependencyError("database_not_configured", "Database configuration is required.");
    return new ReviewsDecisionsService(new ReviewsDecisionsRepository(createDatabase(databaseUrl)));
  }
  async function run<T>(context: Context<ReviewsContext>, operation: (service: ReviewsDecisionsService) => Promise<T>) {
    try {
      return await operation(service(context));
    } catch (error) {
      return reviewError(context, error);
    }
  }
  return routes;
}

class HttpDependencyError extends Error {
  constructor(readonly code: "database_not_configured", message: string) { super(message); }
}

function invalid(context: Context<ReviewsContext>, code: string, fields: unknown) {
  return context.json({ error: { code, message: "The request is invalid.", fields } }, 400);
}

function reviewError(context: Context<ReviewsContext>, error: unknown) {
  if (error instanceof HttpDependencyError) return context.json({ error: { code: error.code, message: error.message } }, 503);
  if (error instanceof ReviewsDecisionsError) {
    const status = error.code === "forbidden" ? 403 : error.code === "ai_provider_required" || error.code === "acceptance_port_required" || error.code === "review_reminder_port_required" ? 503 : 502;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
  if (error instanceof ReviewRuleError) return context.json({ error: { code: error.code, message: error.message } }, 409);
  if (error instanceof ReviewsRepositoryError) {
    const status = error.code.endsWith("_not_found") ? 404 : error.code === "decision_requires_acceptance_port" ? 409 : 409;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }
  throw error;
}
