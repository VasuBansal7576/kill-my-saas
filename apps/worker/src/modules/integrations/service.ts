import { RunAirtableSyncCommandSchema, type RunAirtableSyncCommand } from "@programflow/contracts";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import { AirtableProviderError } from "./airtable-adapter";
import {
  defaultAirtableMappings,
  type AirtableIntegrationRepository,
  type SaveAirtableConfigurationInput,
} from "./repository";
import {
  mapAirtableAugmentation,
  mapCanonicalRecord,
  readCanonicalIdentity,
  readExternalModifiedAt,
} from "./reconciliation";
import type {
  AirtableConfigurationRecord,
  AirtableProviderPort,
  AirtableRecord,
  AirtableRunResult,
  AirtableSyncRunRecord,
  AirtableWorkspace,
  CanonicalSyncRecord,
} from "./types";

type AirtableIntegrationErrorCode = "forbidden" | "invalid_event" | "invalid_configuration" | "invalid_command";

export class AirtableIntegrationError extends Error {
  constructor(readonly code: AirtableIntegrationErrorCode, message: string) { super(message); }
}

export class AirtableIntegrationService {
  constructor(private readonly repository: AirtableRepositoryPort) {}

  async getWorkspace(actor: Actor, eventSlug: string, tokenAvailable: boolean): Promise<AirtableWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    const configuration = await this.repository.ensureConfiguration(event);
    const recentRuns = await this.repository.listRecentRuns(event.id);
    return {
      event,
      configuration,
      readiness: readiness(configuration, tokenAvailable),
      lastRun: recentRuns[0] ?? null,
      recentRuns,
    };
  }

  async saveConfiguration(
    actor: Actor,
    eventSlug: string,
    input: SaveAirtableConfigurationInput,
    tokenAvailable: boolean,
  ): Promise<AirtableWorkspace> {
    const event = await this.requireOrganizer(actor, eventSlug);
    validateMappings(input.mappings);
    await this.repository.saveConfiguration(event, {
      ...input,
      mappings: input.mappings.length ? input.mappings : defaultAirtableMappings,
    });
    return this.getWorkspace(actor, eventSlug, tokenAvailable);
  }

  async run(
    actor: Actor,
    eventSlug: string,
    unsafeCommand: unknown,
    provider?: AirtableProviderPort,
  ): Promise<AirtableRunResult> {
    const parsed = RunAirtableSyncCommandSchema.safeParse(unsafeCommand);
    if (!parsed.success) throw new AirtableIntegrationError("invalid_command", "The Airtable synchronization command is invalid.");
    const command = parsed.data;
    const event = await this.requireOrganizer(actor, eventSlug);
    if (command.organizationId !== event.organizationId || (command.eventId && command.eventId !== event.id)) {
      throw new AirtableIntegrationError("invalid_event", "The Airtable command does not belong to this event.");
    }
    const configuration = await this.repository.ensureConfiguration(event);
    const begun = await this.repository.beginRun({ configuration, direction: command.direction, idempotencyKey: command.idempotencyKey });
    if (begun.idempotent) return toReceipt(begun.run, true);

    const missing = readiness(configuration, Boolean(provider)).missing.filter((item) =>
      command.direction === "export" ? item !== "modified_time_field" && item !== "import_mapping" : item !== "export_mapping",
    );
    if (missing.length) {
      await this.repository.recordItem({
        runId: begun.run.id,
        operation: "configuration",
        status: "blocked_external",
        idempotencyKey: "configuration",
        errorCode: "airtable_not_configured",
        errorMessage: `Airtable sync is blocked: ${missing.join(", ")}.`,
        requestMetadata: { missing },
      });
      const blocked = await this.repository.completeRun(begun.run.id, {
        status: "blocked_external",
        exportedCount: 0,
        importedCount: 0,
        failedCount: 1,
        providerResponded: false,
        providerRequestCount: 0,
        failureCode: "airtable_not_configured",
        failureMessage: `Missing Airtable configuration: ${missing.join(", ")}.`,
      });
      return toReceipt(blocked, false);
    }
    if (!provider || !configuration.baseId || !configuration.tableId) {
      throw new Error("Airtable readiness permitted a run without its required provider boundary.");
    }

    return command.direction === "export"
      ? this.exportRecords(configuration, begun.run, provider)
      : this.importRecords(configuration, begun.run, provider);
  }

  private async exportRecords(
    configuration: AirtableConfigurationRecord,
    run: AirtableSyncRunRecord,
    provider: AirtableProviderPort,
  ): Promise<AirtableRunResult> {
    const state = counters();
    try {
      const canonical = await this.repository.listCanonicalRecords(configuration.eventId);
      const canonicalKeys = new Set(canonical.map(key));
      const external = await listAll(provider, configuration, state);
      for (const record of external) {
        const identity = readCanonicalIdentity(record);
        if (!identity || !canonicalKeys.has(`${identity.entityType}:${identity.canonicalId}`)) continue;
        await this.repository.upsertLink({
          configurationId: configuration.id,
          ...identity,
          airtableRecordId: record.id,
          externalModifiedAt: readExternalModifiedAt(record, configuration.modifiedTimeField) ?? undefined,
        });
      }
      const links = await this.repository.getLinks(configuration.id);
      const creates = canonical.filter((record) => !links.has(key(record))).map((record) => ({ record }));
      const updates = canonical.flatMap((record) => {
        const link = links.get(key(record));
        return link ? [{ record, airtableRecordId: link.airtableRecordId }] : [];
      });
      for (const batch of chunks(creates, 10)) {
        await this.exportCreateBatch(configuration, run.id, provider, batch.map((item) => item.record), state);
      }
      for (const batch of chunks(updates, 10)) {
        await this.exportUpdateBatch(configuration, run.id, provider, batch, state);
      }
    } catch (error) {
      await this.recordProviderFailure(run.id, "export-provider", error, state);
    }
    return this.finish(run.id, state, "export");
  }

  private async exportCreateBatch(
    configuration: AirtableConfigurationRecord,
    runId: string,
    provider: AirtableProviderPort,
    records: CanonicalSyncRecord[],
    state: RunCounters,
  ) {
    try {
      const result = await provider.create({
        baseId: configuration.baseId!,
        tableId: configuration.tableId!,
        records: records.map((record) => ({ fields: mapCanonicalRecord(record, configuration) })),
      });
      observe(state, result.requestCount);
      for (const [index, record] of records.entries()) {
        const response = result.records[index];
        if (!response) continue;
        const canonicalFingerprint = await fingerprint(mapCanonicalRecord(record, configuration));
        await this.repository.upsertLink({
          configurationId: configuration.id,
          entityType: record.entityType,
          canonicalId: record.canonicalId,
          airtableRecordId: response.id,
          canonicalRevision: record.revision,
          canonicalFingerprint,
        });
        await this.repository.recordItem(successItem(runId, record, response.id, "create", canonicalFingerprint));
        state.exported += 1;
      }
    } catch (error) {
      addProviderAttempts(state, error);
      for (const record of records) await this.recordRowFailure(runId, record, "create", error, state);
    }
  }

  private async exportUpdateBatch(
    configuration: AirtableConfigurationRecord,
    runId: string,
    provider: AirtableProviderPort,
    records: Array<{ record: CanonicalSyncRecord; airtableRecordId: string }>,
    state: RunCounters,
  ) {
    try {
      const result = await provider.update({
        baseId: configuration.baseId!,
        tableId: configuration.tableId!,
        records: records.map(({ record, airtableRecordId }) => ({ id: airtableRecordId, fields: mapCanonicalRecord(record, configuration) })),
      });
      observe(state, result.requestCount);
      for (const [index, item] of records.entries()) {
        const response = result.records[index];
        if (!response) continue;
        const canonicalFingerprint = await fingerprint(mapCanonicalRecord(item.record, configuration));
        await this.repository.upsertLink({
          configurationId: configuration.id,
          entityType: item.record.entityType,
          canonicalId: item.record.canonicalId,
          airtableRecordId: response.id,
          canonicalRevision: item.record.revision,
          canonicalFingerprint,
        });
        await this.repository.recordItem(successItem(runId, item.record, response.id, "update", canonicalFingerprint));
        state.exported += 1;
      }
    } catch (error) {
      addProviderAttempts(state, error);
      for (const item of records) await this.recordRowFailure(runId, item.record, "update", error, state, item.airtableRecordId);
    }
  }

  private async importRecords(
    configuration: AirtableConfigurationRecord,
    run: AirtableSyncRunRecord,
    provider: AirtableProviderPort,
  ): Promise<AirtableRunResult> {
    const state = counters();
    try {
      const canonical = await this.repository.listCanonicalRecords(configuration.eventId);
      const canonicalKeys = new Set(canonical.map(key));
      const records = await listAll(provider, configuration, state);
      for (const record of records) await this.importRecord(configuration, run.id, record, canonicalKeys, state);
    } catch (error) {
      await this.recordProviderFailure(run.id, "import-provider", error, state);
    }
    return this.finish(run.id, state, "import");
  }

  private async importRecord(
    configuration: AirtableConfigurationRecord,
    runId: string,
    record: AirtableRecord,
    canonicalKeys: ReadonlySet<string>,
    state: RunCounters,
  ) {
    const identity = readCanonicalIdentity(record);
    if (!identity) {
      await this.repository.recordItem({
        runId,
        airtableRecordId: record.id,
        operation: "skip",
        status: "failed",
        providerResponded: true,
        idempotencyKey: `invalid:${record.id}`,
        errorCode: "canonical_identifier_invalid",
        errorMessage: "Airtable row is missing a valid _programflow_id or _programflow_type.",
      });
      state.failed += 1;
      return;
    }
    if (!canonicalKeys.has(`${identity.entityType}:${identity.canonicalId}`)) {
      await this.repository.recordItem({
        runId,
        ...identity,
        airtableRecordId: record.id,
        operation: "skip",
        status: "failed",
        providerResponded: true,
        idempotencyKey: `missing:${record.id}`,
        errorCode: "canonical_record_not_found",
        errorMessage: "The Airtable row does not identify a canonical record in this event.",
      });
      state.failed += 1;
      return;
    }
    const externalModifiedAt = readExternalModifiedAt(record, configuration.modifiedTimeField);
    if (!externalModifiedAt) {
      await this.repository.recordItem({
        runId,
        ...identity,
        airtableRecordId: record.id,
        operation: "import",
        status: "failed",
        providerResponded: true,
        idempotencyKey: `modified-time:${record.id}`,
        errorCode: "external_modified_time_missing",
        errorMessage: `Airtable row does not contain a valid ${configuration.modifiedTimeField} value.`,
      });
      state.failed += 1;
      return;
    }
    const attributes = mapAirtableAugmentation(record, identity.entityType, configuration);
    if (!Object.keys(attributes).length) {
      await this.repository.recordItem({
        runId,
        ...identity,
        airtableRecordId: record.id,
        operation: "skip",
        status: "skipped",
        providerResponded: true,
        idempotencyKey: `no-augmentation:${record.id}`,
        responseMetadata: { externalModifiedAt: externalModifiedAt.toISOString() },
      });
      return;
    }
    const outcome = await this.repository.applyExternalAttributes({
      configurationId: configuration.id,
      ...identity,
      airtableRecordId: record.id,
      externalModifiedAt,
      attributes,
    });
    if (outcome === "local_newer") {
      await this.repository.recordItem({
        runId,
        ...identity,
        airtableRecordId: record.id,
        operation: "import",
        status: "conflict",
        providerResponded: true,
        idempotencyKey: `conflict:${record.id}`,
        errorCode: "local_value_newer",
        errorMessage: "A newer local augmentation was retained; Airtable did not overwrite it.",
        requestMetadata: { attributeKeys: Object.keys(attributes) },
        responseMetadata: { externalModifiedAt: externalModifiedAt.toISOString() },
      });
      state.failed += 1;
      return;
    }
    await this.repository.upsertLink({
      configurationId: configuration.id,
      ...identity,
      airtableRecordId: record.id,
      externalModifiedAt,
    });
    await this.repository.recordItem({
      runId,
      ...identity,
      airtableRecordId: record.id,
      operation: "import",
      status: "synced",
      providerResponded: true,
      idempotencyKey: `import:${record.id}`,
      requestMetadata: { attributeKeys: Object.keys(attributes) },
      responseMetadata: { externalModifiedAt: externalModifiedAt.toISOString() },
    });
    state.imported += 1;
  }

  private async recordRowFailure(
    runId: string,
    record: CanonicalSyncRecord,
    operation: "create" | "update",
    error: unknown,
    state: RunCounters,
    airtableRecordId?: string,
  ) {
    const failure = providerDetails(error);
    await this.repository.recordItem({
      runId,
      entityType: record.entityType,
      canonicalId: record.canonicalId,
      airtableRecordId,
      operation,
      status: "failed",
      idempotencyKey: `${operation}:${record.entityType}:${record.canonicalId}`,
      attemptCount: failure.attempts,
      providerResponded: failure.providerResponded,
      errorCode: failure.code,
      errorMessage: failure.message,
      requestMetadata: { fieldNames: Object.keys(record.fields), revision: record.revision },
      responseMetadata: failure.metadata,
    });
    state.failed += 1;
    state.providerResponded ||= failure.providerResponded;
  }

  private async recordProviderFailure(runId: string, idempotencyKey: string, error: unknown, state: RunCounters) {
    const failure = providerDetails(error);
    addProviderAttempts(state, error);
    state.providerResponded ||= failure.providerResponded;
    state.failed += 1;
    state.failureCode = failure.code;
    state.failureMessage = failure.message;
    await this.repository.recordItem({
      runId,
      operation: "configuration",
      status: "failed",
      idempotencyKey,
      attemptCount: failure.attempts,
      providerResponded: failure.providerResponded,
      errorCode: failure.code,
      errorMessage: failure.message,
      responseMetadata: failure.metadata,
    });
  }

  private async finish(runId: string, state: RunCounters, direction: "export" | "import") {
    const succeeded = direction === "export" ? state.exported : state.imported;
    const status = state.failed === 0 && state.providerResponded
      ? "succeeded"
      : succeeded > 0 ? "partial" : "failed";
    const completed = await this.repository.completeRun(runId, {
      status,
      exportedCount: state.exported,
      importedCount: state.imported,
      failedCount: state.failed,
      providerResponded: state.providerResponded,
      providerRequestCount: state.providerRequestCount,
      failureCode: state.failureCode ?? (status === "failed" && !state.providerResponded ? "provider_response_missing" : undefined),
      failureMessage: state.failureMessage ?? (status === "failed" && !state.providerResponded ? "No Airtable provider response was observed." : undefined),
    });
    return toReceipt(completed, false);
  }

  private async requireOrganizer(actor: Actor, eventSlug: string) {
    const event = await this.repository.findEventBySlug(eventSlug);
    if (!actorCanAccessEvent(actor, event.id, "organizer")) {
      throw new AirtableIntegrationError("forbidden", "Organizer access is required for this event's Airtable integration.");
    }
    return event;
  }
}

function readiness(configuration: AirtableConfigurationRecord, tokenAvailable: boolean): AirtableWorkspace["readiness"] {
  const missing: string[] = [];
  if (!configuration.enabled) missing.push("integration_disabled");
  if (!configuration.baseId) missing.push("base_id");
  if (!configuration.tableId) missing.push("table_id");
  if (!configuration.credentialBinding || !tokenAvailable) missing.push("token_binding");
  if (!configuration.modifiedTimeField) missing.push("modified_time_field");
  if (!configuration.mappings.some((mapping) => mapping.enabled && mapping.owner === "programflow" && ["export", "both"].includes(mapping.direction))) missing.push("export_mapping");
  if (!configuration.mappings.some((mapping) => mapping.enabled && mapping.owner === "airtable" && ["import", "both"].includes(mapping.direction))) missing.push("import_mapping");
  return {
    exportReady: !missing.some((item) => item !== "modified_time_field" && item !== "import_mapping"),
    importReady: !missing.some((item) => item !== "export_mapping"),
    tokenAvailable,
    missing,
  };
}

function validateMappings(mappings: SaveAirtableConfigurationInput["mappings"]) {
  const local = new Set<string>();
  const external = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping.localField.trim() || !mapping.externalField.trim()) {
      throw new AirtableIntegrationError("invalid_configuration", "Every Airtable mapping requires local and external field names.");
    }
    const localKey = `${mapping.entityType}:${mapping.localField.trim()}`;
    const externalKey = `${mapping.entityType}:${mapping.externalField.trim()}`;
    if (local.has(localKey) || external.has(externalKey)) {
      throw new AirtableIntegrationError("invalid_configuration", "Airtable mappings must be unique per entity and field.");
    }
    local.add(localKey); external.add(externalKey);
    if ((mapping.direction === "import" || mapping.direction === "both") && mapping.owner !== "airtable") {
      throw new AirtableIntegrationError("invalid_configuration", "Imported mappings must be Airtable-owned augmentation fields.");
    }
  }
}

async function listAll(provider: AirtableProviderPort, configuration: AirtableConfigurationRecord, state: RunCounters) {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const page = await provider.listPage({
      baseId: configuration.baseId!,
      tableId: configuration.tableId!,
      pageSize: configuration.pageSize,
      offset,
    });
    observe(state, page.requestCount);
    records.push(...page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

function successItem(
  runId: string,
  record: CanonicalSyncRecord,
  airtableRecordId: string,
  operation: "create" | "update",
  canonicalFingerprint: string,
) {
  return {
    runId,
    entityType: record.entityType,
    canonicalId: record.canonicalId,
    airtableRecordId,
    operation,
    status: "synced" as const,
    idempotencyKey: `${operation}:${record.entityType}:${record.canonicalId}`,
    providerResponded: true,
    requestMetadata: { revision: record.revision, fieldNames: Object.keys(record.fields) },
    responseMetadata: { canonicalFingerprint },
  };
}

function toReceipt(run: AirtableSyncRunRecord, idempotent: boolean): AirtableRunResult {
  return {
    provider: "airtable",
    runId: run.id,
    status: run.status === "succeeded" ? "complete" : run.status === "blocked_external" ? "blocked_external" : "partial_failure",
    exported: run.exportedCount,
    imported: run.importedCount,
    failed: run.failedCount,
    providerResponded: run.providerResponded,
    providerRequestCount: run.providerRequestCount,
    idempotent,
  };
}

interface RunCounters {
  exported: number;
  imported: number;
  failed: number;
  providerResponded: boolean;
  providerRequestCount: number;
  failureCode?: string;
  failureMessage?: string;
}

function counters(): RunCounters {
  return { exported: 0, imported: 0, failed: 0, providerResponded: false, providerRequestCount: 0 };
}

function observe(state: RunCounters, requestCount: number) {
  state.providerResponded = true;
  state.providerRequestCount += requestCount;
}

function addProviderAttempts(state: RunCounters, error: unknown) {
  const attempts = providerDetails(error).attempts;
  state.providerRequestCount += attempts;
}

function providerDetails(error: unknown) {
  if (error instanceof AirtableProviderError) {
    const attempts = typeof error.metadata.attempts === "number" ? error.metadata.attempts : 1;
    return {
      code: error.code,
      message: error.message,
      attempts,
      providerResponded: typeof error.metadata.httpStatus === "number",
      metadata: error.metadata,
    };
  }
  return {
    code: "airtable_request_failed",
    message: error instanceof Error ? error.message : "Airtable request failed.",
    attempts: 1,
    providerResponded: false,
    metadata: {},
  };
}

function key(record: CanonicalSyncRecord) {
  return `${record.entityType}:${record.canonicalId}`;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fingerprint(value: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type { RunAirtableSyncCommand };

export type AirtableRepositoryPort = Pick<AirtableIntegrationRepository,
  | "findEventBySlug"
  | "ensureConfiguration"
  | "listRecentRuns"
  | "saveConfiguration"
  | "beginRun"
  | "completeRun"
  | "recordItem"
  | "listCanonicalRecords"
  | "getLinks"
  | "upsertLink"
  | "applyExternalAttributes"
>;
