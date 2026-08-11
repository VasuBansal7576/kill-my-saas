import type { Database } from "@programflow/database";
import {
  communicationRecipients,
  communications,
  communicationTemplates,
  deliveryAttempts,
  deliveryProviderEvents,
  eventMemberships,
  eventSpeakers,
  events,
  organizations,
  outboxEvents,
  people,
} from "@programflow/database";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
import type { Actor } from "../identity-access/actor";
import type { EmailProviderPort } from "./brevo-adapter";
import {
  applyProviderOutcome,
  consumeCommunicationOutboxEvent,
  dispatchDelivery,
  listCommunicationsWorkspace,
  queueCommunication,
  retryDelivery,
} from "./service";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("communications persisted delivery evidence", () => {
  const ids = {
    organization: crypto.randomUUID(),
    event: crypto.randomUUID(),
    organizer: crypto.randomUUID(),
    priya: crypto.randomUUID(),
    marcus: crypto.randomUUID(),
  };
  const slug = `communications-${ids.event}`;
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const organizer: Actor = {
    identityId: `organizer-${ids.organizer}`,
    personId: ids.organizer,
    organizationRoles: [{ organizationId: ids.organization, role: "organizer" }],
    eventRoles: [{ eventId: ids.event, role: "organizer" }],
  };
  const sourceOutboxIds: string[] = [];

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `communications-org-${ids.organization}`, name: "Communications Test" });
    await tooling.database.insert(events).values({
      id: ids.event,
      organizationId: ids.organization,
      slug,
      name: "DevFlow Conf 2027",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      timezone: "America/Los_Angeles",
      location: "Moscone West",
    });
    await tooling.database.insert(people).values([
      { id: ids.organizer, stableKey: `organizer-${ids.organizer}`, displayName: "Jordan Alvarez", canonicalEmail: `jordan-${ids.event}@example.com` },
      { id: ids.priya, stableKey: `priya-${ids.priya}`, displayName: "Priya Raman", canonicalEmail: `priya-${ids.event}@example.com` },
      { id: ids.marcus, stableKey: `marcus-${ids.marcus}`, displayName: "Marcus Okafor", canonicalEmail: `marcus-${ids.event}@example.com` },
    ]);
    await tooling.database.insert(eventMemberships).values({ eventId: ids.event, personId: ids.organizer, role: "organizer" });
  });

  afterAll(async () => {
    const campaignRows = await tooling.database.select({ id: communications.id }).from(communications).where(eq(communications.eventId, ids.event));
    const campaignIds = campaignRows.map((row) => row.id);
    const recipientRows = campaignIds.length
      ? await tooling.database.select({ id: communicationRecipients.id }).from(communicationRecipients).where(inArray(communicationRecipients.communicationId, campaignIds))
      : [];
    const recipientIds = recipientRows.map((row) => row.id);
    if (recipientIds.length) {
      await tooling.database.delete(outboxEvents).where(and(eq(outboxEvents.aggregateType, "communication_delivery"), inArray(outboxEvents.aggregateId, recipientIds)));
      await tooling.database.delete(deliveryProviderEvents).where(inArray(deliveryProviderEvents.recipientId, recipientIds));
      await tooling.database.delete(deliveryAttempts).where(inArray(deliveryAttempts.recipientId, recipientIds));
    }
    if (sourceOutboxIds.length) await tooling.database.delete(outboxEvents).where(inArray(outboxEvents.id, sourceOutboxIds));
    if (campaignIds.length) await tooling.database.delete(communicationRecipients).where(inArray(communicationRecipients.communicationId, campaignIds));
    await tooling.database.delete(communications).where(eq(communications.eventId, ids.event));
    await tooling.database.delete(communicationTemplates).where(eq(communicationTemplates.eventId, ids.event));
    await tooling.database.delete(eventSpeakers).where(eq(eventSpeakers.eventId, ids.event));
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(inArray(people.id, [ids.organizer, ids.priya, ids.marcus]));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("expands personalized snapshots once, retains attempts, blocks absent credentials, and applies provider outcomes idempotently", async () => {
    const command = {
      eventId: ids.event,
      kind: "campaign" as const,
      recipientPersonIds: [ids.priya, ids.marcus],
      subjectTemplate: "Hello {{first_name}} — {{event_name}}",
      htmlTemplate: "<p>{{recipient_name}}: {{custom_note}}</p>",
      textTemplate: "{{recipient_name}}: {{custom_note}}",
      mergeDataByPersonId: {
        [ids.priya]: { custom_note: "Bring the CI story" },
        [ids.marcus]: { custom_note: "Bring the platform story" },
      },
      idempotencyKey: `communications-integration:${ids.event}`,
    };
    const queued = await queueCommunication(database, { command, name: "Selected speaker update", requestedByPersonId: ids.organizer });
    expect(queued.recipientCount).toBe(2);
    expect(queued.outboxEventIds).toHaveLength(2);
    expect((await queueCommunication(database, { command, name: "Selected speaker update", requestedByPersonId: ids.organizer })).idempotent).toBe(true);

    const initial = await listCommunicationsWorkspace(database, organizer, slug);
    const campaign = initial.campaigns[0];
    if (!campaign) throw new Error("Campaign was not persisted.");
    const priya = campaign.recipients.find((recipient) => recipient.personId === ids.priya);
    const marcus = campaign.recipients.find((recipient) => recipient.personId === ids.marcus);
    if (!priya || !marcus) throw new Error("Recipient snapshots were not persisted.");
    expect(priya.renderedSubject).toContain("Hello Priya");
    expect(priya.renderedText).toContain("Bring the CI story");
    expect(marcus.renderedSubject).toContain("Hello Marcus");

    await dispatchDelivery(database, priya.id, undefined);
    let afterBlocked = await listCommunicationsWorkspace(database, organizer, slug);
    expect(afterBlocked.campaigns[0]?.recipients.find((recipient) => recipient.id === priya.id)).toMatchObject({
      status: "blocked_external",
      lastErrorCode: "brevo_not_configured",
      attempts: [{ status: "blocked_external", attemptNumber: 1 }],
    });
    await retryDelivery(database, organizer, slug, priya.id, `communications-retry:${crypto.randomUUID()}`);

    const provider: EmailProviderPort = {
      provider: "brevo",
      async send() { return { providerMessageId: "<marcus-provider-id@brevo>", acceptedAt: new Date("2027-05-01T10:00:00.000Z"), metadata: { httpStatus: 201 } }; },
      async poll() { return []; },
    };
    await dispatchDelivery(database, marcus.id, provider);
    const outcome = {
      providerEventId: "brevo-event-42",
      providerMessageId: "<marcus-provider-id@brevo>",
      eventType: "delivered",
      occurredAt: new Date("2027-05-01T10:00:05.000Z"),
      metadata: {},
    };
    expect(await applyProviderOutcome(database, outcome)).toMatchObject({ status: "delivered", duplicate: false });
    expect(await applyProviderOutcome(database, outcome)).toMatchObject({ status: "delivered", duplicate: true });
    afterBlocked = await listCommunicationsWorkspace(database, organizer, slug);
    expect(afterBlocked.campaigns[0]?.recipients.find((recipient) => recipient.id === marcus.id)).toMatchObject({
      status: "delivered",
      providerMessageId: "<marcus-provider-id@brevo>",
      attempts: [{ status: "accepted", attemptNumber: 1, providerMessageId: "<marcus-provider-id@brevo>" }],
    });
  });

  it("consumes the existing portal transactional outbox contract without claiming immediate delivery", async () => {
    const [speaker] = await tooling.database.insert(eventSpeakers).values({ eventId: ids.event, personId: ids.priya, status: "invited" }).returning();
    if (!speaker) throw new Error("Speaker fixture was not created.");
    const [source] = await tooling.database.insert(outboxEvents).values({
      aggregateType: "decision",
      aggregateId: crypto.randomUUID(),
      eventType: "speaker.portal-invitation.requested",
      payload: { eventSpeakerIds: [speaker.id], eventId: ids.event },
      idempotencyKey: `portal-invitation-source:${ids.event}`,
    }).returning();
    if (!source) throw new Error("Source outbox fixture was not created.");
    sourceOutboxIds.push(source.id);

    const consumed = await consumeCommunicationOutboxEvent(database, source.id);
    expect(consumed).toMatchObject({ recipientCount: 1, idempotent: false });
    expect((await consumeCommunicationOutboxEvent(database, source.id)).idempotent).toBe(true);
    const workspace = await listCommunicationsWorkspace(database, organizer, slug);
    expect(workspace.campaigns.find((campaign) => campaign.id === consumed.communicationId)).toMatchObject({
      name: "Speaker portal invitation",
      kind: "transactional",
      status: "sending",
      recipients: [{ personId: ids.priya, status: "queued" }],
    });
  });
});
