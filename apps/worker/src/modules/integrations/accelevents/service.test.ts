import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../identity-access/actor";
import { defaultAcceleventsMappings } from "./mapping";
import type { AcceleventsRepositoryPort } from "./repository";
import { AcceleventsIntegrationService } from "./service";
import type {
  AcceleventsConfiguration,
  AcceleventsProviderPort,
  AcceleventsSyncRecord,
  AcceleventsSyncRun,
  CanonicalAcceleventsRecord,
} from "./types";

const ids = {
  organization: crypto.randomUUID(),
  event: crypto.randomUUID(),
  organizer: crypto.randomUUID(),
  speaker: crypto.randomUUID(),
  session: crypto.randomUUID(),
  track: crypto.randomUUID(),
  format: crypto.randomUUID(),
  room: crypto.randomUUID(),
};
const event = { id: ids.event, organizationId: ids.organization, slug: "devflow-conf-2027", name: "DevFlow Conf 2027", timezone: "America/Los_Angeles" };
const actor: Actor = {
  identityId: "organizer-identity",
  personId: ids.organizer,
  organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
  eventRoles: [{ eventId: ids.event, role: "organizer" }],
};

describe("Accelevents run state", () => {
  it("persists a dry-run plan and never invokes the provider", async () => {
    const repository = fakeRepository();
    const provider = providerPort();
    const service = new AcceleventsIntegrationService(repository.port);

    const result = await service.run(actor, event.slug, command("preview"), provider);

    expect(result).toMatchObject({ mode: "preview", status: "complete", planned: 2, failed: 0, providerResponded: false });
    expect(provider.upsert).not.toHaveBeenCalled();
    expect(repository.appendAttempt).toHaveBeenCalledTimes(2);
    expect(repository.appendAttempt).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "not_sent", providerResponded: false }));
  });

  it("records blocked_external per canonical record when the Worker token is absent", async () => {
    const repository = fakeRepository();
    const service = new AcceleventsIntegrationService(repository.port);

    const result = await service.run(actor, event.slug, command("manual"));

    expect(result).toMatchObject({ status: "blocked_external", planned: 2, synced: 0, failed: 2, providerResponded: false });
    expect(repository.appendAttempt).toHaveBeenCalledTimes(2);
    expect(repository.appendAttempt).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      status: "blocked_external",
      errorCode: "accelevents_not_configured",
      providerResponded: false,
    }));
  });

  it("sends speakers before sessions, retains provider IDs, and returns an existing run for a repeated key", async () => {
    const repository = fakeRepository();
    const provider = providerPort();
    const service = new AcceleventsIntegrationService(repository.port);

    const first = await service.run(actor, event.slug, command("manual"), provider);
    repository.idempotent = true;
    const second = await service.run(actor, event.slug, command("manual"), provider);

    expect(first).toMatchObject({ status: "complete", synced: 2, providerResponded: true, providerRequestCount: 2, idempotent: false });
    expect(second).toMatchObject({ runId: first.runId, idempotent: true });
    expect(provider.upsert).toHaveBeenCalledTimes(2);
    expect(provider.upsert.mock.calls[0]?.[0]).toMatchObject({ entityType: "speaker" });
    expect(provider.upsert.mock.calls[1]?.[0]).toMatchObject({
      entityType: "session",
      payload: { speakerList: [{ speakerId: 4516 }] },
    });
    expect(repository.upsertLink).toHaveBeenCalledWith(expect.objectContaining({ entityType: "speaker", externalId: "4516" }));
    expect(repository.upsertLink).toHaveBeenCalledWith(expect.objectContaining({ entityType: "session", externalId: "10966" }));
  });
});

function fakeRepository() {
  const configuration = config();
  const records = canonicalRecords();
  const links = new Map();
  let currentRun = run();
  const appendAttempt = vi.fn<AcceleventsRepositoryPort["appendAttempt"]>(async (recordId, input) => {
    const record = currentRun.records.find((candidate) => candidate.id === recordId);
    if (!record) throw new Error("record not found");
    record.attempts.push({
      id: crypto.randomUUID(),
      attemptNumber: record.attempts.length + 1,
      status: input.status,
      providerResponded: input.providerResponded,
      httpStatus: input.httpStatus ?? null,
      providerRequestId: input.providerRequestId ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      requestMetadata: input.requestMetadata ?? {},
      responseMetadata: input.responseMetadata ?? {},
      createdAt: new Date(),
    });
  });
  const upsertLink = vi.fn<AcceleventsRepositoryPort["upsertLink"]>(async (input) => {
    links.set(`${input.entityType}:${input.canonicalId}`, input);
  });
  const state = { idempotent: false };
  const port: AcceleventsRepositoryPort = {
    findEventBySlug: vi.fn(async () => event),
    ensureConfiguration: vi.fn(async () => configuration),
    saveConfiguration: vi.fn(async () => configuration),
    listCanonicalRecords: vi.fn(async () => records),
    getLinks: vi.fn(async () => links),
    beginRun: vi.fn(async (input) => {
      currentRun.mode = input.mode;
      return { run: currentRun, idempotent: state.idempotent };
    }),
    createSyncRecord: vi.fn(async (input) => {
      const record: AcceleventsSyncRecord = {
        id: crypto.randomUUID(),
        entityType: input.entityType,
        canonicalId: input.canonicalId,
        externalId: input.externalId ?? null,
        operation: input.operation,
        status: input.status ?? "pending",
        fingerprint: input.fingerprint,
        idempotencyKey: input.idempotencyKey,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        requestMetadata: input.requestMetadata ?? {},
        responseMetadata: {},
        createdAt: new Date(),
        attempts: [],
      };
      currentRun.records.push(record);
      return record;
    }),
    finishSyncRecord: vi.fn(async (recordId, input) => {
      const record = currentRun.records.find((candidate) => candidate.id === recordId);
      if (!record) throw new Error("record not found");
      record.status = input.status;
      record.externalId = input.externalId ?? record.externalId;
      record.errorCode = input.errorCode ?? null;
      record.errorMessage = input.errorMessage ?? null;
      record.responseMetadata = input.responseMetadata ?? {};
    }),
    appendAttempt,
    upsertLink,
    completeRun: vi.fn(async (_runId, input) => {
      currentRun = { ...currentRun, ...input, failureCode: input.failureCode ?? null, failureMessage: input.failureMessage ?? null, completedAt: new Date() };
      return currentRun;
    }),
    listRecentRuns: vi.fn(async () => []),
    getRun: vi.fn(async () => currentRun),
  };
  return {
    port,
    appendAttempt,
    upsertLink,
    get idempotent() { return state.idempotent; },
    set idempotent(value: boolean) { state.idempotent = value; },
  };
}

function providerPort() {
  const upsert = vi.fn<AcceleventsProviderPort["upsert"]>(async (input) => ({
    externalId: input.entityType === "speaker" ? "4516" : "10966",
    operation: input.externalId ? "update" : "create",
    httpStatus: input.externalId ? 200 : 201,
    requestId: `request-${input.entityType}`,
    responseMetadata: { responseReceived: true },
    requestCount: 1,
  }));
  return { upsert };
}

function config(): AcceleventsConfiguration {
  return {
    id: crypto.randomUUID(),
    organizationId: ids.organization,
    eventId: ids.event,
    externalEventUrl: "devflow-conf-2027",
    apiBaseUrl: "https://api.accelevents.com",
    credentialBinding: "ACCELEVENTS_API_TOKEN",
    authorizationHeader: "Authorization",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    mappings: defaultAcceleventsMappings.map((mapping) => ({ ...mapping })),
    referenceMappings: [
      { referenceType: "track", canonicalId: ids.track, canonicalLabel: "Platform", externalValue: "812" },
      { referenceType: "format", canonicalId: ids.format, canonicalLabel: "Talk", externalValue: "MAIN_STAGE" },
    ],
  };
}

function canonicalRecords(): CanonicalAcceleventsRecord[] {
  return [{
    entityType: "session",
    canonicalId: ids.session,
    title: "Stateful systems",
    abstract: "Durable handoffs.",
    track: { id: ids.track, name: "Platform" },
    format: { id: ids.format, name: "Talk" },
    placement: { startsAt: new Date("2027-05-12T17:00:00Z"), endsAt: new Date("2027-05-12T17:45:00Z"), room: { id: ids.room, name: "Main Stage" } },
    speakerIds: [ids.speaker],
    updatedAt: new Date(),
  }, {
    entityType: "speaker",
    canonicalId: ids.speaker,
    displayName: "Priya Raman",
    email: "priya@example.com",
    biography: "Staff engineer.",
    company: "Northstar",
    jobTitle: "Staff Engineer",
    updatedAt: new Date(),
  }];
}

function run(): AcceleventsSyncRun {
  return {
    id: crypto.randomUUID(),
    organizationId: ids.organization,
    eventId: ids.event,
    sourceRunId: null,
    mode: "manual",
    status: "running",
    idempotencyKey: "accelevents-state-test-key",
    plannedCount: 0,
    syncedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    providerResponded: false,
    providerRequestCount: 0,
    failureCode: null,
    failureMessage: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    records: [],
  };
}

function command(mode: "preview" | "manual") {
  return { organizationId: ids.organization, eventId: ids.event, mode, idempotencyKey: "accelevents-state-test-key" };
}
