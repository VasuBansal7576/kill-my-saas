import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { DraftSubmissionInputSchema, FormConfigurationInputSchema, SubmissionInputSchema } from "./domain";
import {
  closeForm,
  createForm,
  createManualSubmission,
  createSpeakerSubmission,
  FormsSubmissionsError,
  getFormWorkspace,
  getPublicForm,
  getSpeakerSubmission,
  listOrganizerSubmissions,
  listSpeakerSubmissions,
  publishForm,
  setSubmissionTriage,
  updateForm,
  updateSpeakerSubmission,
} from "./service";

type ProtectedContext = { Bindings: Env } & ActorContext;
type PublicContext = { Bindings: Env };

export const organizerFormsSubmissionsRoutes = new Hono<ProtectedContext>();
export const speakerFormsSubmissionsRoutes = new Hono<ProtectedContext>();
export const publicFormsSubmissionsRoutes = new Hono<PublicContext>();

organizerFormsSubmissionsRoutes.get("/:eventSlug/cfp", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  try {
    return context.json(await getFormWorkspace(database, context.get("actor"), context.req.param("eventSlug")));
  } catch (error) {
    return formsError(context, error);
  }
});

organizerFormsSubmissionsRoutes.post("/:eventSlug/cfp", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  const parsed = FormConfigurationInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(context, "invalid_form_configuration", parsed.error.flatten().fieldErrors);
  try {
    return context.json(await createForm(database, context.get("actor"), context.req.param("eventSlug"), parsed.data), 201);
  } catch (error) {
    return formsError(context, error);
  }
});

organizerFormsSubmissionsRoutes.put("/:eventSlug/cfp/:formId", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  const parsed = FormConfigurationInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(context, "invalid_form_configuration", parsed.error.flatten().fieldErrors);
  try {
    return context.json(await updateForm(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("formId"),
      parsed.data,
    ));
  } catch (error) {
    return formsError(context, error);
  }
});

organizerFormsSubmissionsRoutes.post("/:eventSlug/cfp/:formId/publish", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  try {
    return context.json(await publishForm(database, context.get("actor"), context.req.param("eventSlug"), context.req.param("formId")));
  } catch (error) {
    return formsError(context, error);
  }
});

organizerFormsSubmissionsRoutes.post("/:eventSlug/cfp/:formId/close", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  try {
    return context.json(await closeForm(database, context.get("actor"), context.req.param("eventSlug"), context.req.param("formId")));
  } catch (error) {
    return formsError(context, error);
  }
});

organizerFormsSubmissionsRoutes.get("/:eventSlug/submissions", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  try {
    return context.json({ submissions: await listOrganizerSubmissions(database, context.get("actor"), context.req.param("eventSlug")) });
  } catch (error) {
    return formsError(context, error);
  }
});

organizerFormsSubmissionsRoutes.post("/:eventSlug/submissions/manual", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  const parsed = parseSubmissionBody(await context.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(context, "invalid_submission", parsed.error.flatten().fieldErrors);
  const formId = context.req.query("formId");
  if (!formId) return invalidBody(context, "invalid_submission", { formId: ["A formId query parameter is required."] });
  try {
    return context.json(await createManualSubmission(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      formId,
      parsed.data,
    ), 201);
  } catch (error) {
    return formsError(context, error);
  }
});

organizerFormsSubmissionsRoutes.put("/:eventSlug/submissions/:submissionId/triage", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  const parsed = z.object({ state: z.enum(["unreviewed", "maybe"]) }).safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(context, "invalid_submission_triage", parsed.error.flatten().fieldErrors);
  try {
    return context.json(await setSubmissionTriage(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("submissionId"),
      parsed.data.state,
    ));
  } catch (error) {
    return formsError(context, error);
  }
});

publicFormsSubmissionsRoutes.get("/:eventSlug", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  try {
    return context.json(await getPublicForm(database, context.req.param("eventSlug")));
  } catch (error) {
    return formsError(context, error);
  }
});

speakerFormsSubmissionsRoutes.get("/events/:eventSlug/submissions", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  try {
    return context.json({ submissions: await listSpeakerSubmissions(database, context.get("actor"), context.req.param("eventSlug")) });
  } catch (error) {
    return formsError(context, error);
  }
});

speakerFormsSubmissionsRoutes.post("/events/:eventSlug/submissions", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  const parsed = parseSubmissionBody(await context.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(context, "invalid_submission", parsed.error.flatten().fieldErrors);
  const formId = context.req.query("formId");
  if (!formId) return invalidBody(context, "invalid_submission", { formId: ["A formId query parameter is required."] });
  try {
    return context.json(await createSpeakerSubmission(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      formId,
      parsed.data,
    ), 201);
  } catch (error) {
    return formsError(context, error);
  }
});

speakerFormsSubmissionsRoutes.get("/events/:eventSlug/submissions/:submissionId", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  try {
    return context.json(await getSpeakerSubmission(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("submissionId"),
    ));
  } catch (error) {
    return formsError(context, error);
  }
});

speakerFormsSubmissionsRoutes.put("/events/:eventSlug/submissions/:submissionId", async (context) => {
  const database = databaseFrom(context);
  if (!database) return databaseRequired(context);
  const parsed = parseSubmissionBody(await context.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(context, "invalid_submission", parsed.error.flatten().fieldErrors);
  try {
    return context.json(await updateSpeakerSubmission(
      database,
      context.get("actor"),
      context.req.param("eventSlug"),
      context.req.param("submissionId"),
      parsed.data,
    ));
  } catch (error) {
    return formsError(context, error);
  }
});

function databaseFrom(context: Context<PublicContext> | Context<ProtectedContext>) {
  return context.env.DATABASE_URL ? createDatabase(context.env.DATABASE_URL) : null;
}

function databaseRequired(context: Context<PublicContext> | Context<ProtectedContext>) {
  return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
}

function invalidBody(
  context: Context<PublicContext> | Context<ProtectedContext>,
  code: string,
  fields: Record<string, string[] | undefined>,
) {
  return context.json({ error: { code, message: "The request body is invalid.", fields } }, 400);
}

function formsError(context: Context<PublicContext> | Context<ProtectedContext>, error: unknown) {
  if (!(error instanceof FormsSubmissionsError)) throw error;
  const status = errorStatus(error.code);
  return context.json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, status);
}

function errorStatus(code: FormsSubmissionsError["code"]): 400 | 403 | 404 | 409 | 422 {
  if (code === "event_not_found" || code === "form_not_found" || code === "form_not_published" || code === "submission_not_found") return 404;
  if (code === "forbidden") return 403;
  if (code === "conflict") return 409;
  if (code === "invalid_submission") return 422;
  return 400;
}

function parseSubmissionBody(body: unknown) {
  if (typeof body === "object" && body !== null && "saveAsDraft" in body && body.saveAsDraft === true) {
    return DraftSubmissionInputSchema.safeParse(body);
  }
  return SubmissionInputSchema.safeParse(body);
}
