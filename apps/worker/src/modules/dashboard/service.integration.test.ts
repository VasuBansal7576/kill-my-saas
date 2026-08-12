import type { Database } from "@programflow/database";
import {
  acceleventsConfigurations,
  acceleventsSyncRuns,
  airtableConfigurations,
  airtableSyncRuns,
  communicationRecipients,
  communications,
  eventMemberships,
  eventSpeakers,
  events,
  organizations,
  outboxEvents,
  people,
  personEmailAliases,
  publications,
  scheduleRevisions,
} from "@programflow/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
import type { Actor } from "../identity-access/actor";
import { DashboardError, getOrganizerDashboard } from "./service";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("program readiness persisted projection", () => {
  const ids = {
    organization: crypto.randomUUID(),
    event: crypto.randomUUID(),
    otherEvent: crypto.randomUUID(),
    organizer: crypto.randomUUID(),
    speaker: crypto.randomUUID(),
    aliasOwner: crypto.randomUUID(),
    otherSpeaker: crypto.randomUUID(),
    eventSpeaker: crypto.randomUUID(),
    otherEventSpeaker: crypto.randomUUID(),
    communication: crypto.randomUUID(),
    otherCommunication: crypto.randomUUID(),
    recipient: crypto.randomUUID(),
    otherRecipient: crypto.randomUUID(),
    revisionOne: crypto.randomUUID(),
    revisionTwo: crypto.randomUUID(),
    otherRevision: crypto.randomUUID(),
    publication: crypto.randomUUID(),
    otherPublication: crypto.randomUUID(),
    publicationOutbox: crypto.randomUUID(),
    otherPublicationOutbox: crypto.randomUUID(),
    acceleventsConfiguration: crypto.randomUUID(),
    acceleventsSuccess: crypto.randomUUID(),
    acceleventsFailure: crypto.randomUUID(),
    otherAcceleventsConfiguration: crypto.randomUUID(),
    otherAcceleventsFailure: crypto.randomUUID(),
    airtableConfiguration: crypto.randomUUID(),
    airtableFailure: crypto.randomUUID(),
  };
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const eventSlug = `readiness-${ids.event}`;
  const actor: Actor = {
    identityId: `readiness-${ids.organizer}`,
    personId: ids.organizer,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };

  beforeAll(async () => {
    const publishedAt = new Date("2027-05-10T10:00:00.000Z");
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `readiness-${ids.organization}`, name: "Readiness Test" });
    await tooling.database.insert(events).values([
      { id: ids.event, organizationId: ids.organization, slug: eventSlug, name: "Scoped Event", startsOn: "2027-05-12", endsOn: "2027-05-14", timezone: "America/Los_Angeles", location: "San Francisco" },
      { id: ids.otherEvent, organizationId: ids.organization, slug: `readiness-${ids.otherEvent}`, name: "Other Event", startsOn: "2027-06-12", endsOn: "2027-06-14", timezone: "America/New_York", location: "New York" },
    ]);
    await tooling.database.insert(people).values([
      { id: ids.organizer, stableKey: `readiness-organizer-${ids.organizer}`, displayName: "Readiness Organizer" },
      { id: ids.speaker, stableKey: `readiness-speaker-${ids.speaker}`, displayName: "Priya Raman", canonicalEmail: `priya-${ids.speaker}@example.com` },
      { id: ids.aliasOwner, stableKey: `readiness-alias-${ids.aliasOwner}`, displayName: "Priya Canonical", canonicalEmail: `canonical-${ids.aliasOwner}@example.com` },
      { id: ids.otherSpeaker, stableKey: `readiness-other-${ids.otherSpeaker}`, displayName: "Other Speaker", canonicalEmail: `other-${ids.otherSpeaker}@example.com` },
    ]);
    await tooling.database.insert(personEmailAliases).values([
      { personId: ids.aliasOwner, email: `priya-${ids.speaker}@example.com`, normalizedEmail: `priya-${ids.speaker}@example.com`, isCanonical: false },
      { personId: ids.otherSpeaker, email: `other-${ids.otherSpeaker}@example.com`, normalizedEmail: `other-${ids.otherSpeaker}@example.com`, isCanonical: true },
    ]);
    await tooling.database.insert(eventMemberships).values([
      { eventId: ids.event, personId: ids.organizer, role: "organizer" },
      { eventId: ids.event, personId: ids.speaker, role: "speaker" },
      { eventId: ids.otherEvent, personId: ids.otherSpeaker, role: "speaker" },
    ]);
    await tooling.database.insert(eventSpeakers).values([
      { id: ids.eventSpeaker, eventId: ids.event, personId: ids.speaker, status: "onboarding" },
      { id: ids.otherEventSpeaker, eventId: ids.otherEvent, personId: ids.otherSpeaker, status: "onboarding" },
    ]);
    await tooling.database.insert(communications).values([
      { id: ids.communication, eventId: ids.event, name: "Speaker portal invitation", kind: "transactional", status: "failed", subjectTemplate: "Portal", htmlTemplate: "<p>Portal</p>", textTemplate: "Portal", audienceSnapshot: {}, idempotencyKey: `readiness-communication-${ids.communication}` },
      { id: ids.otherCommunication, eventId: ids.otherEvent, name: "Speaker portal invitation", kind: "transactional", status: "failed", subjectTemplate: "Portal", htmlTemplate: "<p>Portal</p>", textTemplate: "Portal", audienceSnapshot: {}, idempotencyKey: `readiness-communication-${ids.otherCommunication}` },
    ]);
    await tooling.database.insert(communicationRecipients).values([
      { id: ids.recipient, communicationId: ids.communication, personId: ids.speaker, toEmail: `priya-${ids.speaker}@example.com`, toName: "Priya Raman", renderedSubject: "Portal", renderedHtml: "<p>Portal</p>", renderedText: "Portal", status: "failed", attemptCount: 2, lastErrorCode: "provider_rejected", lastErrorMessage: "secret-token-must-not-leak", failedAt: publishedAt, lastOutcomeAt: publishedAt },
      { id: ids.otherRecipient, communicationId: ids.otherCommunication, personId: ids.otherSpeaker, toEmail: `other-${ids.otherSpeaker}@example.com`, toName: "Other Speaker", renderedSubject: "Portal", renderedHtml: "<p>Portal</p>", renderedText: "Portal", status: "failed", attemptCount: 1, lastErrorCode: "other_event_failure", lastErrorMessage: "other-event-secret", failedAt: publishedAt, lastOutcomeAt: publishedAt },
    ]);
    await tooling.database.insert(scheduleRevisions).values([
      { id: ids.revisionOne, eventId: ids.event, version: 1, status: "ready", createdAt: new Date("2027-05-09T08:00:00.000Z") },
      { id: ids.revisionTwo, eventId: ids.event, version: 2, status: "ready", createdAt: new Date("2027-05-10T09:00:00.000Z") },
      { id: ids.otherRevision, eventId: ids.otherEvent, version: 1, status: "ready" },
    ]);
    await tooling.database.insert(publications).values([
      { id: ids.publication, eventId: ids.event, state: "live", scheduleRevisionId: ids.revisionOne, publicRevision: 1, lastIdempotencyKey: `readiness-publication-${ids.publication}`, liveAt: publishedAt, createdAt: publishedAt, updatedAt: publishedAt },
      { id: ids.otherPublication, eventId: ids.otherEvent, state: "live", scheduleRevisionId: ids.otherRevision, publicRevision: 1, lastIdempotencyKey: `readiness-publication-${ids.otherPublication}`, liveAt: publishedAt, createdAt: publishedAt, updatedAt: publishedAt },
    ]);
    await tooling.database.insert(outboxEvents).values([
      { id: ids.publicationOutbox, aggregateType: "publication", aggregateId: ids.publication, eventType: "publication.went_live", payload: { eventId: ids.event }, idempotencyKey: `readiness-outbox-${ids.publicationOutbox}`, status: "failed", attempts: 3, lastError: "secret-outbox-error", createdAt: publishedAt, updatedAt: publishedAt },
      { id: ids.otherPublicationOutbox, aggregateType: "publication", aggregateId: ids.otherPublication, eventType: "publication.went_live", payload: { eventId: ids.otherEvent }, idempotencyKey: `readiness-outbox-${ids.otherPublicationOutbox}`, status: "failed", attempts: 9, lastError: "other-outbox-secret", createdAt: publishedAt, updatedAt: publishedAt },
    ]);
    await tooling.database.insert(acceleventsConfigurations).values([
      { id: ids.acceleventsConfiguration, organizationId: ids.organization, eventId: ids.event, externalEventUrl: "scoped-event", enabled: true },
      { id: ids.otherAcceleventsConfiguration, organizationId: ids.organization, eventId: ids.otherEvent, externalEventUrl: "other-event", enabled: true },
    ]);
    await tooling.database.insert(acceleventsSyncRuns).values([
      { id: ids.acceleventsSuccess, configurationId: ids.acceleventsConfiguration, organizationId: ids.organization, eventId: ids.event, mode: "manual", status: "succeeded", idempotencyKey: `readiness-accelevents-${ids.acceleventsSuccess}`, providerResponded: true, createdAt: new Date("2027-05-09T09:00:00.000Z"), completedAt: new Date("2027-05-09T09:01:00.000Z") },
      { id: ids.acceleventsFailure, configurationId: ids.acceleventsConfiguration, organizationId: ids.organization, eventId: ids.event, mode: "retry", status: "partial", idempotencyKey: `readiness-accelevents-${ids.acceleventsFailure}`, failedCount: 2, providerResponded: true, failureCode: "record_failures", failureMessage: "provider body must not leak", createdAt: new Date("2027-05-10T11:00:00.000Z"), completedAt: new Date("2027-05-10T11:01:00.000Z") },
      { id: ids.otherAcceleventsFailure, configurationId: ids.otherAcceleventsConfiguration, organizationId: ids.organization, eventId: ids.otherEvent, mode: "manual", status: "failed", idempotencyKey: `readiness-accelevents-${ids.otherAcceleventsFailure}`, failedCount: 7, providerResponded: false, failureCode: "other_event_failure", createdAt: new Date("2027-05-10T11:30:00.000Z") },
    ]);
    await tooling.database.insert(airtableConfigurations).values({ id: ids.airtableConfiguration, organizationId: ids.organization, eventId: ids.event, baseId: "appScoped", tableId: "tblScoped", enabled: true });
    await tooling.database.insert(airtableSyncRuns).values({ id: ids.airtableFailure, configurationId: ids.airtableConfiguration, organizationId: ids.organization, eventId: ids.event, direction: "export", status: "blocked_external", idempotencyKey: `readiness-airtable-${ids.airtableFailure}`, failedCount: 1, providerResponded: false, failureCode: "airtable_not_configured", failureMessage: "credential detail must not leak", createdAt: new Date("2027-05-10T10:30:00.000Z") });
  });

  afterAll(async () => {
    await tooling.database.delete(airtableSyncRuns).where(eq(airtableSyncRuns.configurationId, ids.airtableConfiguration));
    await tooling.database.delete(airtableConfigurations).where(eq(airtableConfigurations.organizationId, ids.organization));
    await tooling.database.delete(acceleventsSyncRuns).where(inArray(acceleventsSyncRuns.configurationId, [ids.acceleventsConfiguration, ids.otherAcceleventsConfiguration]));
    await tooling.database.delete(acceleventsConfigurations).where(eq(acceleventsConfigurations.organizationId, ids.organization));
    await tooling.database.delete(outboxEvents).where(inArray(outboxEvents.id, [ids.publicationOutbox, ids.otherPublicationOutbox]));
    await tooling.database.delete(publications).where(inArray(publications.eventId, [ids.event, ids.otherEvent]));
    await tooling.database.delete(scheduleRevisions).where(inArray(scheduleRevisions.eventId, [ids.event, ids.otherEvent]));
    await tooling.database.delete(communicationRecipients).where(inArray(communicationRecipients.communicationId, [ids.communication, ids.otherCommunication]));
    await tooling.database.delete(communications).where(inArray(communications.eventId, [ids.event, ids.otherEvent]));
    await tooling.database.delete(eventSpeakers).where(inArray(eventSpeakers.eventId, [ids.event, ids.otherEvent]));
    await tooling.database.delete(eventMemberships).where(inArray(eventMemberships.eventId, [ids.event, ids.otherEvent]));
    await tooling.database.delete(personEmailAliases).where(inArray(personEmailAliases.personId, [ids.aliasOwner, ids.otherSpeaker]));
    await tooling.database.delete(events).where(inArray(events.id, [ids.event, ids.otherEvent]));
    await tooling.database.delete(people).where(inArray(people.id, [ids.organizer, ids.speaker, ids.aliasOwner, ids.otherSpeaker]));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("joins only the requested event's operational receipts and redacts provider details", async () => {
    const snapshot = await getOrganizerDashboard(database, actor, eventSlug, new Date("2027-05-10T12:00:00.000Z"));
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.readiness.exceptions.map((exception) => exception.code)).toEqual([
      "portal_invitation_failed",
      "portal_identity_conflict",
      "publication_handoff_failed",
      "publication_behind_ready_revision",
      "accelevents_run_failed",
      "accelevents_out_of_date",
      "airtable_run_failed",
    ]);
    expect(serialized).toContain(ids.recipient);
    expect(serialized).toContain(ids.publicationOutbox);
    expect(serialized).toContain(ids.acceleventsFailure);
    expect(serialized).not.toContain(ids.otherRecipient);
    expect(serialized).not.toContain(ids.otherPublicationOutbox);
    expect(serialized).not.toContain(ids.otherAcceleventsFailure);
    expect(serialized).not.toContain("secret-token-must-not-leak");
    expect(serialized).not.toContain("secret-outbox-error");
    expect(serialized).not.toContain("provider body must not leak");
    expect(serialized).not.toContain("credential detail must not leak");
  });

  it("denies a signed-in actor without organizer access to the event", async () => {
    const unauthorized: Actor = { ...actor, eventRoles: [] };
    await expect(getOrganizerDashboard(database, unauthorized, eventSlug)).rejects.toMatchObject({ code: "forbidden" } satisfies Partial<DashboardError>);
  });
});
