import {
  eventFormats,
  eventSpeakers,
  eventTracks,
  events,
  people,
  sessionSpeakers,
  sessions,
  speakerProfiles,
  type Database,
} from "@programflow/database";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  airtableConfigurations,
  airtableExternalAttributes,
  airtableFieldMappings,
  airtableRecordLinks,
  airtableSyncItems,
  airtableSyncRuns,
} from "../../../../../packages/database/src/schema/integrations";
import type {
  AirtableConfigurationRecord,
  AirtableEntity,
  AirtableRecordLinkRecord,
  AirtableRunStatus,
  AirtableSyncItemRecord,
  AirtableSyncRunRecord,
  CanonicalSyncRecord,
} from "./types";
import { localValueIsNewer } from "./reconciliation";

export interface SaveAirtableConfigurationInput {
  baseId?: string | null;
  tableId?: string | null;
  credentialBinding?: string;
  modifiedTimeField?: string | null;
  enabled: boolean;
  pageSize?: number;
  mappings: Array<{
    entityType: AirtableEntity;
    localField: string;
    externalField: string;
    direction: "export" | "import" | "both";
    owner: "programflow" | "airtable";
    enabled?: boolean;
  }>;
}

export interface RecordSyncItemInput {
  runId: string;
  entityType?: AirtableEntity;
  canonicalId?: string;
  airtableRecordId?: string;
  operation: "create" | "update" | "import" | "skip" | "configuration";
  status: "synced" | "skipped" | "conflict" | "failed" | "blocked_external";
  idempotencyKey: string;
  attemptCount?: number;
  providerResponded?: boolean;
  errorCode?: string;
  errorMessage?: string;
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
}

export class AirtableIntegrationRepository {
  constructor(private readonly database: Database) {}

  async findEventBySlug(eventSlug: string) {
    const [event] = await this.database.select({
      id: events.id,
      organizationId: events.organizationId,
      slug: events.slug,
      name: events.name,
    }).from(events).where(eq(events.slug, eventSlug)).limit(1);
    if (!event) throw new AirtableRepositoryError("event_not_found", "Event not found.");
    return event;
  }

  async ensureConfiguration(event: { id: string; organizationId: string }): Promise<AirtableConfigurationRecord> {
    const [inserted] = await this.database.insert(airtableConfigurations).values({
      organizationId: event.organizationId,
      eventId: event.id,
      enabled: false,
    }).onConflictDoNothing({ target: airtableConfigurations.eventId }).returning();
    if (inserted) {
      await this.database.insert(airtableFieldMappings).values(defaultAirtableMappings.map((mapping) => ({
        configurationId: inserted.id,
        entityType: mapping.entityType,
        localField: mapping.localField,
        externalField: mapping.externalField,
        direction: mapping.direction,
        owner: mapping.owner,
        enabled: mapping.enabled ?? true,
      })));
    }
    const config = await this.loadConfiguration(event.id);
    if (!config) throw new Error("Airtable configuration insert did not produce a record.");
    return config;
  }

  async loadConfiguration(eventId: string): Promise<AirtableConfigurationRecord | null> {
    const [configuration] = await this.database.select().from(airtableConfigurations)
      .where(eq(airtableConfigurations.eventId, eventId)).limit(1);
    if (!configuration) return null;
    const mappings = await this.database.select().from(airtableFieldMappings)
      .where(eq(airtableFieldMappings.configurationId, configuration.id))
      .orderBy(asc(airtableFieldMappings.entityType), asc(airtableFieldMappings.localField));
    return { ...configuration, mappings };
  }

  async saveConfiguration(
    event: { id: string; organizationId: string },
    input: SaveAirtableConfigurationInput,
  ): Promise<AirtableConfigurationRecord> {
    await this.database.transaction(async (transaction) => {
      const [configuration] = await transaction.insert(airtableConfigurations).values({
        organizationId: event.organizationId,
        eventId: event.id,
        baseId: clean(input.baseId),
        tableId: clean(input.tableId),
        credentialBinding: input.credentialBinding?.trim() || "AIRTABLE_TOKEN",
        modifiedTimeField: clean(input.modifiedTimeField),
        enabled: input.enabled,
        pageSize: clampPageSize(input.pageSize),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: airtableConfigurations.eventId,
        set: {
          baseId: clean(input.baseId),
          tableId: clean(input.tableId),
          credentialBinding: input.credentialBinding?.trim() || "AIRTABLE_TOKEN",
          modifiedTimeField: clean(input.modifiedTimeField),
          enabled: input.enabled,
          pageSize: clampPageSize(input.pageSize),
          updatedAt: new Date(),
        },
      }).returning();
      if (!configuration) throw new Error("Airtable configuration save did not return a record.");
      await transaction.delete(airtableFieldMappings).where(eq(airtableFieldMappings.configurationId, configuration.id));
      if (input.mappings.length) {
        await transaction.insert(airtableFieldMappings).values(input.mappings.map((mapping) => ({
          configurationId: configuration.id,
          entityType: mapping.entityType,
          localField: mapping.localField.trim(),
          externalField: mapping.externalField.trim(),
          direction: mapping.direction,
          owner: mapping.owner,
          enabled: mapping.enabled ?? true,
        })));
      }
    });
    const saved = await this.loadConfiguration(event.id);
    if (!saved) throw new Error("Saved Airtable configuration could not be reloaded.");
    return saved;
  }

  async beginRun(input: {
    configuration: AirtableConfigurationRecord;
    direction: "export" | "import";
    idempotencyKey: string;
  }): Promise<{ run: AirtableSyncRunRecord; idempotent: boolean }> {
    const [inserted] = await this.database.insert(airtableSyncRuns).values({
      configurationId: input.configuration.id,
      organizationId: input.configuration.organizationId,
      eventId: input.configuration.eventId,
      direction: input.direction,
      status: "running",
      idempotencyKey: input.idempotencyKey,
      startedAt: new Date(),
    }).onConflictDoNothing({
      target: [airtableSyncRuns.configurationId, airtableSyncRuns.idempotencyKey],
    }).returning();
    if (inserted) return { run: await this.getRun(inserted.id), idempotent: false };
    const [existing] = await this.database.select({ id: airtableSyncRuns.id }).from(airtableSyncRuns).where(and(
      eq(airtableSyncRuns.configurationId, input.configuration.id),
      eq(airtableSyncRuns.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!existing) throw new Error("Idempotent Airtable run could not be loaded.");
    return { run: await this.getRun(existing.id), idempotent: true };
  }

  async completeRun(runId: string, input: {
    status: AirtableRunStatus;
    exportedCount: number;
    importedCount: number;
    failedCount: number;
    providerResponded: boolean;
    providerRequestCount: number;
    failureCode?: string;
    failureMessage?: string;
  }): Promise<AirtableSyncRunRecord> {
    await this.database.update(airtableSyncRuns).set({
      ...input,
      failureCode: input.failureCode ?? null,
      failureMessage: input.failureMessage ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(airtableSyncRuns.id, runId));
    return this.getRun(runId);
  }

  async recordItem(input: RecordSyncItemInput): Promise<void> {
    await this.database.insert(airtableSyncItems).values({
      runId: input.runId,
      entityType: input.entityType,
      canonicalId: input.canonicalId,
      airtableRecordId: input.airtableRecordId,
      operation: input.operation,
      status: input.status,
      idempotencyKey: input.idempotencyKey,
      attemptCount: input.attemptCount ?? 1,
      providerResponded: input.providerResponded ?? false,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      requestMetadata: input.requestMetadata ?? {},
      responseMetadata: input.responseMetadata ?? {},
    }).onConflictDoNothing({ target: [airtableSyncItems.runId, airtableSyncItems.idempotencyKey] });
  }

  async listRecentRuns(eventId: string, limit = 10): Promise<AirtableSyncRunRecord[]> {
    const rows = await this.database.select({ id: airtableSyncRuns.id }).from(airtableSyncRuns)
      .where(eq(airtableSyncRuns.eventId, eventId)).orderBy(desc(airtableSyncRuns.createdAt)).limit(limit);
    return Promise.all(rows.map((row) => this.getRun(row.id)));
  }

  async getLinks(configurationId: string): Promise<Map<string, AirtableRecordLinkRecord>> {
    const rows = await this.database.select().from(airtableRecordLinks)
      .where(eq(airtableRecordLinks.configurationId, configurationId));
    return new Map(rows.map((row) => [`${row.entityType}:${row.canonicalId}`, row]));
  }

  async upsertLink(input: {
    configurationId: string;
    entityType: AirtableEntity;
    canonicalId: string;
    airtableRecordId: string;
    canonicalRevision?: number;
    canonicalFingerprint?: string;
    externalModifiedAt?: Date;
  }): Promise<void> {
    await this.database.insert(airtableRecordLinks).values({
      ...input,
      canonicalRevision: input.canonicalRevision,
      canonicalFingerprint: input.canonicalFingerprint,
      externalModifiedAt: input.externalModifiedAt,
      lastSyncedAt: new Date(),
    }).onConflictDoUpdate({
      target: [airtableRecordLinks.configurationId, airtableRecordLinks.entityType, airtableRecordLinks.canonicalId],
      set: {
        airtableRecordId: input.airtableRecordId,
        canonicalRevision: input.canonicalRevision,
        canonicalFingerprint: input.canonicalFingerprint,
        externalModifiedAt: input.externalModifiedAt,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async applyExternalAttributes(input: {
    configurationId: string;
    entityType: AirtableEntity;
    canonicalId: string;
    airtableRecordId: string;
    externalModifiedAt: Date;
    attributes: Record<string, unknown>;
  }): Promise<"applied" | "local_newer"> {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction.select().from(airtableExternalAttributes).where(and(
        eq(airtableExternalAttributes.configurationId, input.configurationId),
        eq(airtableExternalAttributes.entityType, input.entityType),
        eq(airtableExternalAttributes.canonicalId, input.canonicalId),
      )).limit(1).for("update");
      if (existing && localValueIsNewer(existing.updatedAt, input.externalModifiedAt)) return "local_newer";
      await transaction.insert(airtableExternalAttributes).values({
        ...input,
        revision: 1,
      }).onConflictDoUpdate({
        target: [airtableExternalAttributes.configurationId, airtableExternalAttributes.entityType, airtableExternalAttributes.canonicalId],
        set: {
          airtableRecordId: input.airtableRecordId,
          attributes: input.attributes,
          externalModifiedAt: input.externalModifiedAt,
          revision: (existing?.revision ?? 0) + 1,
          updatedAt: new Date(),
        },
      });
      return "applied";
    });
  }

  async listCanonicalRecords(eventId: string): Promise<CanonicalSyncRecord[]> {
    const [speakerRows, sessionRows, sessionSpeakerRows] = await Promise.all([
      this.database.select({
        eventSpeakerId: eventSpeakers.id,
        personId: people.id,
        displayName: people.displayName,
        email: people.canonicalEmail,
        status: eventSpeakers.status,
        logistics: eventSpeakers.logistics,
        biography: speakerProfiles.biography,
        company: speakerProfiles.company,
        jobTitle: speakerProfiles.jobTitle,
        speakerUpdatedAt: eventSpeakers.updatedAt,
        profileUpdatedAt: speakerProfiles.updatedAt,
      }).from(eventSpeakers)
        .innerJoin(people, eq(people.id, eventSpeakers.personId))
        .leftJoin(speakerProfiles, eq(speakerProfiles.personId, people.id))
        .where(eq(eventSpeakers.eventId, eventId)),
      this.database.select({
        id: sessions.id,
        title: sessions.title,
        abstract: sessions.abstract,
        contentStatus: sessions.contentStatus,
        track: eventTracks.name,
        format: eventFormats.name,
        revision: sessions.revision,
        updatedAt: sessions.updatedAt,
      }).from(sessions)
        .leftJoin(eventTracks, eq(eventTracks.id, sessions.trackId))
        .leftJoin(eventFormats, eq(eventFormats.id, sessions.formatId))
        .where(eq(sessions.eventId, eventId)),
      this.database.select({
        sessionId: sessionSpeakers.sessionId,
        displayName: people.displayName,
      }).from(sessionSpeakers)
        .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
        .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
        .innerJoin(people, eq(people.id, eventSpeakers.personId))
        .where(eq(sessions.eventId, eventId)),
    ]);
    const peopleRecords = new Map<string, CanonicalSyncRecord>();
    const speakers = speakerRows.map((row): CanonicalSyncRecord => {
      const updatedAt = latest(row.speakerUpdatedAt, row.profileUpdatedAt);
      const common = {
        displayName: row.displayName,
        email: row.email,
        biography: row.biography ?? "",
        company: row.company ?? "",
        jobTitle: row.jobTitle ?? "",
      };
      peopleRecords.set(row.personId, {
        entityType: "person",
        canonicalId: row.personId,
        revision: 1,
        updatedAt,
        fields: common,
      });
      return {
        entityType: "speaker",
        canonicalId: row.eventSpeakerId,
        revision: 1,
        updatedAt,
        fields: { ...common, status: row.status, logistics: row.logistics, personId: row.personId },
      };
    });
    const program = sessionRows.map((row): CanonicalSyncRecord => ({
      entityType: "session",
      canonicalId: row.id,
      revision: row.revision,
      updatedAt: row.updatedAt,
      fields: {
        title: row.title,
        abstract: row.abstract,
        contentStatus: row.contentStatus,
        track: row.track,
        format: row.format,
        speakerNames: sessionSpeakerRows.filter((speaker) => speaker.sessionId === row.id).map((speaker) => speaker.displayName).join(", "),
      },
    }));
    return [...peopleRecords.values(), ...speakers, ...program]
      .sort((left, right) => `${left.entityType}:${left.canonicalId}`.localeCompare(`${right.entityType}:${right.canonicalId}`));
  }

  async canonicalRecordExists(eventId: string, entityType: AirtableEntity, canonicalId: string): Promise<boolean> {
    const records = await this.listCanonicalRecords(eventId);
    return records.some((record) => record.entityType === entityType && record.canonicalId === canonicalId);
  }

  private async getRun(runId: string): Promise<AirtableSyncRunRecord> {
    const [run] = await this.database.select().from(airtableSyncRuns).where(eq(airtableSyncRuns.id, runId)).limit(1);
    if (!run) throw new AirtableRepositoryError("run_not_found", "Airtable synchronization run not found.");
    const items = await this.database.select().from(airtableSyncItems)
      .where(eq(airtableSyncItems.runId, runId)).orderBy(asc(airtableSyncItems.createdAt));
    return { ...run, items: items.map(serializeItem) };
  }
}

export class AirtableRepositoryError extends Error {
  constructor(readonly code: "event_not_found" | "run_not_found", message: string) { super(message); }
}

export const defaultAirtableMappings: SaveAirtableConfigurationInput["mappings"] = [
  { entityType: "person", localField: "displayName", externalField: "Name", direction: "export", owner: "programflow" },
  { entityType: "person", localField: "email", externalField: "Email", direction: "export", owner: "programflow" },
  { entityType: "person", localField: "researchNotes", externalField: "ProgramFlow notes", direction: "import", owner: "airtable" },
  { entityType: "speaker", localField: "displayName", externalField: "Speaker name", direction: "export", owner: "programflow" },
  { entityType: "speaker", localField: "company", externalField: "Company", direction: "export", owner: "programflow" },
  { entityType: "speaker", localField: "jobTitle", externalField: "Job title", direction: "export", owner: "programflow" },
  { entityType: "speaker", localField: "organizerTags", externalField: "Organizer tags", direction: "import", owner: "airtable" },
  { entityType: "session", localField: "title", externalField: "Session title", direction: "export", owner: "programflow" },
  { entityType: "session", localField: "abstract", externalField: "Abstract", direction: "export", owner: "programflow" },
  { entityType: "session", localField: "track", externalField: "Track", direction: "export", owner: "programflow" },
  { entityType: "session", localField: "airtableReview", externalField: "Airtable review", direction: "import", owner: "airtable" },
];

function serializeItem(item: typeof airtableSyncItems.$inferSelect): AirtableSyncItemRecord {
  return { ...item };
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function clampPageSize(value: number | undefined): number {
  return Math.max(1, Math.min(100, value ?? 100));
}

function latest(left: Date, right: Date | null): Date {
  return right && right > left ? right : left;
}
