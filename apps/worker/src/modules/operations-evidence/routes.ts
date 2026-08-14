import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { EvaluationEvidenceError, getEvaluationEvidenceCenter } from "./service";

type OperationsContext = { Bindings: Env } & ActorContext;

export const operationsEvidenceOrganizerRoutes = new Hono<OperationsContext>();

operationsEvidenceOrganizerRoutes.get("/events/:eventSlug/evaluation-evidence", (context) => center(context));
operationsEvidenceOrganizerRoutes.get("/events/:eventSlug/evaluation-evidence/manifest.json", async (context) => {
  const response = await center(context, true);
  response.headers.set("content-disposition", `attachment; filename="programflow-${safeName(context.req.param("eventSlug"))}-evidence-manifest.json"`);
  return response;
});

export const operationsEvidencePublicRoutes = new Hono<{ Bindings: Env }>();

operationsEvidencePublicRoutes.get("/evaluation/entry", (context) => {
  context.header("cache-control", "public, max-age=300");
  return context.json({
    product: "ProgramFlow",
    event: { name: "DevFlow Conf 2027", slug: "devflow-conf-2027" },
    public: {
      cfp: "/cfp/devflow-conf-2027",
      sessions: "/events/devflow-conf-2027/sessions",
      speakers: "/events/devflow-conf-2027/speakers",
      agenda: "/events/devflow-conf-2027/agenda",
      itinerary: "/events/devflow-conf-2027/itinerary",
      gallery: "/events/devflow-conf-2027/gallery",
    },
    personas: {
      organizer: "/login?next=%2Forganizer",
      speaker: "/login?next=%2Fspeaker%2Fevents%2Fdevflow-conf-2027",
      reviewer: "/login?next=%2Freviewer%2Fevents%2Fdevflow-conf-2027%2Freviews",
    },
    help: "/help",
    credentials: "Credentials are supplied privately in the evaluator configuration; no passwords are published here.",
  });
});

async function center(context: Context<OperationsContext>, manifestOnly = false) {
  if (!context.env.DATABASE_URL) {
    return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  }
  try {
    const requestUrl = new URL(context.req.url);
    const evaluationUrl = context.env.EVALUATION_URL?.trim() || requestUrl.origin;
    const result = await getEvaluationEvidenceCenter(
      createDatabase(context.env.DATABASE_URL),
      context.get("actor"),
      context.req.param("eventSlug") ?? "",
      {
        appEnvironment: context.env.APP_ENV,
        commit: present(context.env.GIT_COMMIT_SHA),
        migration: present(context.env.RELEASE_MIGRATION),
        deploymentId: present(context.env.DEPLOYMENT_ID),
        sourceUrl: present(context.env.SOURCE_URL),
        evaluationUrl,
        resetRunbookUrl: present(context.env.EVALUATION_RESET_RUNBOOK_URL),
      },
    );
    context.header("cache-control", "private, no-store");
    return context.json(manifestOnly ? result.releaseManifest : result);
  } catch (error) {
    if (!(error instanceof EvaluationEvidenceError)) throw error;
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.code === "event_not_found" ? 404 : 403,
    );
  }
}

function present(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "local" ? normalized : null;
}

function safeName(value: string) {
  return value.replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || "event";
}
