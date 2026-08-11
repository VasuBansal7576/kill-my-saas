import { createApp } from "./app";
import type { Env } from "./env";

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch): Promise<void> {
    for (const message of batch.messages) {
      console.warn(JSON.stringify({
        level: "warn",
        operation: "queue_message_deferred",
        messageId: message.id,
        reason: "No production job dispatcher is registered for this message yet.",
      }));
      message.retry({ delaySeconds: 60 });
    }
  },
  async scheduled() {
    console.info(JSON.stringify({ level: "info", operation: "scheduled_maintenance" }));
  },
} satisfies ExportedHandler<Env>;
