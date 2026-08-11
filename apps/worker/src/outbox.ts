import { createDatabase, outboxEvents } from "@programflow/database";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Env } from "./env";
import { BrevoEmailAdapter } from "./modules/communications/brevo-adapter";
import { consumeCommunicationOutboxEvent, dispatchDelivery } from "./modules/communications/service";

const SOURCE_COMMUNICATION_EVENTS = [
  "submission.confirmation_requested",
  "submission.draft_reminder_requested",
  "decision.notification.requested",
  "decision.rejected",
  "speaker.portal-invitation.requested",
] as const;

const SUPPORTED_EVENTS = ["communication.delivery_requested", ...SOURCE_COMMUNICATION_EVENTS] as const;

export interface OutboxJob {
  outboxEventId: string;
}

export async function claimAndEnqueueOutbox(environment: Env, requestedIds?: readonly string[]) {
  if (!environment.DATABASE_URL || !environment.JOBS || requestedIds?.length === 0) return { enqueued: 0 };
  const database = createDatabase(environment.DATABASE_URL);
  const filters = [
    inArray(outboxEvents.status, ["pending", "failed"]),
    inArray(outboxEvents.eventType, [...SUPPORTED_EVENTS]),
    lte(outboxEvents.availableAt, new Date()),
  ];
  if (requestedIds) filters.push(inArray(outboxEvents.id, [...requestedIds]));
  const claimed = await database.update(outboxEvents).set({
    status: "claimed",
    attempts: sql`${outboxEvents.attempts} + 1`,
    lastError: null,
    updatedAt: new Date(),
  }).where(and(...filters)).returning({ id: outboxEvents.id });

  let enqueued = 0;
  for (const event of claimed) {
    try {
      await environment.JOBS.send({ outboxEventId: event.id } satisfies OutboxJob);
      enqueued += 1;
    } catch (error) {
      await markOutboxFailed(environment, event.id, error);
    }
  }
  return { enqueued };
}

export async function processOutboxJob(environment: Env, job: OutboxJob) {
  if (!environment.DATABASE_URL) throw new Error("Database configuration is required.");
  const database = createDatabase(environment.DATABASE_URL);
  const [event] = await database.select().from(outboxEvents).where(eq(outboxEvents.id, job.outboxEventId)).limit(1);
  if (!event || event.status === "dispatched") return;

  if (event.eventType === "communication.delivery_requested") {
    const recipientId = stringValue(event.payload.recipientId);
    const provider = environment.BREVO_API_KEY && environment.BREVO_SENDER_EMAIL
      ? new BrevoEmailAdapter({
        apiKey: environment.BREVO_API_KEY,
        senderEmail: environment.BREVO_SENDER_EMAIL,
        senderName: environment.BREVO_SENDER_NAME ?? "ProgramFlow",
      })
      : undefined;
    await dispatchDelivery(database, recipientId, provider);
  } else if ((SOURCE_COMMUNICATION_EVENTS as readonly string[]).includes(event.eventType)) {
    const result = await consumeCommunicationOutboxEvent(database, event.id);
    await database.update(outboxEvents).set({ status: "dispatched", dispatchedAt: new Date(), updatedAt: new Date() })
      .where(eq(outboxEvents.id, event.id));
    await claimAndEnqueueOutbox(environment, result?.outboxEventIds);
    return;
  } else {
    throw new Error(`Unsupported outbox event: ${event.eventType}`);
  }

  await database.update(outboxEvents).set({ status: "dispatched", dispatchedAt: new Date(), updatedAt: new Date() })
    .where(eq(outboxEvents.id, event.id));
}

export async function markOutboxFailed(environment: Env, outboxEventId: string, error: unknown) {
  if (!environment.DATABASE_URL) return;
  const delaySeconds = 60;
  await createDatabase(environment.DATABASE_URL).update(outboxEvents).set({
    status: "failed",
    availableAt: new Date(Date.now() + delaySeconds * 1_000),
    lastError: error instanceof Error ? error.message : "Outbox processing failed.",
    updatedAt: new Date(),
  }).where(eq(outboxEvents.id, outboxEventId));
}

export function parseOutboxJob(value: unknown): OutboxJob {
  if (typeof value !== "object" || value === null || !("outboxEventId" in value) || typeof value.outboxEventId !== "string") {
    throw new Error("Queue message is not a ProgramFlow outbox job.");
  }
  return { outboxEventId: value.outboxEventId };
}

function stringValue(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Outbox payload is missing a required identifier.");
  return value;
}
