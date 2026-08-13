import { QueueCommunicationCommandSchema } from "@programflow/contracts";
import type { z } from "zod";
import {
  calendarArtifacts,
  communicationRecipients,
  communications,
  communicationTemplates,
  decisionNotifications,
  decisions,
  deliverables,
  deliveryAttempts,
  deliveryProviderEvents,
  eventRooms,
  eventSpeakers,
  events,
  outboxEvents,
  people,
  placements,
  reviewRounds,
  scheduleRevisions,
  sessionSpeakers,
  sessions,
  speakerTaskAssignments,
  speakerTasks,
  submissions,
  type Database,
} from "@programflow/database";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import type { ReviewReminderPort } from "../reviews-decisions";
import { releasedSpeakerDeliverable } from "../session-release-visibility";
import type { CreatePlacementCalendar, QueueOrganizerCommunication } from "./contracts";
import { BrevoProviderError, type EmailProviderPort, type ProviderOutcome } from "./brevo-adapter";
import { buildSpeakerCalendar } from "./icalendar";
import { assessDeliveryProof, assessDeliveryRetry, deliveryTruthForStatus, MAX_DELIVERY_ATTEMPTS } from "./delivery-policy";
import { findMergeFields, MergeFieldError, renderMergeFields } from "./merge-fields";

type QueueCommunicationCommand = z.infer<typeof QueueCommunicationCommandSchema>;
type DeliveryState = typeof communicationRecipients.$inferSelect.status;

export class CommunicationsError extends Error {
  constructor(
    readonly code:
      | "event_not_found"
      | "forbidden"
      | "template_not_found"
      | "communication_not_found"
      | "delivery_not_found"
      | "placement_not_found"
      | "invalid_recipient"
      | "invalid_merge_data"
      | "idempotency_conflict"
      | "invalid_cursor"
      | "invalid_delivery_state"
      | "unsupported_outbox_event",
    message: string,
  ) {
    super(message);
  }
}

export interface QueueCommunicationOptions {
  command: QueueCommunicationCommand;
  name?: string;
  templateId?: string;
  requestedByPersonId?: string;
  audienceSnapshot?: Record<string, unknown>;
  calendarArtifactByPersonId?: Readonly<Record<string, string>>;
}

export interface QueueCommunicationResult {
  communicationId: string;
  recipientCount: number;
  outboxEventIds: string[];
  idempotent: boolean;
}

export async function saveTemplate(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: { name: string; subjectTemplate: string; htmlTemplate: string; textTemplate: string; revision?: number },
) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  const mergeFields = findMergeFields(input.subjectTemplate, input.htmlTemplate, input.textTemplate);
  const [existing] = await database.select().from(communicationTemplates)
    .where(and(eq(communicationTemplates.eventId, event.id), eq(communicationTemplates.name, input.name))).limit(1);
  if (existing) {
    if (input.revision !== undefined && input.revision !== existing.revision) {
      throw new CommunicationsError("idempotency_conflict", "The template changed since it was opened.");
    }
    const [updated] = await database.update(communicationTemplates).set({
      subjectTemplate: input.subjectTemplate,
      htmlTemplate: input.htmlTemplate,
      textTemplate: input.textTemplate,
      mergeFields,
      revision: existing.revision + 1,
      updatedAt: new Date(),
    }).where(eq(communicationTemplates.id, existing.id)).returning();
    return updated;
  }
  const [created] = await database.insert(communicationTemplates).values({
    eventId: event.id,
    name: input.name,
    subjectTemplate: input.subjectTemplate,
    htmlTemplate: input.htmlTemplate,
    textTemplate: input.textTemplate,
    mergeFields,
  }).returning();
  return created;
}

export async function queueOrganizerCommunication(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: QueueOrganizerCommunication,
): Promise<QueueCommunicationResult> {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  if (input.templateId) {
    const [template] = await database.select({ id: communicationTemplates.id }).from(communicationTemplates)
      .where(and(eq(communicationTemplates.id, input.templateId), eq(communicationTemplates.eventId, event.id))).limit(1);
    if (!template) throw new CommunicationsError("template_not_found", "Communication template not found for this event.");
  }
  return queueCommunication(database, {
    command: {
      eventId: event.id,
      kind: input.kind,
      recipientPersonIds: input.recipientPersonIds,
      subjectTemplate: input.subjectTemplate,
      htmlTemplate: input.htmlTemplate,
      textTemplate: input.textTemplate,
      mergeDataByPersonId: input.mergeDataByPersonId,
      idempotencyKey: input.idempotencyKey,
    },
    name: input.name,
    templateId: input.templateId,
    requestedByPersonId: actor.personId,
    audienceSnapshot: input.audienceSnapshot,
  });
}

export async function queueCommunication(database: Database, options: QueueCommunicationOptions): Promise<QueueCommunicationResult> {
  const parsed = QueueCommunicationCommandSchema.safeParse(options.command);
  if (!parsed.success) throw new CommunicationsError("invalid_recipient", parsed.error.issues[0]?.message ?? "Invalid QueueCommunication command.");
  const command = parsed.data;
  const personIds = [...new Set(command.recipientPersonIds)];

  return database.transaction(async (transaction) => {
    const [prior] = await transaction.select().from(communications)
      .where(eq(communications.idempotencyKey, command.idempotencyKey)).limit(1);
    if (prior) {
      if (prior.eventId !== command.eventId || prior.kind !== command.kind || prior.subjectTemplate !== command.subjectTemplate) {
        throw new CommunicationsError("idempotency_conflict", "That communication idempotency key was used for different content.");
      }
      const priorRecipients = await transaction.select({ id: communicationRecipients.id, personId: communicationRecipients.personId }).from(communicationRecipients)
        .where(eq(communicationRecipients.communicationId, prior.id));
      if (priorRecipients.length !== personIds.length || priorRecipients.some((recipient) => !personIds.includes(recipient.personId))) {
        throw new CommunicationsError("idempotency_conflict", "That communication idempotency key was used for a different audience.");
      }
      const priorOutbox = await transaction.select({ id: outboxEvents.id }).from(outboxEvents)
        .where(and(eq(outboxEvents.aggregateType, "communication_delivery"), inArray(outboxEvents.aggregateId, priorRecipients.map((recipient) => recipient.id))));
      return { communicationId: prior.id, recipientCount: priorRecipients.length, outboxEventIds: priorOutbox.map((row) => row.id), idempotent: true };
    }

    const [event] = await transaction.select().from(events).where(eq(events.id, command.eventId)).limit(1);
    if (!event) throw new CommunicationsError("event_not_found", "Event not found.");
    const recipientPeople = await transaction.select({ id: people.id, displayName: people.displayName, email: people.canonicalEmail })
      .from(people).where(inArray(people.id, personIds));
    if (recipientPeople.length !== personIds.length) throw new CommunicationsError("invalid_recipient", "Every recipient must be a canonical person.");

    const [communication] = await transaction.insert(communications).values({
      eventId: command.eventId,
      templateId: options.templateId,
      name: options.name ?? defaultCommunicationName(command.kind),
      kind: command.kind,
      status: "queued",
      subjectTemplate: command.subjectTemplate,
      htmlTemplate: command.htmlTemplate,
      textTemplate: command.textTemplate,
      audienceSnapshot: options.audienceSnapshot ?? { recipientPersonIds: personIds },
      idempotencyKey: command.idempotencyKey,
      requestedByPersonId: options.requestedByPersonId,
    }).returning();
    if (!communication) throw new Error("Communication insert did not return a record.");

    const outboxEventIds: string[] = [];
    for (const person of recipientPeople) {
      const firstName = person.displayName.trim().split(/\s+/)[0] ?? person.displayName;
      const supplied = command.mergeDataByPersonId[person.id] ?? {};
      const mergeData = {
        ...supplied,
        recipient_name: person.displayName,
        first_name: firstName,
        email: person.email ?? "",
        event_name: event.name,
        event_slug: event.slug,
        event_timezone: event.timezone,
      };
      let renderedSubject: string;
      let renderedHtml: string;
      let renderedText: string;
      try {
        renderedSubject = renderMergeFields(command.subjectTemplate, mergeData);
        renderedHtml = renderMergeFields(command.htmlTemplate, mergeData);
        renderedText = renderMergeFields(command.textTemplate, mergeData);
      } catch (error) {
        if (error instanceof MergeFieldError) throw new CommunicationsError("invalid_merge_data", error.message);
        throw error;
      }
      const [recipient] = await transaction.insert(communicationRecipients).values({
        communicationId: communication.id,
        personId: person.id,
        calendarArtifactId: options.calendarArtifactByPersonId?.[person.id],
        toEmail: person.email,
        toName: person.displayName,
        mergeData,
        renderedSubject,
        renderedHtml,
        renderedText,
        status: person.email ? "queued" : "failed",
        attemptCount: person.email ? 0 : 1,
        lastErrorCode: person.email ? null : "recipient_email_missing",
        lastErrorMessage: person.email ? null : "The canonical person has no deliverable email address.",
        failedAt: person.email ? null : new Date(),
        lastOutcomeAt: person.email ? null : new Date(),
      }).returning();
      if (!recipient) throw new Error("Communication recipient insert did not return a record.");
      if (!person.email) {
        await transaction.insert(deliveryAttempts).values({
          recipientId: recipient.id,
          attemptNumber: 1,
          status: "failed",
          failureCode: "recipient_email_missing",
          failureMessage: "The canonical person has no deliverable email address.",
          completedAt: new Date(),
        });
        continue;
      }
      const [outbox] = await transaction.insert(outboxEvents).values({
        aggregateType: "communication_delivery",
        aggregateId: recipient.id,
        eventType: "communication.delivery_requested",
        payload: { communicationId: communication.id, recipientId: recipient.id, attemptNumber: 1 },
        idempotencyKey: `communication:${communication.id}:recipient:${recipient.id}:attempt:1`,
      }).returning({ id: outboxEvents.id });
      if (outbox) outboxEventIds.push(outbox.id);
    }
    await recomputeCommunicationStatus(transaction, communication.id);
    return { communicationId: communication.id, recipientCount: recipientPeople.length, outboxEventIds, idempotent: false };
  });
}

export async function dispatchDelivery(database: Database, recipientId: string, provider?: EmailProviderPort) {
  const prepared = await database.transaction(async (transaction) => {
    await transaction.execute(sql`select id from communication_recipients where id = ${recipientId} for update`);
    const [recipient] = await transaction.select().from(communicationRecipients).where(eq(communicationRecipients.id, recipientId)).limit(1);
    if (!recipient) throw new CommunicationsError("delivery_not_found", "Communication delivery not found.");
    if (recipient.status === "delivered" || recipient.status === "bounced") {
      return { recipient, attemptNumber: recipient.attemptCount, attachment: undefined, terminal: true as const };
    }
    if (!recipient.toEmail) throw new CommunicationsError("invalid_delivery_state", "The recipient has no email address.");
    const attemptNumber = recipient.attemptCount + 1;
    const [artifact] = recipient.calendarArtifactId
      ? await transaction.select().from(calendarArtifacts).where(eq(calendarArtifacts.id, recipient.calendarArtifactId)).limit(1)
      : [];
    await transaction.insert(deliveryAttempts).values({ recipientId, attemptNumber, status: "sending" });
    await transaction.update(communicationRecipients).set({
      status: "sending",
      attemptCount: attemptNumber,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(communicationRecipients.id, recipientId));
    await recomputeCommunicationStatus(transaction, recipient.communicationId);
    return {
      recipient,
      attemptNumber,
      terminal: false as const,
      attachment: artifact ? { filename: artifact.filename, contentType: artifact.contentType, content: artifact.icalendar } : undefined,
    };
  });
  if (prepared.terminal) return prepared.recipient;

  if (!provider) {
    return finalizeFailedAttempt(database, prepared.recipient, prepared.attemptNumber, {
      status: "blocked_external",
      code: "brevo_not_configured",
      message: "Brevo credentials and a verified sender are required; delivery was not attempted.",
      metadata: {},
    });
  }

  try {
    const accepted = await provider.send({
      idempotencyKey: `communication-recipient:${recipientId}:attempt:${prepared.attemptNumber}`,
      to: { email: prepared.recipient.toEmail!, name: prepared.recipient.toName },
      subject: prepared.recipient.renderedSubject,
      html: prepared.recipient.renderedHtml,
      text: prepared.recipient.renderedText,
      attachment: prepared.attachment,
    });
    return database.transaction(async (transaction) => {
      await transaction.update(deliveryAttempts).set({
        status: "accepted",
        providerMessageId: accepted.providerMessageId,
        responseMetadata: accepted.metadata,
        completedAt: accepted.acceptedAt,
      }).where(and(eq(deliveryAttempts.recipientId, recipientId), eq(deliveryAttempts.attemptNumber, prepared.attemptNumber)));
      const [updated] = await transaction.update(communicationRecipients).set({
        status: "accepted",
        providerMessageId: accepted.providerMessageId,
        acceptedAt: accepted.acceptedAt,
        lastOutcomeAt: accepted.acceptedAt,
        updatedAt: accepted.acceptedAt,
      }).where(eq(communicationRecipients.id, recipientId)).returning();
      await recomputeCommunicationStatus(transaction, prepared.recipient.communicationId);
      return updated;
    });
  } catch (error) {
    const providerError = error instanceof BrevoProviderError
      ? error
      : new BrevoProviderError("provider_request_failed", error instanceof Error ? error.message : "Provider request failed.", true);
    return finalizeFailedAttempt(database, prepared.recipient, prepared.attemptNumber, {
      status: "failed",
      code: providerError.code,
      message: providerError.message,
      metadata: { ...providerError.metadata, retryable: providerError.retryable },
    });
  }
}

export async function retryDelivery(database: Database, actor: Actor, eventSlug: string, recipientId: string, idempotencyKey: string) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  return database.transaction(async (transaction) => {
    const [recipient] = await transaction.select({
      id: communicationRecipients.id,
      communicationId: communicationRecipients.communicationId,
      status: communicationRecipients.status,
      attemptCount: communicationRecipients.attemptCount,
      eventId: communications.eventId,
      toEmail: communicationRecipients.toEmail,
      lastErrorCode: communicationRecipients.lastErrorCode,
    }).from(communicationRecipients).innerJoin(communications, eq(communications.id, communicationRecipients.communicationId))
      .where(eq(communicationRecipients.id, recipientId)).limit(1);
    if (!recipient || recipient.eventId !== event.id) throw new CommunicationsError("delivery_not_found", "Communication delivery not found.");
    const [lastAttempt] = await transaction.select({ responseMetadata: deliveryAttempts.responseMetadata }).from(deliveryAttempts)
      .where(eq(deliveryAttempts.recipientId, recipient.id)).orderBy(desc(deliveryAttempts.attemptNumber)).limit(1);
    const assessment = assessDeliveryRetry({
      status: recipient.status,
      attemptCount: recipient.attemptCount,
      toEmail: recipient.toEmail,
      lastErrorCode: recipient.lastErrorCode,
      lastAttemptRetryable: typeof lastAttempt?.responseMetadata.retryable === "boolean" ? lastAttempt.responseMetadata.retryable : undefined,
    });
    if (!assessment.eligible || !assessment.nextAttempt) {
      throw new CommunicationsError("invalid_delivery_state", assessment.remediation);
    }
    const nextAttempt = assessment.nextAttempt;
    const [outbox] = await transaction.insert(outboxEvents).values({
      aggregateType: "communication_delivery",
      aggregateId: recipient.id,
      eventType: "communication.delivery_requested",
      payload: { communicationId: recipient.communicationId, recipientId: recipient.id, attemptNumber: nextAttempt },
      idempotencyKey,
    }).onConflictDoNothing({ target: outboxEvents.idempotencyKey }).returning({ id: outboxEvents.id });
    await transaction.update(communicationRecipients).set({ status: "queued", updatedAt: new Date() })
      .where(eq(communicationRecipients.id, recipient.id));
    await recomputeCommunicationStatus(transaction, recipient.communicationId);
    return { recipientId, outboxEventId: outbox?.id ?? null, attemptNumber: nextAttempt, remediation: assessment.remediation };
  });
}

export async function applyProviderOutcome(database: Database, outcome: ProviderOutcome) {
  return database.transaction(async (transaction) => {
    const [recipient] = await transaction.select().from(communicationRecipients)
      .where(eq(communicationRecipients.providerMessageId, outcome.providerMessageId)).limit(1);
    if (!recipient) throw new CommunicationsError("delivery_not_found", "No delivery matches the provider message ID.");
    const [inserted] = await transaction.insert(deliveryProviderEvents).values({
      recipientId: recipient.id,
      provider: "brevo",
      providerEventId: outcome.providerEventId,
      providerMessageId: outcome.providerMessageId,
      eventType: outcome.eventType,
      occurredAt: outcome.occurredAt,
      metadata: { ...outcome.metadata, reason: outcome.reason },
    }).onConflictDoNothing({ target: [deliveryProviderEvents.provider, deliveryProviderEvents.providerEventId] }).returning({ id: deliveryProviderEvents.id });
    if (!inserted) return { recipientId: recipient.id, status: recipient.status, duplicate: true };
    const next = deliveryStateForProviderEvent(recipient.status, outcome.eventType);
    const values: Partial<typeof communicationRecipients.$inferInsert> = {
      status: next,
      lastOutcomeAt: outcome.occurredAt,
      updatedAt: new Date(),
    };
    if (next === "delivered") values.deliveredAt = outcome.occurredAt;
    if (next === "bounced") {
      values.bouncedAt = outcome.occurredAt;
      values.lastErrorCode = outcome.eventType;
      values.lastErrorMessage = outcome.reason ?? "Brevo reported a bounce.";
    }
    if (next === "failed") {
      values.failedAt = outcome.occurredAt;
      values.lastErrorCode = outcome.eventType;
      values.lastErrorMessage = outcome.reason ?? "Brevo reported a terminal delivery failure.";
    }
    await transaction.update(communicationRecipients).set(values).where(eq(communicationRecipients.id, recipient.id));
    await recomputeCommunicationStatus(transaction, recipient.communicationId);
    return { recipientId: recipient.id, status: next, duplicate: false };
  });
}

export async function pollDeliveryOutcome(database: Database, actor: Actor, eventSlug: string, recipientId: string, provider: EmailProviderPort) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  const [recipient] = await database.select({
    id: communicationRecipients.id,
    status: communicationRecipients.status,
    providerMessageId: communicationRecipients.providerMessageId,
    eventId: communications.eventId,
  }).from(communicationRecipients).innerJoin(communications, eq(communications.id, communicationRecipients.communicationId))
    .where(eq(communicationRecipients.id, recipientId)).limit(1);
  if (!recipient) throw new CommunicationsError("delivery_not_found", "Communication delivery not found.");
  if (recipient.eventId !== event.id) throw new CommunicationsError("delivery_not_found", "Communication delivery not found.");
  if (!recipient.providerMessageId) throw new CommunicationsError("invalid_delivery_state", "The delivery has no provider message ID to poll.");
  const outcomes = await provider.poll(recipient.providerMessageId);
  const applied = [];
  for (const outcome of outcomes) applied.push(await applyProviderOutcome(database, outcome));
  const [current] = await database.select({ status: communicationRecipients.status, providerMessageId: communicationRecipients.providerMessageId })
    .from(communicationRecipients).where(eq(communicationRecipients.id, recipientId)).limit(1);
  if (!current) throw new CommunicationsError("delivery_not_found", "Communication delivery not found.");
  const proof = assessDeliveryProof(current);
  return {
    recipientId,
    status: current.status,
    pending: ["accepted", "queued", "sending"].includes(current.status),
    outcomesApplied: applied.length,
    proof,
  };
}

export async function listCommunicationsSummary(database: Database, actor: Actor, eventSlug: string) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  const [templates, artifacts, outboxRows] = await Promise.all([
    database.select().from(communicationTemplates).where(eq(communicationTemplates.eventId, event.id)).orderBy(asc(communicationTemplates.name)),
    database.select().from(calendarArtifacts).where(eq(calendarArtifacts.eventId, event.id)).orderBy(desc(calendarArtifacts.createdAt)).limit(20),
    database.select({
      status: outboxEvents.status,
      count: sql<number>`count(*)`,
      latestActivityAt: sql<Date | null>`max(${outboxEvents.updatedAt})`,
    }).from(outboxEvents)
      .innerJoin(communicationRecipients, eq(communicationRecipients.id, outboxEvents.aggregateId))
      .innerJoin(communications, eq(communications.id, communicationRecipients.communicationId))
      .where(and(eq(outboxEvents.aggregateType, "communication_delivery"), eq(communications.eventId, event.id)))
      .groupBy(outboxEvents.status),
  ]);
  return {
    event: { id: event.id, slug: event.slug, name: event.name },
    templates,
    calendarArtifacts: artifacts,
    historyPageSize: 20,
    maxDeliveryAttempts: MAX_DELIVERY_ATTEMPTS,
    operations: {
      outboxCounts: Object.fromEntries(outboxRows.map((row) => [row.status, Number(row.count)])),
      latestActivityAt: outboxRows.reduce<Date | null>((latest, row) => {
        if (!row.latestActivityAt) return latest;
        return !latest || row.latestActivityAt > latest ? row.latestActivityAt : latest;
      }, null),
    },
  };
}

type CommunicationRow = typeof communications.$inferSelect;
type RecipientStatusCount = { communicationId: string; status: DeliveryState; count: number };

export interface CommunicationHistoryQueries {
  listCampaigns(limit: number, cursor?: { createdAt: Date; id: string }): Promise<CommunicationRow[]>;
  countRecipientStatuses(communicationIds: string[]): Promise<RecipientStatusCount[]>;
}

export async function buildCommunicationHistoryPage(input: {
  eventSlug: string;
  limit: number;
  cursor?: string;
}, queries: CommunicationHistoryQueries) {
  const cursor = input.cursor ? decodeHistoryCursor(input.cursor) : undefined;
  const rows = await queries.listCampaigns(input.limit + 1, cursor);
  const hasMore = rows.length > input.limit;
  const campaigns = rows.slice(0, input.limit);
  const counts = campaigns.length ? await queries.countRecipientStatuses(campaigns.map((campaign) => campaign.id)) : [];
  return {
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      source: communicationSource(campaign, input.eventSlug),
      recipientCounts: Object.fromEntries(counts.filter((row) => row.communicationId === campaign.id).map((row) => [row.status, Number(row.count)])),
    })),
    pagination: {
      limit: input.limit,
      hasMore,
      nextCursor: hasMore && campaigns.length ? encodeHistoryCursor(campaigns[campaigns.length - 1]!) : null,
    },
  };
}

export async function listCommunicationHistory(database: Database, actor: Actor, eventSlug: string, input: { limit: number; cursor?: string }) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  return buildCommunicationHistoryPage({ eventSlug, ...input }, {
    listCampaigns: (limit, cursor) => database.select().from(communications).where(and(
      eq(communications.eventId, event.id),
      cursor ? or(
        lt(communications.createdAt, cursor.createdAt),
        and(eq(communications.createdAt, cursor.createdAt), lt(communications.id, cursor.id)),
      ) : undefined,
    )).orderBy(desc(communications.createdAt), desc(communications.id)).limit(limit),
    countRecipientStatuses: async (communicationIds) => {
      const rows = await database.select({
        communicationId: communicationRecipients.communicationId,
        status: communicationRecipients.status,
        count: sql<number>`count(*)`,
      }).from(communicationRecipients).where(inArray(communicationRecipients.communicationId, communicationIds))
        .groupBy(communicationRecipients.communicationId, communicationRecipients.status);
      return rows.map((row) => ({ ...row, count: Number(row.count) }));
    },
  });
}

export async function getCommunicationDetail(database: Database, actor: Actor, eventSlug: string, communicationId: string) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  const [campaign] = await database.select().from(communications).where(and(
    eq(communications.id, communicationId),
    eq(communications.eventId, event.id),
  )).limit(1);
  if (!campaign) throw new CommunicationsError("communication_not_found", "Communication not found.");
  const recipients = await database.select().from(communicationRecipients)
    .where(eq(communicationRecipients.communicationId, campaign.id)).orderBy(asc(communicationRecipients.createdAt));
  const recipientIds = recipients.map((recipient) => recipient.id);
  const [attempts, providerEvents, outbox] = recipientIds.length ? await Promise.all([
    database.select().from(deliveryAttempts).where(inArray(deliveryAttempts.recipientId, recipientIds)).orderBy(asc(deliveryAttempts.attemptNumber)),
    database.select().from(deliveryProviderEvents).where(inArray(deliveryProviderEvents.recipientId, recipientIds)).orderBy(asc(deliveryProviderEvents.occurredAt)),
    database.select({
      id: outboxEvents.id,
      aggregateId: outboxEvents.aggregateId,
      status: outboxEvents.status,
      attempts: outboxEvents.attempts,
      availableAt: outboxEvents.availableAt,
      dispatchedAt: outboxEvents.dispatchedAt,
      lastError: outboxEvents.lastError,
      createdAt: outboxEvents.createdAt,
    }).from(outboxEvents).where(and(
      eq(outboxEvents.aggregateType, "communication_delivery"),
      inArray(outboxEvents.aggregateId, recipientIds),
    )).orderBy(asc(outboxEvents.createdAt)),
  ]) : [[], [], []];
  return {
    ...campaign,
    source: communicationSource(campaign, eventSlug),
    recipients: recipients.map((recipient) => {
      const recipientAttempts = attempts.filter((attempt) => attempt.recipientId === recipient.id);
      const latestAttempt = recipientAttempts[recipientAttempts.length - 1];
      return {
        ...recipient,
        proof: assessDeliveryProof(recipient),
        retry: assessDeliveryRetry({
          ...recipient,
          lastAttemptRetryable: typeof latestAttempt?.responseMetadata.retryable === "boolean" ? latestAttempt.responseMetadata.retryable : undefined,
        }),
        attempts: recipientAttempts,
        providerEvents: providerEvents.filter((providerEvent) => providerEvent.recipientId === recipient.id),
        outbox: outbox.filter((outboxEvent) => outboxEvent.aggregateId === recipient.id),
      };
    }),
  };
}

export async function listCommunicationsWorkspace(database: Database, actor: Actor, eventSlug: string) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  const [templates, campaigns, artifacts] = await Promise.all([
    database.select().from(communicationTemplates).where(eq(communicationTemplates.eventId, event.id)).orderBy(asc(communicationTemplates.name)),
    database.select().from(communications).where(eq(communications.eventId, event.id)).orderBy(desc(communications.createdAt)).limit(100),
    database.select().from(calendarArtifacts).where(eq(calendarArtifacts.eventId, event.id)).orderBy(desc(calendarArtifacts.createdAt)).limit(100),
  ]);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const recipients = campaignIds.length ? await database.select().from(communicationRecipients)
    .where(inArray(communicationRecipients.communicationId, campaignIds)).orderBy(asc(communicationRecipients.createdAt)) : [];
  const recipientIds = recipients.map((recipient) => recipient.id);
  const [attempts, providerEvents] = recipientIds.length ? await Promise.all([
    database.select().from(deliveryAttempts)
      .where(inArray(deliveryAttempts.recipientId, recipientIds)).orderBy(asc(deliveryAttempts.attemptNumber)),
    database.select().from(deliveryProviderEvents)
      .where(inArray(deliveryProviderEvents.recipientId, recipientIds)).orderBy(asc(deliveryProviderEvents.occurredAt)),
  ]) : [[], []];
  return {
    event: { id: event.id, slug: event.slug, name: event.name },
    templates,
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      recipients: recipients.filter((recipient) => recipient.communicationId === campaign.id).map((recipient) => ({
        ...recipient,
        attempts: attempts.filter((attempt) => attempt.recipientId === recipient.id),
        providerEvents: providerEvents.filter((event) => event.recipientId === recipient.id),
      })),
    })),
    calendarArtifacts: artifacts,
  };
}

export async function createPlacementCalendarArtifacts(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: CreatePlacementCalendar,
) {
  const event = await requireOrganizerEventBySlug(database, actor, eventSlug);
  const [placement] = await database.select({
    id: placements.id,
    eventId: scheduleRevisions.eventId,
    sessionId: sessions.id,
    sessionTitle: sessions.title,
    startsAt: placements.startsAt,
    endsAt: placements.endsAt,
    roomName: eventRooms.name,
  }).from(placements)
    .innerJoin(scheduleRevisions, eq(scheduleRevisions.id, placements.revisionId))
    .innerJoin(sessions, eq(sessions.id, placements.sessionId))
    .innerJoin(eventRooms, eq(eventRooms.id, placements.roomId))
    .where(and(eq(placements.id, input.placementId), eq(scheduleRevisions.eventId, event.id))).limit(1);
  if (!placement) throw new CommunicationsError("placement_not_found", "Placement not found for this event.");
  const speakerPeople = await database.select({ id: people.id, name: people.displayName, email: people.canonicalEmail })
    .from(sessionSpeakers)
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId))
    .innerJoin(people, eq(people.id, eventSpeakers.personId))
    .where(eq(sessionSpeakers.sessionId, placement.sessionId));
  const recipients = input.recipientPersonIds
    ? speakerPeople.filter((person) => input.recipientPersonIds!.includes(person.id))
    : speakerPeople;
  if (!recipients.length || recipients.some((person) => !person.email)) {
    throw new CommunicationsError("invalid_recipient", "Every calendar recipient must be a session speaker with a canonical email.");
  }
  const generatedAt = new Date();
  const createdArtifacts: Array<typeof calendarArtifacts.$inferSelect> = [];
  for (const person of recipients) {
    const uid = `${placement.id}.${person.id}@programflow`;
    const filename = `${slugify(placement.sessionTitle)}-${input.method === "CANCEL" ? "cancelled" : "invitation"}-v${input.revision}.ics`;
    const icalendar = buildSpeakerCalendar({
      uid,
      sequence: input.revision,
      method: input.method,
      startsAt: placement.startsAt,
      endsAt: placement.endsAt,
      generatedAt,
      summary: placement.sessionTitle,
      description: `Speaker calendar invitation for ${event.name}`,
      location: `${event.location} — ${placement.roomName}`,
      organizer: input.organizer,
      attendee: { name: person.name, email: person.email! },
    });
    const [artifact] = await database.insert(calendarArtifacts).values({
      eventId: event.id,
      placementId: placement.id,
      personId: person.id,
      revision: input.revision,
      sequence: input.revision,
      uid,
      method: input.method,
      filename,
      contentType: `text/calendar; charset=utf-8; method=${input.method}`,
      icalendar,
    }).onConflictDoNothing({ target: [calendarArtifacts.placementId, calendarArtifacts.personId, calendarArtifacts.revision] }).returning();
    if (artifact) createdArtifacts.push(artifact);
    else {
      const [existing] = await database.select().from(calendarArtifacts).where(and(
        eq(calendarArtifacts.placementId, placement.id),
        eq(calendarArtifacts.personId, person.id),
        eq(calendarArtifacts.revision, input.revision),
      )).limit(1);
      if (existing) createdArtifacts.push(existing);
    }
  }
  let communication: QueueCommunicationResult | null = null;
  if (input.queueDelivery) {
    communication = await queueCommunication(database, {
      command: {
        eventId: event.id,
        kind: "calendar",
        recipientPersonIds: recipients.map((recipient) => recipient.id),
        subjectTemplate: input.method === "CANCEL" ? "Cancelled: {{ session_title }}" : "Calendar invitation: {{ session_title }}",
        htmlTemplate: input.method === "CANCEL"
          ? "<p>Hello {{first_name}},</p><p>Your calendar invitation for <strong>{{session_title}}</strong> has been cancelled.</p>"
          : "<p>Hello {{first_name}},</p><p>Your calendar invitation for <strong>{{session_title}}</strong> is attached.</p>",
        textTemplate: input.method === "CANCEL"
          ? "Hello {{first_name}}, your calendar invitation for {{session_title}} has been cancelled."
          : "Hello {{first_name}}, your calendar invitation for {{session_title}} is attached.",
        mergeDataByPersonId: Object.fromEntries(recipients.map((recipient) => [recipient.id, { session_title: placement.sessionTitle }])),
        idempotencyKey: input.idempotencyKey,
      },
      name: `${placement.sessionTitle} calendar ${input.method.toLowerCase()} v${input.revision}`,
      requestedByPersonId: actor.personId,
      audienceSnapshot: { placementId: placement.id, revision: input.revision, method: input.method },
      calendarArtifactByPersonId: Object.fromEntries(createdArtifacts.map((artifact) => [artifact.personId, artifact.id])),
    });
  }
  return { artifacts: createdArtifacts, communication };
}

export async function queueDueTaskReminders(database: Database, input: {
  eventId: string;
  dueBefore: Date;
  idempotencyKey: string;
}) {
  const rows = await database.select({
    personId: eventSpeakers.personId,
    taskTitle: speakerTasks.title,
    dueAt: sql<Date>`coalesce(${speakerTaskAssignments.dueAtOverride}, ${speakerTasks.dueAt})`,
  }).from(speakerTaskAssignments)
    .innerJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, speakerTaskAssignments.eventSpeakerId))
    .leftJoin(deliverables, eq(deliverables.taskAssignmentId, speakerTaskAssignments.id))
    .leftJoin(sessions, eq(sessions.id, deliverables.sessionId))
    .leftJoin(decisions, eq(decisions.submissionId, sessions.sourceSubmissionId))
    .where(and(
      eq(speakerTasks.eventId, input.eventId),
      eq(speakerTaskAssignments.status, "pending"),
      lt(sql`coalesce(${speakerTaskAssignments.dueAtOverride}, ${speakerTasks.dueAt})`, input.dueBefore),
      releasedSpeakerDeliverable(),
    ));
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.personId, [...(grouped.get(row.personId) ?? []), row]);
  const recipientPersonIds = [...grouped.keys()];
  if (!recipientPersonIds.length) return null;
  return queueCommunication(database, {
    command: {
      eventId: input.eventId,
      kind: "reminder",
      recipientPersonIds,
      subjectTemplate: "{{ incomplete_task_count }} outstanding task(s) for {{ event_name }}",
      htmlTemplate: "<p>Hello {{first_name}},</p><p>You have {{incomplete_task_count}} outstanding task(s). The next is <strong>{{next_task_title}}</strong>, due {{next_due_date}}.</p>",
      textTemplate: "Hello {{first_name}}, you have {{incomplete_task_count}} outstanding task(s). Next: {{next_task_title}}, due {{next_due_date}}.",
      mergeDataByPersonId: Object.fromEntries([...grouped].map(([personId, tasks]) => {
        const ordered = [...tasks].sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());
        const nextTask = ordered[0];
        if (!nextTask) throw new CommunicationsError("invalid_recipient", "Outstanding-task reminder has no task details.");
        return [personId, { incomplete_task_count: tasks.length, next_task_title: nextTask.taskTitle, next_due_date: nextTask.dueAt.toISOString() }];
      })),
      idempotencyKey: input.idempotencyKey,
    },
    name: "Outstanding speaker task reminder",
    audienceSnapshot: { type: "outstanding_tasks", dueBefore: input.dueBefore.toISOString(), recipientCount: recipientPersonIds.length },
  });
}

export function createReviewReminderPort(database: Database): ReviewReminderPort {
  return {
    async remindOutstanding(input) {
      const [round] = await database.select({ name: reviewRounds.name }).from(reviewRounds)
        .where(and(eq(reviewRounds.id, input.roundId), eq(reviewRounds.eventId, input.eventId))).limit(1);
      if (!round) throw new CommunicationsError("invalid_recipient", "Review round not found for reminder.");
      return queueCommunication(database, {
        command: {
          eventId: input.eventId,
          kind: "reminder",
          recipientPersonIds: [...input.recipientPersonIds],
          subjectTemplate: "Outstanding reviews for {{ event_name }}",
          htmlTemplate: "<p>Hello {{first_name}},</p><p>You still have outstanding reviews in <strong>{{review_round_name}}</strong>.</p>",
          textTemplate: "Hello {{first_name}}, you still have outstanding reviews in {{review_round_name}}.",
          mergeDataByPersonId: Object.fromEntries(input.recipientPersonIds.map((personId) => [personId, { review_round_name: round.name }])),
          idempotencyKey: input.idempotencyKey,
        },
        name: `${round.name} reviewer reminder`,
        audienceSnapshot: { type: "outstanding_reviews", roundId: input.roundId },
      });
    },
  };
}

export async function consumeCommunicationOutboxEvent(database: Database, outboxEventId: string) {
  const [outbox] = await database.select().from(outboxEvents).where(eq(outboxEvents.id, outboxEventId)).limit(1);
  if (!outbox) throw new CommunicationsError("unsupported_outbox_event", "Outbox event not found.");
  const payload = outbox.payload;
  if (outbox.eventType === "submission.confirmation_requested" || outbox.eventType === "submission.draft_reminder_requested") {
    const submissionId = stringValue(payload.submissionId);
    const [submission] = await database.select({ eventId: submissions.eventId, personId: submissions.submitterPersonId, title: submissions.title })
      .from(submissions).where(eq(submissions.id, submissionId)).limit(1);
    if (!submission?.personId) throw new CommunicationsError("invalid_recipient", "Submission has no canonical submitter recipient.");
    const draft = outbox.eventType === "submission.draft_reminder_requested";
    return queueCommunication(database, {
      command: {
        eventId: submission.eventId,
        kind: draft ? "reminder" : "transactional",
        recipientPersonIds: [submission.personId],
        subjectTemplate: draft ? "Complete your {{ submission_title }} proposal" : "We received {{ submission_title }}",
        htmlTemplate: draft
          ? "<p>Hello {{first_name}},</p><p>Your proposal <strong>{{submission_title}}</strong> is still a draft.</p>"
          : "<p>Hello {{first_name}},</p><p>We received your proposal <strong>{{submission_title}}</strong>.</p>",
        textTemplate: draft
          ? "Hello {{first_name}}, your proposal {{submission_title}} is still a draft."
          : "Hello {{first_name}}, we received your proposal {{submission_title}}.",
        mergeDataByPersonId: { [submission.personId]: { submission_title: submission.title } },
        idempotencyKey: `source-outbox:${outbox.id}`,
      },
      name: draft ? "Draft submission reminder" : "Submission received",
      audienceSnapshot: {
        type: draft ? "submission_draft_reminder" : "submission_confirmation",
        sourceOutboxEventId: outbox.id,
        submissionId,
        submissionTitle: submission.title,
      },
    });
  }
  if (["decision.notification.released", "decision.notification.requested", "decision.rejected"].includes(outbox.eventType)) {
    const decisionId = stringValue(payload.decisionId);
    const [decision] = await database.select({
      outcome: decisions.outcome,
      eventId: submissions.eventId,
      personId: submissions.submitterPersonId,
      title: submissions.title,
    }).from(decisions).innerJoin(submissions, eq(submissions.id, decisions.submissionId))
      .where(eq(decisions.id, decisionId)).limit(1);
    if (!decision?.personId) throw new CommunicationsError("invalid_recipient", "Decision has no canonical submitter recipient.");
    const decisionLabel = decision.outcome === "accepted" ? "Accepted" : "Not selected";
    const releasedSnapshot = outbox.eventType === "decision.notification.released";
    const result = await queueCommunication(database, {
      command: {
        eventId: decision.eventId,
        kind: "transactional",
        recipientPersonIds: [decision.personId],
        subjectTemplate: releasedSnapshot ? stringValue(payload.subjectTemplate) : "Decision for {{ submission_title }}: {{ decision_label }}",
        htmlTemplate: releasedSnapshot ? stringValue(payload.htmlTemplate) : "<p>Hello {{first_name}},</p><p>The decision for <strong>{{submission_title}}</strong> is <strong>{{decision_label}}</strong>.</p>",
        textTemplate: releasedSnapshot ? stringValue(payload.textTemplate) : "Hello {{first_name}}, the decision for {{submission_title}} is {{decision_label}}.",
        mergeDataByPersonId: { [decision.personId]: { submission_title: decision.title, decision_label: decisionLabel } },
        idempotencyKey: `source-outbox:${outbox.id}`,
      },
      name: `Decision: ${decisionLabel}`,
      audienceSnapshot: {
        type: "decision_notification",
        sourceOutboxEventId: outbox.id,
        decisionId,
        submissionTitle: decision.title,
        outcome: decision.outcome,
      },
    });
    if (releasedSnapshot) {
      const notificationId = stringValue(payload.notificationId);
      await database.transaction(async (transaction) => {
        await transaction.update(decisionNotifications).set({
          status: "handed_off",
          communicationId: result.communicationId,
          handedOffAt: new Date(),
          updatedAt: new Date(),
        }).where(and(eq(decisionNotifications.id, notificationId), eq(decisionNotifications.decisionId, decisionId)));
        await transaction.update(decisions).set({ notifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(decisions.id, decisionId));
      });
    }
    return result;
  }
  if (outbox.eventType === "speaker.portal-invitation.requested") {
    const eventSpeakerIds = arrayOfStrings(payload.eventSpeakerIds);
    const speakerRows = await database.select({ eventId: eventSpeakers.eventId, personId: eventSpeakers.personId })
      .from(eventSpeakers).where(inArray(eventSpeakers.id, eventSpeakerIds));
    const firstSpeaker = speakerRows[0];
    if (!firstSpeaker) throw new CommunicationsError("invalid_recipient", "Portal invitation has no event speakers.");
    return queueCommunication(database, {
      command: {
        eventId: firstSpeaker.eventId,
        kind: "transactional",
        recipientPersonIds: speakerRows.map((speaker) => speaker.personId),
        subjectTemplate: "Your {{ event_name }} speaker portal",
        htmlTemplate: "<p>Hello {{first_name}},</p><p>Your speaker portal is ready. Sign in to complete onboarding tasks and review your session.</p>",
        textTemplate: "Hello {{first_name}}, your speaker portal is ready. Sign in to complete onboarding tasks and review your session.",
        mergeDataByPersonId: {},
        idempotencyKey: `source-outbox:${outbox.id}`,
      },
      name: "Speaker portal invitation",
      audienceSnapshot: { type: "portal_invitation", sourceOutboxEventId: outbox.id, eventSpeakerIds },
    });
  }
  throw new CommunicationsError("unsupported_outbox_event", `Outbox event ${outbox.eventType} is not a Communications input.`);
}

async function finalizeFailedAttempt(
  database: Database,
  recipient: typeof communicationRecipients.$inferSelect,
  attemptNumber: number,
  failure: { status: "failed" | "blocked_external"; code: string; message: string; metadata: Record<string, unknown> },
) {
  return database.transaction(async (transaction) => {
    const now = new Date();
    await transaction.update(deliveryAttempts).set({
      status: failure.status,
      failureCode: failure.code,
      failureMessage: failure.message,
      responseMetadata: failure.metadata,
      completedAt: now,
    }).where(and(eq(deliveryAttempts.recipientId, recipient.id), eq(deliveryAttempts.attemptNumber, attemptNumber)));
    const [updated] = await transaction.update(communicationRecipients).set({
      status: failure.status,
      lastErrorCode: failure.code,
      lastErrorMessage: failure.message,
      failedAt: now,
      lastOutcomeAt: now,
      updatedAt: now,
    }).where(eq(communicationRecipients.id, recipient.id)).returning();
    await recomputeCommunicationStatus(transaction, recipient.communicationId);
    return updated;
  });
}

async function recomputeCommunicationStatus(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  communicationId: string,
) {
  const recipients = await transaction.select({ status: communicationRecipients.status }).from(communicationRecipients)
    .where(eq(communicationRecipients.communicationId, communicationId));
  if (!recipients.length) return;
  const pending = recipients.some((recipient) => deliveryTruthForStatus(recipient.status) === "in_flight");
  const failures = recipients.filter((recipient) => deliveryTruthForStatus(recipient.status) === "failed");
  const status = pending
    ? "sending"
    : failures.length === 0
      ? "complete"
      : failures.length === recipients.length
        ? failures.every((recipient) => recipient.status === "blocked_external") ? "blocked_external" : "failed"
        : "partial_failure";
  await transaction.update(communications).set({ status, updatedAt: new Date() }).where(eq(communications.id, communicationId));
}

export function deliveryStateForProviderEvent(current: DeliveryState, providerEvent: string): DeliveryState {
  if (current === "delivered") return current;
  if (providerEvent === "delivered") return "delivered";
  if (["hardBounce", "softBounce"].includes(providerEvent)) return "bounced";
  if (["blocked", "invalid", "spam", "error"].includes(providerEvent)) return "failed";
  if (["request", "sent", "deferred"].includes(providerEvent) && !["bounced", "failed"].includes(current)) return "accepted";
  return current;
}

async function requireOrganizerEventBySlug(database: Database, actor: Actor, eventSlug: string) {
  const candidates = await database.select().from(events).where(eq(events.slug, eventSlug));
  if (!candidates.length) throw new CommunicationsError("event_not_found", "Event not found.");
  const event = candidates.find((candidate) => actorCanAccessEvent(actor, candidate.id, "organizer"));
  if (!event) throw new CommunicationsError("forbidden", "Organizer access is required.");
  return event;
}

function defaultCommunicationName(kind: QueueCommunicationCommand["kind"]): string {
  return ({ transactional: "Transactional message", campaign: "Speaker campaign", reminder: "Reminder", calendar: "Calendar invitation" })[kind];
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "session";
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new CommunicationsError("unsupported_outbox_event", "Outbox payload is missing a required identifier.");
  return value;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new CommunicationsError("unsupported_outbox_event", "Outbox payload is missing required identifiers.");
  }
  return value;
}

function encodeHistoryCursor(campaign: Pick<CommunicationRow, "createdAt" | "id">): string {
  return `${campaign.createdAt.toISOString()},${campaign.id}`;
}

function decodeHistoryCursor(cursor: string): { createdAt: Date; id: string } {
  const separator = cursor.lastIndexOf(",");
  const createdAt = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (separator < 1 || Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new CommunicationsError("invalid_cursor", "Communication history cursor is invalid.");
  }
  return { createdAt, id };
}

export function communicationSource(campaign: Pick<CommunicationRow, "name" | "kind" | "audienceSnapshot">, eventSlug: string) {
  const snapshot = campaign.audienceSnapshot;
  const type = typeof snapshot.type === "string" ? snapshot.type : typeof snapshot.source === "string" ? snapshot.source : "";
  const base = `/organizer/events/${eventSlug}`;
  if (type === "submission_confirmation") return source("cfp_confirmation", "CFP confirmation", `${base}/submissions`, snapshot);
  if (type === "submission_draft_reminder") return source("cfp_draft_reminder", "CFP draft reminder", `${base}/submissions`, snapshot);
  if (type === "decision_notification") return source("decision_notification", "Accept / reject decision", `${base}/submissions`, snapshot);
  if (type === "outstanding_reviews") return source("reviewer_reminder", "Reviewer reminder", `${base}/evaluations`, snapshot);
  if (type === "portal_invitation") return source("portal_invitation", "Portal invitation", `${base}/speakers`, snapshot);
  if (type === "outstanding_tasks") return source("overdue_reminder", "Overdue task reminder", `${base}/tasks`, snapshot);
  if (type === "speaker_crm") return source("crm_bulk", "CRM bulk outreach", "/organizer/speaker-crm", snapshot);
  if (type === "speaker_bulk") return source("speaker_bulk", "Bulk speaker message", `${base}/speakers`, snapshot);
  if (campaign.kind === "calendar") return source("calendar", "Speaker calendar", `${base}/agenda`, snapshot);
  if (campaign.kind === "campaign") return source("speaker_bulk", "Bulk speaker message", `${base}/speakers`, snapshot);
  if (campaign.name.toLocaleLowerCase().includes("decision")) return source("decision_notification", "Accept / reject decision", `${base}/submissions`, snapshot);
  if (campaign.name.toLocaleLowerCase().includes("submission")) return source("cfp_confirmation", "CFP confirmation", `${base}/submissions`, snapshot);
  if (campaign.name.toLocaleLowerCase().includes("portal")) return source("portal_invitation", "Portal invitation", `${base}/speakers`, snapshot);
  return source("transactional", "Transactional message", base, snapshot);
}

function source(type: string, label: string, workflowHref: string, context: Record<string, unknown>) {
  return { type, label, workflowHref, context };
}
