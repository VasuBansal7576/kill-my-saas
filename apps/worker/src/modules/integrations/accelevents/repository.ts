import type { Database } from "@programflow/database";
import {
  acceleventsConfigurations,
  acceleventsFieldMappings,
  acceleventsRecordAttempts,
  acceleventsRecordLinks,
  acceleventsReferenceMappings,
  acceleventsSyncRecords,
  acceleventsSyncRuns,
  eventFormats,
  eventRooms,
  eventSpeakers,
  eventTracks,
  events,
  people,
  placements,
  scheduleRevisions,
  sessionSpeakers,
  sessions,
  speakerProfiles,
} from "@programflow/database";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { defaultAcceleventsMappings } from "./mapping";
import type {
  AcceleventsConfiguration,
  AcceleventsEntity,
  AcceleventsRecordLink,
  AcceleventsRunMode,
  AcceleventsRunStatus,
  AcceleventsSyncRecord,
  AcceleventsSyncRun,
  CanonicalAcceleventsRecord,
} from "./types";

export interface SaveAcceleventsConfigurationInput {
  externalEventUrl?: string | null;
  apiBaseUrl?: string;
  credentialBinding?: "ACCELEVENTS_API_TOKEN";
  authorizationHeader?: "Authorization" | "Key";
  enabled: boolean;
  mappings: AcceleventsConfiguration["mappings"];
  referenceMappings: AcceleventsConfiguration["referenceMappings"];
}

export interface AcceleventsRepositoryPort {
  findEventBySlug(eventSlug: string): Promise<{ id: string; organizationId: string; slug: string; name: string; timezone: string }>;
  ensureConfiguration(event: { id: string; organizationId: string }): Promise<AcceleventsConfiguration>;
  saveConfiguration(event: { id: string; organizationId: string }, input: SaveAcceleventsConfigurationInput): Promise<AcceleventsConfiguration>;
  listCanonicalRecords(eventId: string): Promise<CanonicalAcceleventsRecord[]>;
  getLinks(configurationId: string): Promise<Map<string, AcceleventsRecordLink>>;
  beginRun(input: { configuration: AcceleventsConfiguration; mode: AcceleventsRunMode; sourceRunId?: string; idempotencyKey: string }): Promise<{ run: AcceleventsSyncRun; idempotent: boolean }>;
  createSyncRecord(input: {
    runId: string;
    entityType: AcceleventsEntity;
    canonicalId: string;
    externalId?: string;
    operation: "create" | "update" | "skip" | "validate";
    fingerprint: string;
    idempotencyKey: string;
    status?: AcceleventsSyncRecord["status"];
    errorCode?: string;
    errorMessage?: string;
    requestMetadata?: Record<string, unknown>;
  }): Promise<AcceleventsSyncRecord>;
  finishSyncRecord(recordId: string, input: {
    status: AcceleventsSyncRecord["status"];
    externalId?: string;
    errorCode?: string;
    errorMessage?: string;
    responseMetadata?: Record<string, unknown>;
  }): Promise<void>;
  appendAttempt(recordId: string, input: {
    status: "succeeded" | "failed" | "blocked_external" | "not_sent";
    providerResponded: boolean;
    httpStatus?: number;
    providerRequestId?: string;
    errorCode?: string;
    errorMessage?: string;
    requestMetadata?: Record<string, unknown>;
    responseMetadata?: Record<string, unknown>;
  }): Promise<void>;
  upsertLink(input: { configurationId: string; entityType: AcceleventsEntity; canonicalId: string; externalId: string; canonicalFingerprint: string }): Promise<void>;
  completeRun(runId: string, input: {
    status: AcceleventsRunStatus;
    plannedCount: number;
    syncedCount: number;
    skippedCount: number;
    failedCount: number;
    providerResponded: boolean;
    providerRequestCount: number;
    failureCode?: string;
    failureMessage?: string;
  }): Promise<AcceleventsSyncRun>;
  listRecentRuns(eventId: string, limit?: number): Promise<AcceleventsSyncRun[]>;
  getRun(runId: string): Promise<AcceleventsSyncRun>;
}

export class AcceleventsIntegrationRepository implements AcceleventsRepositoryPort {
  constructor(private readonly database: Database) {}

  async findEventBySlug(eventSlug: string) {
    const [event] = await this.database.select({
      id: events.id,
      organizationId: events.organizationId,
      slug: events.slug,
      name: events.name,
      timezone: events.timezone,
    }).from(events).where(eq(events.slug, eventSlug)).limit(1);
    if (!event) throw new AcceleventsRepositoryError("event_not_found", "Event not found.");
    return event;
  }

  async ensureConfiguration(event: { id: string; organizationId: string }): Promise<AcceleventsConfiguration> {
    const [inserted] = await this.database.insert(acceleventsConfigurations).values({
      organizationId: event.organizationId,
      eventId: event.id,
      enabled: false,
    }).onConflictDoNothing({ target: acceleventsConfigurations.eventId }).returning();
    if (inserted) {
      await this.database.insert(acceleventsFieldMappings).values(defaultAcceleventsMappings.map((mapping) => ({
        configurationId: inserted.id,
        ...mapping,
      })));
    }
    const configuration = await this.loadConfiguration(event.id);
    if (!configuration) throw new Error("Accelevents configuration could not be created.");
    return configuration;
  }

  async saveConfiguration(event: { id: string; organizationId: string }, input: SaveAcceleventsConfigurationInput) {
    await this.database.transaction(async (transaction) => {
      const [configuration] = await transaction.insert(acceleventsConfigurations).values({
        organizationId: event.organizationId,
        eventId: event.id,
        externalEventUrl: clean(input.externalEventUrl),
        apiBaseUrl: clean(input.apiBaseUrl) ?? "https://api.accelevents.com",
        credentialBinding: input.credentialBinding ?? "ACCELEVENTS_API_TOKEN",
        authorizationHeader: input.authorizationHeader ?? "Authorization",
        enabled: input.enabled,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: acceleventsConfigurations.eventId,
        set: {
          externalEventUrl: clean(input.externalEventUrl),
          apiBaseUrl: clean(input.apiBaseUrl) ?? "https://api.accelevents.com",
          credentialBinding: input.credentialBinding ?? "ACCELEVENTS_API_TOKEN",
          authorizationHeader: input.authorizationHeader ?? "Authorization",
          enabled: input.enabled,
          updatedAt: new Date(),
        },
      }).returning();
      if (!configuration) throw new Error("Accelevents configuration save returned no record.");
      await transaction.delete(acceleventsFieldMappings).where(eq(acceleventsFieldMappings.configurationId, configuration.id));
      await transaction.delete(acceleventsReferenceMappings).where(eq(acceleventsReferenceMappings.configurationId, configuration.id));
      if (input.mappings.length) {
        await transaction.insert(acceleventsFieldMappings).values(input.mappings.map((mapping) => ({
          configurationId: configuration.id,
          entityType: mapping.entityType,
          canonicalField: mapping.canonicalField.trim(),
          externalField: mapping.externalField.trim(),
          required: mapping.required,
          enabled: mapping.enabled,
        })));
      }
      if (input.referenceMappings.length) {
        await transaction.insert(acceleventsReferenceMappings).values(input.referenceMappings.map((mapping) => ({
          configurationId: configuration.id,
          referenceType: mapping.referenceType,
          canonicalId: mapping.canonicalId,
          canonicalLabel: mapping.canonicalLabel.trim(),
          externalValue: mapping.externalValue.trim(),
        })));
      }
    });
    const saved = await this.loadConfiguration(event.id);
    if (!saved) throw new Error("Saved Accelevents configuration could not be loaded.");
    return saved;
  }

  async listCanonicalRecords(eventId: string): Promise<CanonicalAcceleventsRecord[]> {
    const [revision] = await this.database.select({ id: scheduleRevisions.id }).from(scheduleRevisions)
      .where(and(eq(scheduleRevisions.eventId, eventId), eq(scheduleRevisions.status, "ready")))
      .orderBy(desc(scheduleRevisions.version)).limit(1);
    if (!revision) return [];
    const sessionRows = await this.database.select({
      id: sessions.id,
      title: sessions.title,
      abstract: sessions.abstract,
      trackId: eventTracks.id,
      trackName: eventTracks.name,
      formatId: eventFormats.id,
      formatName: eventFormats.name,
      startsAt: placements.startsAt,
      endsAt: placements.endsAt,
      roomId: eventRooms.id,
      roomName: eventRooms.name,
      sessionUpdatedAt: sessions.updatedAt,
      placementUpdatedAt: placements.updatedAt,
    }).from(placements)
      .innerJoin(sessions, eq(sessions.id, placements.sessionId))
      .innerJoin(eventRooms, eq(eventRooms.id, placements.roomId))
      .leftJoin(eventTracks, eq(eventTracks.id, sessions.trackId))
      .leftJoin(eventFormats, eq(eventFormats.id, sessions.formatId))
      .where(and(eq(placements.revisionId, revision.id), eq(sessions.eventId, eventId), eq(sessions.contentStatus, "approved")))
      .orderBy(asc(placements.startsAt), asc(sessions.id));
    if (!sessionRows.length) return [];
    const sessionIds = sessionRows.map((row) => row.id);
    const speakerRows = await this.database.select({
      sessionId: sessionSpeakers.sessionId,
      eventSpeakerId: eventSpeakers.id,
      displayName: people.displayName,
      email: people.canonicalEmail,
      biography: speakerProfiles.biography,
      company: speakerProfiles.company,
      jobTitle: speakerProfiles.jobTitle,
      personUpdatedAt: people.updatedAt,
      eventSpeakerUpdatedAt: eventSpeakers.updatedAt,
      profileUpdatedAt: speakerProfiles.updatedAt,
    }).from(sessionSpeakers)
      .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
      .innerJoin(people, eq(people.id, eventSpeakers.personId))
      .leftJoin(speakerProfiles, eq(speakerProfiles.personId, people.id))
      .where(inArray(sessionSpeakers.sessionId, sessionIds))
      .orderBy(asc(sessionSpeakers.sessionId), asc(eventSpeakers.id));
    const speakers = new Map<string, CanonicalAcceleventsRecord>();
    for (const row of speakerRows) {
      speakers.set(row.eventSpeakerId, {
        entityType: "speaker",
        canonicalId: row.eventSpeakerId,
        displayName: row.displayName,
        email: row.email,
        biography: row.biography ?? "",
        company: row.company ?? "",
        jobTitle: row.jobTitle ?? "",
        updatedAt: latest(row.personUpdatedAt, row.eventSpeakerUpdatedAt, row.profileUpdatedAt),
      });
    }
    const program: CanonicalAcceleventsRecord[] = sessionRows.map((row) => ({
      entityType: "session",
      canonicalId: row.id,
      title: row.title,
      abstract: row.abstract,
      track: row.trackId && row.trackName ? { id: row.trackId, name: row.trackName } : null,
      format: row.formatId && row.formatName ? { id: row.formatId, name: row.formatName } : null,
      placement: { startsAt: row.startsAt, endsAt: row.endsAt, room: { id: row.roomId, name: row.roomName } },
      speakerIds: speakerRows.filter((speaker) => speaker.sessionId === row.id).map((speaker) => speaker.eventSpeakerId),
      updatedAt: latest(row.sessionUpdatedAt, row.placementUpdatedAt),
    }));
    return [...speakers.values()].sort(byCanonicalId).concat(program);
  }

  async getLinks(configurationId: string) {
    const rows = await this.database.select().from(acceleventsRecordLinks)
      .where(eq(acceleventsRecordLinks.configurationId, configurationId));
    return new Map(rows.map((row) => [`${row.entityType}:${row.canonicalId}`, row]));
  }

  async beginRun(input: { configuration: AcceleventsConfiguration; mode: AcceleventsRunMode; sourceRunId?: string; idempotencyKey: string }) {
    const [inserted] = await this.database.insert(acceleventsSyncRuns).values({
      configurationId: input.configuration.id,
      organizationId: input.configuration.organizationId,
      eventId: input.configuration.eventId,
      sourceRunId: input.sourceRunId,
      mode: input.mode,
      status: "running",
      idempotencyKey: input.idempotencyKey,
      startedAt: new Date(),
    }).onConflictDoNothing({ target: [acceleventsSyncRuns.configurationId, acceleventsSyncRuns.idempotencyKey] }).returning();
    if (inserted) return { run: await this.getRun(inserted.id), idempotent: false };
    const [existing] = await this.database.select({ id: acceleventsSyncRuns.id }).from(acceleventsSyncRuns).where(and(
      eq(acceleventsSyncRuns.configurationId, input.configuration.id),
      eq(acceleventsSyncRuns.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!existing) throw new Error("Idempotent Accelevents run could not be loaded.");
    return { run: await this.getRun(existing.id), idempotent: true };
  }

  async createSyncRecord(input: Parameters<AcceleventsRepositoryPort["createSyncRecord"]>[0]) {
    const [inserted] = await this.database.insert(acceleventsSyncRecords).values({
      runId: input.runId,
      entityType: input.entityType,
      canonicalId: input.canonicalId,
      externalId: input.externalId,
      operation: input.operation,
      status: input.status ?? "pending",
      fingerprint: input.fingerprint,
      idempotencyKey: input.idempotencyKey,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      requestMetadata: input.requestMetadata ?? {},
    }).onConflictDoNothing({ target: [acceleventsSyncRecords.runId, acceleventsSyncRecords.idempotencyKey] }).returning();
    const row = inserted ?? (await this.database.select().from(acceleventsSyncRecords).where(and(
      eq(acceleventsSyncRecords.runId, input.runId),
      eq(acceleventsSyncRecords.idempotencyKey, input.idempotencyKey),
    )).limit(1))[0];
    if (!row) throw new Error("Accelevents sync record could not be created.");
    return this.hydrateRecord(row);
  }

  async finishSyncRecord(recordId: string, input: Parameters<AcceleventsRepositoryPort["finishSyncRecord"]>[1]) {
    await this.database.update(acceleventsSyncRecords).set({
      status: input.status,
      externalId: input.externalId,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      responseMetadata: input.responseMetadata ?? {},
      updatedAt: new Date(),
    }).where(eq(acceleventsSyncRecords.id, recordId));
  }

  async appendAttempt(recordId: string, input: Parameters<AcceleventsRepositoryPort["appendAttempt"]>[1]) {
    const existing = await this.database.select({ attemptNumber: acceleventsRecordAttempts.attemptNumber })
      .from(acceleventsRecordAttempts).where(eq(acceleventsRecordAttempts.recordId, recordId));
    await this.database.insert(acceleventsRecordAttempts).values({
      recordId,
      attemptNumber: Math.max(0, ...existing.map((row) => row.attemptNumber)) + 1,
      status: input.status,
      providerResponded: input.providerResponded,
      httpStatus: input.httpStatus,
      providerRequestId: input.providerRequestId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      requestMetadata: input.requestMetadata ?? {},
      responseMetadata: input.responseMetadata ?? {},
    });
  }

  async upsertLink(input: Parameters<AcceleventsRepositoryPort["upsertLink"]>[0]) {
    await this.database.insert(acceleventsRecordLinks).values({ ...input, lastSyncedAt: new Date() }).onConflictDoUpdate({
      target: [acceleventsRecordLinks.configurationId, acceleventsRecordLinks.entityType, acceleventsRecordLinks.canonicalId],
      set: {
        externalId: input.externalId,
        canonicalFingerprint: input.canonicalFingerprint,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async completeRun(runId: string, input: Parameters<AcceleventsRepositoryPort["completeRun"]>[1]) {
    await this.database.update(acceleventsSyncRuns).set({
      ...input,
      failureCode: input.failureCode ?? null,
      failureMessage: input.failureMessage ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(acceleventsSyncRuns.id, runId));
    return this.getRun(runId);
  }

  async listRecentRuns(eventId: string, limit = 12) {
    const rows = await this.database.select({ id: acceleventsSyncRuns.id }).from(acceleventsSyncRuns)
      .where(eq(acceleventsSyncRuns.eventId, eventId)).orderBy(desc(acceleventsSyncRuns.createdAt)).limit(limit);
    return Promise.all(rows.map((row) => this.getRun(row.id)));
  }

  async getRun(runId: string): Promise<AcceleventsSyncRun> {
    const [run] = await this.database.select().from(acceleventsSyncRuns).where(eq(acceleventsSyncRuns.id, runId)).limit(1);
    if (!run) throw new AcceleventsRepositoryError("run_not_found", "Accelevents synchronization run not found.");
    const records = await this.database.select().from(acceleventsSyncRecords)
      .where(eq(acceleventsSyncRecords.runId, runId)).orderBy(asc(acceleventsSyncRecords.createdAt));
    return { ...run, records: await Promise.all(records.map((record) => this.hydrateRecord(record))) };
  }

  private async loadConfiguration(eventId: string): Promise<AcceleventsConfiguration | null> {
    const [configuration] = await this.database.select().from(acceleventsConfigurations)
      .where(eq(acceleventsConfigurations.eventId, eventId)).limit(1);
    if (!configuration) return null;
    const [mappings, referenceMappings] = await Promise.all([
      this.database.select().from(acceleventsFieldMappings).where(eq(acceleventsFieldMappings.configurationId, configuration.id))
        .orderBy(asc(acceleventsFieldMappings.entityType), asc(acceleventsFieldMappings.canonicalField)),
      this.database.select().from(acceleventsReferenceMappings).where(eq(acceleventsReferenceMappings.configurationId, configuration.id))
        .orderBy(asc(acceleventsReferenceMappings.referenceType), asc(acceleventsReferenceMappings.canonicalLabel)),
    ]);
    return { ...configuration, mappings, referenceMappings };
  }

  private async hydrateRecord(record: typeof acceleventsSyncRecords.$inferSelect): Promise<AcceleventsSyncRecord> {
    const attempts = await this.database.select().from(acceleventsRecordAttempts)
      .where(eq(acceleventsRecordAttempts.recordId, record.id)).orderBy(asc(acceleventsRecordAttempts.attemptNumber));
    return { ...record, attempts };
  }
}

export class AcceleventsRepositoryError extends Error {
  constructor(readonly code: "event_not_found" | "run_not_found", message: string) { super(message); }
}

function clean(value: string | null | undefined) { return value?.trim() || null; }
function latest(...values: Array<Date | null>) { return values.filter((value): value is Date => Boolean(value)).sort((left, right) => right.getTime() - left.getTime())[0] ?? new Date(0); }
function byCanonicalId(left: CanonicalAcceleventsRecord, right: CanonicalAcceleventsRecord) { return left.canonicalId.localeCompare(right.canonicalId); }
