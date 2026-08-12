import { ReadinessResponseSchema, type ReadinessResponse } from "@programflow/contracts";
import { createDatabase, events, organizations, people } from "@programflow/database";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./env";
import { requestContext } from "./http/middleware/request-context";
import { eventConfigurationRoutes } from "./modules/event-configuration/routes";
import {
  filesDeliverablesOrganizerRoutes,
  filesDeliverablesSpeakerRoutes,
} from "./modules/files-deliverables";
import { storageIsConfigured } from "./modules/files-deliverables/storage";
import {
  organizerFormsSubmissionsRoutes,
  publicFormsSubmissionsRoutes,
  speakerFormsSubmissionsRoutes,
} from "./modules/forms-submissions/routes";
import { proxyAuthRequest } from "./modules/identity-access/auth-proxy";
import type { Actor, ActorContext } from "./modules/identity-access/actor";
import { resolveActor } from "./modules/identity-access/resolve-actor";
import { workspaceRoutes } from "./modules/identity-access/workspace";
import { decideSubmission } from "./modules/program/acceptance";
import {
  communicationsOrganizerRoutes,
  communicationsProviderRoutes,
  createReviewReminderPort,
} from "./modules/communications";
import {
  createOrganizerReviewsDecisionsRoutes,
  createReviewerReviewsDecisionsRoutes,
} from "./modules/reviews-decisions";
import {
  speakerOperationsOrganizerRoutes,
  speakerOperationsPortalRoutes,
} from "./modules/speaker-operations";
import { schedulingOrganizerRoutes } from "./modules/scheduling";
import { acceleventsOrganizerRoutes, integrationsOrganizerRoutes } from "./modules/integrations";
import { publishingOrganizerRoutes, publishingPublicRoutes } from "./modules/publishing";
import { speakerCrmRoutes } from "./modules/speaker-crm";
import { dashboardOrganizerRoutes } from "./modules/dashboard";
import { publicApiRoutes } from "./modules/public-api";
import { claimAndEnqueueOutbox } from "./outbox";

type WorkerContext = { Bindings: Env } & ActorContext;

export function createApp() {
  const app = new Hono<WorkerContext>();

  app.use("*", requestContext);
  app.use("*", secureHeaders());

  app.all("/api/auth/*", proxyAuthRequest);
  app.use("/api/v1/organizer/*", resolveActor);
  app.use("/api/v1/reviewer/*", resolveActor);
  app.use("/api/v1/speaker/*", resolveActor);
  app.use("/api/v1/session", resolveActor);
  app.use("/api/v1/onboarding", resolveActor);
  app.get("/api/v1/session", async (context) => {
    const actor = context.get("actor");
    const database = createDatabase(context.env.DATABASE_URL!);
    const eventIds = [...new Set(actor.eventRoles.map((grant) => grant.eventId))];
    const organizationIds = [...new Set(actor.organizationRoles.map((grant) => grant.organizationId))];
    const [personRows, eventRows, organizationRows] = await Promise.all([
      database.select({ id: people.id, displayName: people.displayName, email: people.canonicalEmail })
        .from(people).where(inArray(people.id, [actor.personId])).limit(1),
      eventIds.length
        ? database.select({ id: events.id, organizationId: events.organizationId, slug: events.slug, name: events.name, startsOn: events.startsOn, endsOn: events.endsOn, location: events.location })
          .from(events).where(inArray(events.id, eventIds))
        : Promise.resolve([]),
      organizationIds.length
        ? database.select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
          .from(organizations).where(inArray(organizations.id, organizationIds))
        : Promise.resolve([]),
    ]);
    const eventMemberships = eventRows.map((event) => ({
      ...event,
      roles: actor.eventRoles.filter((grant) => grant.eventId === event.id).map((grant) => grant.role),
    }));
    const organizationMemberships = organizationRows.map((organization) => ({
      ...organization,
      roles: actor.organizationRoles.filter((grant) => grant.organizationId === organization.id).map((grant) => grant.role),
    }));
    const organizerEvent = eventMemberships.find((event) => event.roles.includes("organizer"));
    const reviewerEvent = eventMemberships.find((event) => event.roles.includes("reviewer"));
    const speakerEvent = eventMemberships.find((event) => event.roles.includes("speaker"));
    const recommendedPath = organizerEvent
      ? `/organizer/events/${organizerEvent.slug}/dashboard`
      : reviewerEvent
        ? `/reviewer/events/${reviewerEvent.slug}/reviews`
        : speakerEvent
          ? `/speaker/events/${speakerEvent.slug}`
          : "/onboarding";
    return context.json({ person: personRows[0], organizationMemberships, eventMemberships, recommendedPath });
  });
  app.route("/api/v1", workspaceRoutes);
  app.route("/api/v1/organizer/events", eventConfigurationRoutes);
  app.route("/api/v1/organizer/events", organizerFormsSubmissionsRoutes);
  app.route("/api/v1/organizer/events", createOrganizerReviewsDecisionsRoutes({
    acceptancePortFactory: (environment) => ({
      accept: (input) => {
        if (!environment.DATABASE_URL) throw new Error("Database configuration is required.");
        const actor: Actor = {
          identityId: "reviews-acceptance-port",
          personId: input.decidedByPersonId,
          organizationRoles: [],
          eventRoles: [{ eventId: input.eventId, role: "organizer" }],
        };
        return decideSubmission(createDatabase(environment.DATABASE_URL), actor, {
          submissionId: input.submissionId,
          outcome: "accepted",
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        });
      },
    }),
    reviewReminderPortFactory: (environment) => {
      if (!environment.DATABASE_URL) throw new Error("Database configuration is required.");
      const port = createReviewReminderPort(createDatabase(environment.DATABASE_URL));
      return {
        async remindOutstanding(input) {
          const result = await port.remindOutstanding(input);
          await claimAndEnqueueOutbox(environment, result.outboxEventIds);
          return result;
        },
      };
    },
    onDecisionRecorded: async (environment) => {
      await claimAndEnqueueOutbox(environment);
    },
  }));
  app.route("/api/v1/organizer", speakerOperationsOrganizerRoutes);
  app.route("/api/v1/organizer", filesDeliverablesOrganizerRoutes);
  app.route("/api/v1/organizer", communicationsOrganizerRoutes);
  app.route("/api/v1/organizer", schedulingOrganizerRoutes);
  app.route("/api/v1/organizer", integrationsOrganizerRoutes);
  app.route("/api/v1/organizer", acceleventsOrganizerRoutes);
  app.route("/api/v1/organizer", publishingOrganizerRoutes);
  app.route("/api/v1/organizer", speakerCrmRoutes);
  app.route("/api/v1/organizer", dashboardOrganizerRoutes);
  app.route("/api/v1/reviewer/events", createReviewerReviewsDecisionsRoutes());
  app.route("/api/v1/speaker", speakerFormsSubmissionsRoutes);
  app.route("/api/v1/speaker", speakerOperationsPortalRoutes);
  app.route("/api/v1/speaker", filesDeliverablesSpeakerRoutes);
  app.route("/api/v1/public/cfp", publicFormsSubmissionsRoutes);
  app.route("/api/v1/public/program", publishingPublicRoutes);
  app.route("/api/v1/providers/webhooks", communicationsProviderRoutes);
  app.route("/api/v1", publicApiRoutes);

  app.get("/api/v1/health/live", (context) =>
    context.json({ status: "ok", service: "programflow" } as const),
  );

  app.get("/api/v1/health/ready", (context) => {
    const dependencies = {
      database: status(Boolean(context.env.DATABASE_URL), "Neon PostgreSQL connection"),
      auth: status(Boolean(context.env.NEON_AUTH_BASE_URL && context.env.NEON_AUTH_COOKIE_SECRET), "Neon Auth endpoint and cookie signing"),
      email: status(Boolean(context.env.BREVO_API_KEY), "Brevo transactional email"),
      files: status(storageIsConfigured(context.env), "Neon private object storage"),
      queue: status(Boolean(context.env.JOBS), "Cloudflare Queue binding"),
      ai: status(Boolean(context.env.AI), "Cloudflare Workers AI binding"),
    };
    const response: ReadinessResponse = {
      status: Object.values(dependencies).every((dependency) => dependency.configured)
        ? "ready"
        : "needs_configuration",
      service: "programflow",
      environment: context.env.APP_ENV,
      commit: context.env.GIT_COMMIT_SHA ?? "local",
      dependencies,
    };

    return context.json(ReadinessResponseSchema.parse(response));
  });

  app.get("/api/v1", (context) =>
    context.json({
      name: "ProgramFlow API",
      version: "v1",
      documentation: "/api/v1/openapi.json",
    }),
  );

  app.notFound((context) =>
    context.json(
      { error: { code: "not_found", message: "The requested API resource does not exist." } },
      404,
    ),
  );

  app.onError((error, context) => {
    console.error(JSON.stringify({
      level: "error",
      operation: "http_request",
      message: error.message,
      requestId: context.res.headers.get("x-request-id"),
    }));
    return context.json(
      { error: { code: "internal_error", message: "The request could not be completed." } },
      500,
    );
  });

  return app;
}

function status(configured: boolean, dependency: string) {
  return {
    configured,
    detail: configured ? `${dependency} is configured` : `${dependency} needs configuration`,
  };
}
