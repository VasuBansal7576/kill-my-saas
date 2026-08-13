import {
  acceleventsSyncRuns,
  airtableSyncRuns,
  communicationRecipients,
  communications,
  evidenceRecords,
  events,
  fileObjects,
  reviewAiAssessments,
  submissions,
  type Database,
} from "@programflow/database";
import { eq } from "drizzle-orm";
import type { Env } from "../../env";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import type {
  EvidenceState,
  EvaluationEvidenceCenter,
  ProviderEvidenceStatus,
  RequirementEvidence,
} from "./contracts";
import {
  evaluationScenarios,
  extraCreditRubricIds,
  requiredRubricIds,
} from "./scenarios";

export class EvaluationEvidenceError extends Error {
  constructor(readonly code: "event_not_found" | "forbidden", message: string) {
    super(message);
  }
}

interface ProviderRows {
  email: Array<{ status: string; providerMessageId: string | null }>;
  files: Array<{ verificationStatus: string }>;
  ai: Array<{ status: string; score: number | null; reasoning: string | null }>;
  airtable: Array<{ status: string; providerResponded: boolean }>;
  accelevents: Array<{ status: string; providerResponded: boolean }>;
}

interface RuntimeReleaseData {
  appEnvironment: Env["APP_ENV"];
  commit: string | null;
  migration: string | null;
  deploymentId: string | null;
  sourceUrl: string | null;
  evaluationUrl: string;
  resetRunbookUrl: string | null;
}

export async function getEvaluationEvidenceCenter(
  database: Database,
  actor: Actor,
  eventSlug: string,
  runtime: RuntimeReleaseData,
  now = new Date(),
): Promise<EvaluationEvidenceCenter> {
  const candidates = await database.select({ id: events.id, organizationId: events.organizationId, slug: events.slug, name: events.name })
    .from(events).where(eq(events.slug, eventSlug));
  if (candidates.length === 0) throw new EvaluationEvidenceError("event_not_found", "Event not found.");
  const event = candidates.find((candidate) => canViewEvaluationEvidence(actor, candidate.id));
  if (!event) throw new EvaluationEvidenceError("forbidden", "Organizer access to this event is required.");

  const [evidence, email, files, ai, airtable, accelevents] = await Promise.all([
    database.select({
      id: evidenceRecords.id,
      requirementId: evidenceRecords.requirementId,
      operation: evidenceRecords.operation,
      artifactUrl: evidenceRecords.artifactUrl,
      metadata: evidenceRecords.metadata,
      verified: evidenceRecords.verified,
      createdAt: evidenceRecords.createdAt,
    }).from(evidenceRecords).where(eq(evidenceRecords.eventId, event.id)),
    database.select({ status: communicationRecipients.status, providerMessageId: communicationRecipients.providerMessageId })
      .from(communicationRecipients)
      .innerJoin(communications, eq(communications.id, communicationRecipients.communicationId))
      .where(eq(communications.eventId, event.id)),
    database.select({ verificationStatus: fileObjects.verificationStatus })
      .from(fileObjects).where(eq(fileObjects.eventId, event.id)),
    database.select({ status: reviewAiAssessments.status, score: reviewAiAssessments.score, reasoning: reviewAiAssessments.reasoning })
      .from(reviewAiAssessments)
      .innerJoin(submissions, eq(submissions.id, reviewAiAssessments.submissionId))
      .where(eq(submissions.eventId, event.id)),
    database.select({ status: airtableSyncRuns.status, providerResponded: airtableSyncRuns.providerResponded })
      .from(airtableSyncRuns).where(eq(airtableSyncRuns.eventId, event.id)),
    database.select({ status: acceleventsSyncRuns.status, providerResponded: acceleventsSyncRuns.providerResponded })
      .from(acceleventsSyncRuns).where(eq(acceleventsSyncRuns.eventId, event.id)),
  ]);

  return buildEvaluationEvidenceCenter({
    event,
    evidence: evidence.map((record) => ({ ...record, createdAt: record.createdAt.toISOString() })),
    providers: { email, files, ai, airtable, accelevents },
    runtime,
    generatedAt: now.toISOString(),
  });
}

export function buildEvaluationEvidenceCenter(input: {
  event: { id: string; organizationId: string; slug: string; name: string };
  evidence: Array<{
    id: string;
    requirementId: string;
    operation: string;
    artifactUrl: string | null;
    metadata: Record<string, unknown>;
    verified: boolean;
    createdAt: string;
  }>;
  providers: ProviderRows;
  runtime: RuntimeReleaseData;
  generatedAt: string;
}): EvaluationEvidenceCenter {
  const evidenceByRequirement = new Map<string, RequirementEvidence["records"]>();
  for (const record of input.evidence) {
    const records = evidenceByRequirement.get(record.requirementId) ?? [];
    records.push({
      id: record.id,
      operation: record.operation,
      artifactUrl: record.artifactUrl,
      metadata: record.metadata,
      verified: record.verified,
      createdAt: record.createdAt,
    });
    evidenceByRequirement.set(record.requirementId, records);
  }

  const scenarios = evaluationScenarios.map((definition) => {
    const requirements = definition.requirementIds.map((requirementId) => {
      const records = evidenceByRequirement.get(requirementId) ?? [];
      return { requirementId, state: evidenceState(records), records };
    });
    return {
      ...materializeScenario(definition, input.event.slug, input.event.organizationId),
      state: combinedState(requirements.map((requirement) => requirement.state)),
      requirements,
    };
  });
  const requirementStates = new Map(scenarios.flatMap((scenario) =>
    scenario.requirements.map((requirement) => [requirement.requirementId, requirement.state] as const),
  ));
  const allStates = [...requirementStates.values()];
  const providers = deriveProviderEvidence(input.providers);
  const readiness = {
    state: combinedState(allStates),
    verified: allStates.filter((state) => state === "verified").length,
    recorded: allStates.filter((state) => state === "recorded").length,
    missing: allStates.filter((state) => state === "missing").length,
    requiredVerified: requiredRubricIds.filter((id) => requirementStates.get(id) === "verified").length,
    requiredTotal: 84 as const,
    extraCreditVerified: extraCreditRubricIds.filter((id) => requirementStates.get(id) === "verified").length,
    extraCreditTotal: 12 as const,
    scenarioVerified: scenarios.filter((scenario) => scenario.state === "verified").length,
    scenarioTotal: 20 as const,
  };
  const resetAllowed = input.runtime.appEnvironment === "evaluation" || input.runtime.appEnvironment === "preview";
  const releaseManifest = {
    schemaVersion: 1 as const,
    product: "ProgramFlow" as const,
    event: { slug: input.event.slug, name: input.event.name },
    generatedAt: input.generatedAt,
    commit: input.runtime.commit,
    migration: input.runtime.migration,
    deploymentId: input.runtime.deploymentId,
    sourceUrl: input.runtime.sourceUrl,
    evaluationUrl: input.runtime.evaluationUrl,
    rubric: readiness,
    providers,
  };

  return {
    event: { id: input.event.id, slug: input.event.slug, name: input.event.name },
    generatedAt: input.generatedAt,
    readiness,
    goldenThread: goldenThread(input.event.slug, input.event.organizationId, scenarios.map(({ id, state }) => ({ id, state }))),
    scenarios,
    providers,
    reset: {
      available: resetAllowed,
      environment: input.runtime.appEnvironment,
      detail: resetAllowed
        ? "Reset is an operator-run snapshot restore. This page never exposes a destructive public endpoint."
        : "Reset instructions are hidden outside authorized preview and evaluation environments.",
      runbookUrl: resetAllowed ? input.runtime.resetRunbookUrl : null,
      instructions: resetAllowed ? [
        "Confirm APP_ENV is evaluation or preview and record the current release manifest.",
        "Restore the named clean-evaluation database branch/snapshot and its matching private-file prefix.",
        "Run migrations, seed DevFlow Conf 2027 with the explicit confirmation value, and synchronize evaluator auth.",
        "Verify health, persona sign-in, the five anonymous public routes, and this evidence center before handing back the URL.",
      ] : [],
    },
    releaseManifest,
  };
}

function materializeScenario<T extends { entryRoute: string; routes: string[] }>(scenario: T, eventSlug: string, organizationId: string): T {
  return {
    ...scenario,
    entryRoute: materializeRoute(scenario.entryRoute, eventSlug, organizationId),
    routes: scenario.routes.map((route) => materializeRoute(route, eventSlug, organizationId)),
  };
}

function materializeRoute(route: string, eventSlug: string, organizationId: string) {
  return route.replace(":eventSlug", encodeURIComponent(eventSlug)).replace(":organizationId", encodeURIComponent(organizationId));
}

function evidenceState(records: RequirementEvidence["records"]): EvidenceState {
  if (records.some((record) => record.verified)) return "verified";
  return records.length > 0 ? "recorded" : "missing";
}

function combinedState(states: EvidenceState[]): EvidenceState {
  if (states.length > 0 && states.every((state) => state === "verified")) return "verified";
  if (states.length > 0 && states.every((state) => state !== "missing")) return "recorded";
  return "missing";
}

function deriveProviderEvidence(rows: ProviderRows): ProviderEvidenceStatus[] {
  const emailVerified = rows.email.filter((row) => row.providerMessageId && (row.status === "accepted" || row.status === "delivered")).length;
  const fileVerified = rows.files.filter((row) => row.verificationStatus === "verified").length;
  const aiVerified = rows.ai.filter((row) => row.status === "completed" && row.score !== null && Boolean(row.reasoning?.trim())).length;
  const airtableVerified = rows.airtable.filter((row) => row.providerResponded && row.status === "succeeded").length;
  const acceleventsVerified = rows.accelevents.filter((row) => row.providerResponded && row.status === "succeeded").length;
  return [
    provider("email", rows.email.length, emailVerified, `${emailVerified} recipient outcome${emailVerified === 1 ? "" : "s"} retain a provider message ID.`),
    provider("files", rows.files.length, fileVerified, `${fileVerified} immutable file object${fileVerified === 1 ? "" : "s"} passed verification.`),
    provider("workers_ai", rows.ai.length, aiVerified, `${aiVerified} completed assessment${aiVerified === 1 ? "" : "s"} retain a numeric score and written reasoning.`),
    provider("airtable", rows.airtable.length, airtableVerified, `${airtableVerified} successful run${airtableVerified === 1 ? "" : "s"} retain a provider response.`),
    provider("accelevents", rows.accelevents.length, acceleventsVerified, `${acceleventsVerified} successful run${acceleventsVerified === 1 ? "" : "s"} retain a provider response.`),
  ];
}

function provider(providerName: ProviderEvidenceStatus["provider"], total: number, verified: number, detail: string): ProviderEvidenceStatus {
  return { provider: providerName, state: verified > 0 ? "verified" : total > 0 ? "recorded" : "missing", detail, receipts: total };
}

function goldenThread(eventSlug: string, organizationId: string, scenarioStates: Array<{ id: string; state: EvidenceState }>) {
  const state = (...ids: string[]) => combinedState(ids.map((id) => scenarioStates.find((scenario) => scenario.id === id)?.state ?? "missing"));
  const base = `/organizer/events/${encodeURIComponent(eventSlug)}`;
  return [
    { order: 1, label: "Public CFP and submission", route: `/cfp/${encodeURIComponent(eventSlug)}`, scenarioIds: ["CFP-S1", "CFP-S2"], state: state("CFP-S1", "CFP-S2") },
    { order: 2, label: "Review configuration and scoring", route: `${base}/evaluations`, scenarioIds: ["CFP-S3", "ABS-S2", "ABS-S3"], state: state("CFP-S3", "ABS-S2", "ABS-S3") },
    { order: 3, label: "Decision and accepted-session handoff", route: `${base}/submissions`, scenarioIds: ["CFP-S4"], state: state("CFP-S4") },
    { order: 4, label: "Speaker onboarding", route: `${base}/speakers`, scenarioIds: ["SPK-S1", "SPK-S2", "SPK-S3"], state: state("SPK-S1", "SPK-S2", "SPK-S3") },
    { order: 5, label: "Content collection and approval", route: `${base}/files`, scenarioIds: ["CNT-S1", "CNT-S2", "CNT-S3"], state: state("CNT-S1", "CNT-S2", "CNT-S3") },
    { order: 6, label: "Scheduling and publication", route: `${base}/agenda`, scenarioIds: ["AIA-S1", "AIA-S2"], state: state("AIA-S1", "AIA-S2") },
    { order: 7, label: "Anonymous public program and embeds", route: `/events/${encodeURIComponent(eventSlug)}/sessions`, scenarioIds: ["EMB-S1", "EMB-S2", "EMB-S3"], state: state("EMB-S1", "EMB-S2", "EMB-S3") },
    { order: 8, label: "Cross-event Speaker CRM", route: `/organizer/organizations/${encodeURIComponent(organizationId)}/speaker-crm`, scenarioIds: ["CRM-S1", "CRM-S2"], state: state("CRM-S1", "CRM-S2") },
  ];
}

export function canViewEvaluationEvidence(actor: Actor, eventId: string) {
  return actorCanAccessEvent(actor, eventId, "organizer");
}
