import { createApp } from "./app";
import type { Env } from "./env";
import {
  claimAndEnqueueOutbox,
  consumeCrmOutreachHandoffs,
  markOutboxFailed,
  parseOutboxJob,
  processOutboxJob,
  queueScheduledTaskReminders,
} from "./outbox";

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, environment: Env): Promise<void> {
    for (const message of batch.messages) {
      let job;
      try {
        job = parseOutboxJob(message.body);
        await processOutboxJob(environment, job);
        message.ack();
      } catch (error) {
        if (job) await markOutboxFailed(environment, job.outboxEventId, error);
        console.error(JSON.stringify({
          level: "error",
          operation: "outbox_job",
          messageId: message.id,
          reason: error instanceof Error ? error.message : "Outbox processing failed.",
        }));
        message.ack();
      }
    }
  },
  async scheduled(_controller, environment) {
    const crm = await consumeCrmOutreachHandoffs(environment);
    const taskReminders = await queueScheduledTaskReminders(environment);
    const result = await claimAndEnqueueOutbox(environment);
    console.info(JSON.stringify({ level: "info", operation: "scheduled_outbox_dispatch", enqueued: result.enqueued, crm, taskReminders }));
  },
} satisfies ExportedHandler<Env>;
