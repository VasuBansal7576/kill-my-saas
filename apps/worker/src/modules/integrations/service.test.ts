import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../identity-access/actor";
import { AirtableIntegrationService, type AirtableRepositoryPort } from "./service";
import type { AirtableConfigurationRecord, AirtableSyncRunRecord } from "./types";

const ids = {
  organization: crypto.randomUUID(),
  event: crypto.randomUUID(),
  organizer: crypto.randomUUID(),
  session: crypto.randomUUID(),
};
const event = { id: ids.event, organizationId: ids.organization, slug: "devflow-conf-2027", name: "DevFlow Conf 2027" };
const actor: Actor = {
  identityId: "organizer-identity",
  personId: ids.organizer,
  organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
  eventRoles: [{ eventId: ids.event, role: "organizer" }],
};

describe("Airtable synchronization orchestration", () => {
  it("persists blocked_external without invoking a provider when bindings are absent", async () => {
    const configuration = config({ baseId: null, tableId: null, enabled: false });
    const repository = fakeRepository(configuration);
    const service = new AirtableIntegrationService(repository.port);

    const receipt = await service.run(actor, event.slug, command("export"));

    expect(receipt).toMatchObject({ status: "blocked_external", providerResponded: false, exported: 0, failed: 1 });
    expect(repository.recordItem).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked_external", errorCode: "airtable_not_configured" }));
    expect(repository.listCanonicalRecords).not.toHaveBeenCalled();
  });

  it("returns an existing terminal receipt for a repeated idempotency key", async () => {
    const configuration = config();
    const repository = fakeRepository(configuration, run({ status: "succeeded", exportedCount: 3, providerResponded: true, providerRequestCount: 2 }), true);
    const service = new AirtableIntegrationService(repository.port);

    const receipt = await service.run(actor, event.slug, command("export"), {
      listPage: vi.fn(), create: vi.fn(), update: vi.fn(),
    });

    expect(receipt).toMatchObject({ status: "complete", exported: 3, providerResponded: true, idempotent: true });
    expect(repository.listCanonicalRecords).not.toHaveBeenCalled();
  });

  it("claims completion only after a provider response and retains the returned record ID", async () => {
    const configuration = config();
    const repository = fakeRepository(configuration);
    repository.listCanonicalRecords.mockResolvedValue([{
      entityType: "session",
      canonicalId: ids.session,
      revision: 2,
      updatedAt: new Date("2027-05-01T10:00:00Z"),
      fields: { title: "Stateful Edge" },
    }]);
    const provider = {
      listPage: vi.fn().mockResolvedValue({ records: [], requestCount: 1 }),
      create: vi.fn().mockResolvedValue({ records: [{ id: "rec_session", fields: {} }], requestCount: 1 }),
      update: vi.fn(),
    };
    const service = new AirtableIntegrationService(repository.port);

    const receipt = await service.run(actor, event.slug, command("export"), provider);

    expect(receipt).toMatchObject({ status: "complete", exported: 1, failed: 0, providerResponded: true, providerRequestCount: 2 });
    expect(repository.upsertLink).toHaveBeenCalledWith(expect.objectContaining({ canonicalId: ids.session, airtableRecordId: "rec_session", canonicalRevision: 2 }));
    expect(repository.recordItem).toHaveBeenCalledWith(expect.objectContaining({ operation: "create", status: "synced", providerResponded: true }));
  });

  it("loads canonical records once for an import instead of querying once per Airtable row", async () => {
    const configuration = config();
    const repository = fakeRepository(configuration);
    repository.listCanonicalRecords.mockResolvedValue([{
      entityType: "session",
      canonicalId: ids.session,
      revision: 2,
      updatedAt: new Date("2027-05-01T10:00:00Z"),
      fields: { title: "Stateful Edge" },
    }]);
    const provider = {
      listPage: vi.fn().mockResolvedValue({
        records: [
          { id: "rec_session", fields: { _programflow_id: ids.session, _programflow_type: "session", "Last modified": "2027-05-02T10:00:00Z", "Research notes": "Priority" } },
          { id: "rec_unknown", fields: { _programflow_id: crypto.randomUUID(), _programflow_type: "session", "Last modified": "2027-05-02T10:00:00Z", "Research notes": "Ignore" } },
        ],
        requestCount: 1,
      }),
      create: vi.fn(),
      update: vi.fn(),
    };
    const service = new AirtableIntegrationService(repository.port);

    const receipt = await service.run(actor, event.slug, command("import"), provider);

    expect(repository.listCanonicalRecords).toHaveBeenCalledTimes(1);
    expect(receipt).toMatchObject({ imported: 1, failed: 1, providerResponded: true });
    expect(repository.recordItem).toHaveBeenCalledWith(expect.objectContaining({ airtableRecordId: "rec_unknown", errorCode: "canonical_record_not_found" }));
  });
});

function fakeRepository(configuration: AirtableConfigurationRecord, initialRun = run(), idempotent = false) {
  const recordItem = vi.fn(async () => undefined);
  const listCanonicalRecords = vi.fn<AirtableRepositoryPort["listCanonicalRecords"]>(async () => []);
  const upsertLink = vi.fn(async () => undefined);
  const completeRun = vi.fn(async (_runId: string, input: Parameters<AirtableRepositoryPort["completeRun"]>[1]) => run({ ...input }));
  const port: AirtableRepositoryPort = {
    findEventBySlug: vi.fn(async () => event),
    ensureConfiguration: vi.fn(async () => configuration),
    listRecentRuns: vi.fn(async () => []),
    saveConfiguration: vi.fn(async () => configuration),
    beginRun: vi.fn(async () => ({ run: initialRun, idempotent })),
    completeRun,
    recordItem,
    listCanonicalRecords,
    getLinks: vi.fn(async () => new Map()),
    upsertLink,
    applyExternalAttributes: vi.fn(async () => "applied" as const),
  };
  return { port, recordItem, listCanonicalRecords, upsertLink };
}

function config(overrides: Partial<AirtableConfigurationRecord> = {}): AirtableConfigurationRecord {
  return {
    id: crypto.randomUUID(),
    organizationId: ids.organization,
    eventId: ids.event,
    baseId: "app_base",
    tableId: "Program",
    credentialBinding: "AIRTABLE_TOKEN",
    modifiedTimeField: "Last modified",
    enabled: true,
    pageSize: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    mappings: [
      { id: crypto.randomUUID(), entityType: "session", localField: "title", externalField: "Title", direction: "export", owner: "programflow", enabled: true },
      { id: crypto.randomUUID(), entityType: "session", localField: "researchNotes", externalField: "Research notes", direction: "import", owner: "airtable", enabled: true },
    ],
    ...overrides,
  };
}

function run(overrides: Partial<AirtableSyncRunRecord> = {}): AirtableSyncRunRecord {
  return {
    id: crypto.randomUUID(),
    direction: "export",
    status: "running",
    idempotencyKey: "airtable-sync-idempotency",
    exportedCount: 0,
    importedCount: 0,
    failedCount: 0,
    providerResponded: false,
    providerRequestCount: 0,
    failureCode: null,
    failureMessage: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    items: [],
    ...overrides,
  };
}

function command(direction: "export" | "import") {
  return { organizationId: ids.organization, eventId: ids.event, direction, idempotencyKey: "airtable-sync-idempotency" };
}
