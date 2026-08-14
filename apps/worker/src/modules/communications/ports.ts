import { QueueCommunicationCommandSchema } from "@programflow/contracts";
import type { Database } from "@programflow/database";
import type { z } from "zod";
import { queueCommunication, queueDueTaskReminders, type QueueCommunicationResult } from "./service";

export type QueueCommunicationCommand = z.infer<typeof QueueCommunicationCommandSchema>;

export interface CommunicationsPort {
  queue(command: QueueCommunicationCommand, context?: {
    name?: string;
    requestedByPersonId?: string;
    audienceSnapshot?: Record<string, unknown>;
  }): Promise<QueueCommunicationResult>;
  remindDueTasks(input: { eventId: string; dueBefore: Date; idempotencyKey: string }): Promise<QueueCommunicationResult | null>;
}

export function createCommunicationsPort(database: Database): CommunicationsPort {
  return {
    queue: (command, context) => queueCommunication(database, { command, ...context }),
    remindDueTasks: (input) => queueDueTaskReminders(database, input),
  };
}
