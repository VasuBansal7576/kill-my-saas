import { z } from "zod";
import type { Actor } from "../../identity-access/actor";
import { actorCanAccessEvent } from "../../identity-access/actor";
import { AcceleventsProviderError } from "./adapter";
import { linkKey, mapCanonicalRecord } from "./mapping";
import type { AcceleventsRepositoryPort, SaveAcceleventsConfigurationInput } from "./repository";
import type {
  AcceleventsConfiguration,
  AcceleventsProviderPort,
  AcceleventsRecordLink,
  AcceleventsRunMode,
  AcceleventsRunReceipt,
  AcceleventsSyncRun,
  AcceleventsWorkspace,
  CanonicalAcceleventsRecord,
} from "./types";

const runCommandSchema = z.object({
  organizationId: z.string().uuid(),
  eventId: z.string().uuid(),
  mode: z.enum(["preview", "manual", "retry"]),
  sourceRunId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).superRefine((value, context) => {
  if (value.mode === "retry" && !value.sourceRunId) context.addIssue({ code: "custom", message: "Retry requires a source run.", path: ["sourceRunId"] });
  if (value.mode !== "retry" && value.sourceRunId) context.addIssue({ code: "custom", message: "Only retry may specify a source run.", path: ["sourceRunId"] });
});

export class AcceleventsIntegrationError extends Error {
  constructor(readonly code: "forbidden" | "invalid_event" | "invalid_configuration" | "invalid_command", message: string) { super(message); }
}

export class AcceleventsIntegrationService {
  constructor(private readonly repository: AcceleventsRepositoryPort) {}

  async getWorkspace(actor: Actor, eventSlug: string, tokenAvailable: boolean): Promise<AcceleventsWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    const configuration = await this.repository.ensureConfiguration(event);
    const [canonical, recentRuns] = await Promise.all([
      this.repository.listCanonicalRecords(event.id),
      this.repository.listRecentRuns(event.id),
    ]);
    return {
      event,
      configuration,
      readiness: readiness(configuration, tokenAvailable),
      canonicalCounts: {
        speakers: canonical.filter((record) => record.entityType === "speaker").length,
        sessions: canonical.filter((record) => record.entityType === "session").length,
      },
      availableReferences: availableReferences(canonical),
      lastRun: recentRuns[0] ?? null,
      recentRuns,
    };
  }

  async saveConfiguration(
    actor: Actor,
    eventSlug: string,
    input: SaveAcceleventsConfigurationInput,
    tokenAvailable: boolean,
  ): Promise<AcceleventsWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    validateConfiguration(input);
    await this.repository.saveConfiguration(event, input);
    return this.getWorkspace(actor, eventSlug, tokenAvailable);
  }

  async run(
    actor: Actor,
    eventSlug: string,
    unsafeCommand: unknown,
    providerBoundary?: AcceleventsProviderPort | ((configuration: AcceleventsConfiguration) => AcceleventsProviderPort),
  ): Promise<AcceleventsRunReceipt> {
    const parsed = runCommandSchema.safeParse(unsafeCommand);
    if (!parsed.success) throw new AcceleventsIntegrationError("invalid_command", "The Accelevents run command is invalid.");
    const command = parsed.data;
    const event = await this.requireOrganizer(actor, eventSlug);
    if (command.organizationId !== event.organizationId || command.eventId !== event.id) {
      throw new AcceleventsIntegrationError("invalid_event", "The Accelevents command does not belong to this event.");
    }
    const configuration = await this.repository.ensureConfiguration(event);
    const provider = typeof providerBoundary === "function" ? providerBoundary(configuration) : providerBoundary;
    let sourceRun: AcceleventsSyncRun | undefined;
    if (command.sourceRunId) {
      sourceRun = await this.repository.getRun(command.sourceRunId);
      if (sourceRun.eventId !== event.id || sourceRun.organizationId !== event.organizationId) {
        throw new AcceleventsIntegrationError("invalid_event", "The retry source does not belong to this event.");
      }
    }
    const begun = await this.repository.beginRun({
      configuration,
      mode: command.mode,
      sourceRunId: command.sourceRunId,
      idempotencyKey: command.idempotencyKey,
    });
    if (begun.idempotent) return receipt(begun.run, true);

    const canonical = await this.repository.listCanonicalRecords(event.id);
    const selected = selectRecords(canonical, command.mode, sourceRun);
    const links = await this.repository.getLinks(configuration.id);
    const counters: RunCounters = { planned: selected.length, synced: 0, skipped: 0, failed: 0, blocked: 0, providerResponded: false, requests: 0 };
    const externalReady = readiness(configuration, Boolean(provider)).ready;

    for (const record of selected) {
      if (command.mode === "preview") {
        await this.previewRecord(begun.run.id, record, configuration, links, event.timezone, counters);
      } else {
        await this.syncRecord(begun.run.id, record, configuration, links, event.timezone, provider, externalReady, counters);
      }
    }
    const completed = await this.repository.completeRun(begun.run.id, completion(counters));
    return receipt(completed, false);
  }

  private async previewRecord(
    runId: string,
    canonical: CanonicalAcceleventsRecord,
    configuration: AcceleventsConfiguration,
    links: Map<string, AcceleventsRecordLink>,
    timezone: string,
    counters: RunCounters,
  ) {
    if (!externalReady || !provider || !configuration.externalEventUrl) {
      const missing = readiness(configuration, Boolean(provider)).missing;
      const message = `Accelevents is blocked: ${missing.join(", ")}.`;
      const fingerprint = `blocked:${canonical.entityType}:${canonical.canonicalId}`;
      const record = await this.repository.createSyncRecord({
        runId,
        entityType: canonical.entityType,
        canonicalId: canonical.canonicalId,
        operation: "validate",
        fingerprint,
        idempotencyKey: fingerprint,
        requestMetadata: { payloadFields: [], dryRun: false },
      });
      await this.repository.finishSyncRecord(record.id, { status: "blocked_external", errorCode: "accelevents_not_configured", errorMessage: message });
      await this.repository.appendAttempt(record.id, {
        status: "blocked_external",
        providerResponded: false,
        errorCode: "accelevents_not_configured",
        errorMessage: message,
        requestMetadata: { missing },
      });
      counters.failed += 1;
      counters.blocked += 1;
      return;
    }
    const mapped = await mapCanonicalRecord(canonical, configuration, links, timezone);
    const record = await this.repository.createSyncRecord({
      runId,
      entityType: mapped.entityType,
      canonicalId: mapped.canonicalId,
      externalId: mapped.externalId,
      operation: mapped.operation,
      fingerprint: mapped.fingerprint,
      idempotencyKey: `${mapped.entityType}:${mapped.canonicalId}:${mapped.fingerprint}`,
      status: mapped.errors.length ? "failed" : mapped.operation === "skip" ? "skipped" : "previewed",
      errorCode: mapped.errors[0]?.code,
      errorMessage: mapped.errors.map((error) => error.message).join(" ") || undefined,
      requestMetadata: { payloadFields: Object.keys(mapped.payload).sort(), dryRun: true },
    });
    await this.repository.appendAttempt(record.id, {
      status: "not_sent",
      providerResponded: false,
      errorCode: mapped.errors[0]?.code,
      errorMessage: mapped.errors.map((error) => error.message).join(" ") || undefined,
      requestMetadata: { dryRun: true, operation: mapped.operation },
    });
    if (mapped.errors.length) counters.failed += 1;
    else if (mapped.operation === "skip") counters.skipped += 1;
    else {
      counters.synced += 1;
      if (canonical.entityType === "speaker" && !links.has(linkKey("speaker", canonical.canonicalId))) {
        links.set(linkKey("speaker", canonical.canonicalId), {
          entityType: "speaker",
          canonicalId: canonical.canonicalId,
          externalId: `preview-${canonical.canonicalId}`,
          canonicalFingerprint: mapped.fingerprint,
        });
      }
    }
  }

  private async syncRecord(
    runId: string,
    canonical: CanonicalAcceleventsRecord,
    configuration: AcceleventsConfiguration,
    links: Map<string, AcceleventsRecordLink>,
    timezone: string,
    provider: AcceleventsProviderPort | undefined,
    externalReady: boolean,
    counters: RunCounters,
  ) {
    const mapped = await mapCanonicalRecord(canonical, configuration, links, timezone);
    const record = await this.repository.createSyncRecord({
      runId,
      entityType: mapped.entityType,
      canonicalId: mapped.canonicalId,
      externalId: mapped.externalId,
      operation: mapped.operation,
      fingerprint: mapped.fingerprint,
      idempotencyKey: `${mapped.entityType}:${mapped.canonicalId}:${mapped.fingerprint}`,
      requestMetadata: { payloadFields: Object.keys(mapped.payload).sort(), dryRun: false },
    });
    if (mapped.errors.length) {
      const message = mapped.errors.map((error) => error.message).join(" ");
      await this.repository.finishSyncRecord(record.id, { status: "failed", errorCode: mapped.errors[0]?.code, errorMessage: message });
      await this.repository.appendAttempt(record.id, { status: "not_sent", providerResponded: false, errorCode: mapped.errors[0]?.code, errorMessage: message });
      counters.failed += 1;
      return;
    }
    if (mapped.operation === "skip") {
      await this.repository.finishSyncRecord(record.id, { status: "skipped", externalId: mapped.externalId });
      await this.repository.appendAttempt(record.id, { status: "not_sent", providerResponded: false, requestMetadata: { reason: "fingerprint_unchanged" } });
      counters.skipped += 1;
      return;
    }
    try {
      const result = await provider.upsert({
        eventUrl: configuration.externalEventUrl,
        entityType: mapped.entityType,
        externalId: mapped.externalId,
        payload: mapped.payload,
      });
      await this.repository.upsertLink({
        configurationId: configuration.id,
        entityType: mapped.entityType,
        canonicalId: mapped.canonicalId,
        externalId: result.externalId,
        canonicalFingerprint: mapped.fingerprint,
      });
      links.set(linkKey(mapped.entityType, mapped.canonicalId), {
        entityType: mapped.entityType,
        canonicalId: mapped.canonicalId,
        externalId: result.externalId,
        canonicalFingerprint: mapped.fingerprint,
      });
      await this.repository.finishSyncRecord(record.id, { status: "synced", externalId: result.externalId, responseMetadata: result.responseMetadata });
      await this.repository.appendAttempt(record.id, {
        status: "succeeded",
        providerResponded: true,
        httpStatus: result.httpStatus,
        providerRequestId: result.requestId,
        responseMetadata: result.responseMetadata,
      });
      counters.synced += 1;
      counters.providerResponded = true;
      counters.requests += result.requestCount;
    } catch (error) {
      const failure = normalizeProviderError(error);
      await this.repository.finishSyncRecord(record.id, { status: "failed", errorCode: failure.code, errorMessage: failure.message, responseMetadata: failure.responseMetadata });
      await this.repository.appendAttempt(record.id, {
        status: "failed",
        providerResponded: failure.providerResponded,
        httpStatus: failure.httpStatus,
        providerRequestId: failure.requestId,
        errorCode: failure.code,
        errorMessage: failure.message,
        responseMetadata: failure.responseMetadata,
      });
      counters.failed += 1;
      counters.providerResponded ||= failure.providerResponded;
      counters.requests += failure.attempts;
    }
  }

  private async requireOrganizer(actor: Actor, eventSlug: string) {
    const event = await this.repository.findEventBySlug(eventSlug);
    if (!actorCanAccessEvent(actor, event.id, "organizer")) throw new AcceleventsIntegrationError("forbidden", "Organizer access is required for this event integration.");
    return event;
  }
}

function readiness(configuration: AcceleventsConfiguration, tokenAvailable: boolean) {
  const missing: string[] = [];
  if (!configuration.enabled) missing.push("integration_disabled");
  if (!configuration.externalEventUrl) missing.push("external_event_url");
  if (!configuration.mappings.some((mapping) => mapping.entityType === "speaker" && mapping.enabled)) missing.push("speaker_field_mappings");
  if (!configuration.mappings.some((mapping) => mapping.entityType === "session" && mapping.enabled)) missing.push("session_field_mappings");
  if (!tokenAvailable) missing.push("ACCELEVENTS_API_TOKEN");
  return { ready: missing.length === 0, tokenAvailable, missing };
}

function availableReferences(records: CanonicalAcceleventsRecord[]) {
  const references = new Map<string, { referenceType: "track" | "format"; canonicalId: string; canonicalLabel: string }>();
  for (const record of records) {
    if (record.entityType !== "session") continue;
    if (record.track) references.set(`track:${record.track.id}`, { referenceType: "track", canonicalId: record.track.id, canonicalLabel: record.track.name });
    if (record.format) references.set(`format:${record.format.id}`, { referenceType: "format", canonicalId: record.format.id, canonicalLabel: record.format.name });
  }
  return [...references.values()].sort((left, right) => `${left.referenceType}:${left.canonicalLabel}`.localeCompare(`${right.referenceType}:${right.canonicalLabel}`));
}

function validateConfiguration(input: SaveAcceleventsConfigurationInput) {
  if (input.apiBaseUrl && input.apiBaseUrl.replace(/\/$/, "") !== "https://api.accelevents.com") {
    throw new AcceleventsIntegrationError("invalid_configuration", "Accelevents API requests must use the official HTTPS API origin.");
  }
  const keys = new Set<string>();
  for (const mapping of input.mappings) {
    if (!mapping.canonicalField.trim() || !mapping.externalField.trim()) throw new AcceleventsIntegrationError("invalid_configuration", "Field mappings cannot be blank.");
    const key = `${mapping.entityType}:${mapping.canonicalField.trim()}`;
    if (keys.has(key)) throw new AcceleventsIntegrationError("invalid_configuration", `Duplicate field mapping: ${key}.`);
    keys.add(key);
  }
  const references = new Set<string>();
  for (const mapping of input.referenceMappings) {
    const key = `${mapping.referenceType}:${mapping.canonicalId}`;
    if (references.has(key) || !mapping.externalValue.trim()) throw new AcceleventsIntegrationError("invalid_configuration", `Invalid reference mapping: ${key}.`);
    references.add(key);
  }
}

function selectRecords(records: CanonicalAcceleventsRecord[], mode: AcceleventsRunMode, sourceRun?: AcceleventsSyncRun) {
  const sorted = [...records].sort((left, right) => left.entityType === right.entityType
    ? left.canonicalId.localeCompare(right.canonicalId)
    : left.entityType === "speaker" ? -1 : 1);
  if (mode !== "retry") return sorted;
  const retryable = new Set(sourceRun?.records.filter((record) => record.status === "failed" || record.status === "blocked_external")
    .map((record) => linkKey(record.entityType, record.canonicalId)) ?? []);
  return sorted.filter((record) => retryable.has(linkKey(record.entityType, record.canonicalId)));
}

interface RunCounters {
  planned: number;
  synced: number;
  skipped: number;
  failed: number;
  blocked: number;
  providerResponded: boolean;
  requests: number;
}

function completion(counters: RunCounters) {
  const status = counters.failed === 0 ? "succeeded"
    : counters.blocked === counters.failed && counters.synced + counters.skipped === 0 ? "blocked_external"
      : counters.synced + counters.skipped > 0 ? "partial" : "failed";
  return {
    status: status as "succeeded" | "partial" | "failed" | "blocked_external",
    plannedCount: counters.planned,
    syncedCount: counters.synced,
    skippedCount: counters.skipped,
    failedCount: counters.failed,
    providerResponded: counters.providerResponded,
    providerRequestCount: counters.requests,
    failureCode: status === "blocked_external" ? "accelevents_not_configured" : counters.failed ? "record_failures" : undefined,
    failureMessage: status === "blocked_external" ? "No provider request was sent because Accelevents credentials or configuration are unavailable." : counters.failed ? `${counters.failed} record(s) failed.` : undefined,
  };
}

function receipt(run: AcceleventsSyncRun, idempotent: boolean): AcceleventsRunReceipt {
  return {
    provider: "accelevents",
    runId: run.id,
    mode: run.mode,
    status: run.status === "succeeded" ? "complete" : run.status === "partial" ? "partial_failure" : run.status === "blocked_external" ? "blocked_external" : "failed",
    planned: run.plannedCount,
    synced: run.syncedCount,
    skipped: run.skippedCount,
    failed: run.failedCount,
    providerResponded: run.providerResponded,
    providerRequestCount: run.providerRequestCount,
    idempotent,
  };
}

function normalizeProviderError(error: unknown) {
  if (error instanceof AcceleventsProviderError) {
    return {
      code: error.code,
      message: error.message,
      providerResponded: Boolean(error.metadata.httpStatus),
      httpStatus: error.metadata.httpStatus,
      requestId: error.metadata.requestId,
      attempts: error.metadata.attempts,
      responseMetadata: { retryable: error.retryable, httpStatus: error.metadata.httpStatus },
    };
  }
  return {
    code: "unexpected_provider_error",
    message: error instanceof Error ? error.message : "Accelevents request failed.",
    providerResponded: false,
    attempts: 1,
    responseMetadata: {},
  };
}
