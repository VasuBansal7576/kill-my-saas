import { QueueCommunicationCommandSchema } from "@programflow/contracts";
import { z } from "zod";

export const SaveCommunicationTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subjectTemplate: z.string().trim().min(1).max(998),
  htmlTemplate: z.string().min(1).max(250_000),
  textTemplate: z.string().min(1).max(100_000),
  revision: z.number().int().positive().optional(),
});

export const QueueOrganizerCommunicationSchema = QueueCommunicationCommandSchema.omit({ eventId: true }).extend({
  name: z.string().trim().min(1).max(160),
  templateId: z.uuid().optional(),
  audienceSnapshot: z.record(z.string(), z.unknown()).default({}),
});

export const RetryDeliverySchema = z.object({
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const CommunicationHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(5).max(50).default(20),
  cursor: z.string().trim().max(200).optional(),
});

export const CreatePlacementCalendarSchema = z.object({
  placementId: z.uuid(),
  revision: z.number().int().positive(),
  method: z.enum(["REQUEST", "CANCEL"]).default("REQUEST"),
  recipientPersonIds: z.array(z.uuid()).min(1).optional(),
  organizer: z.object({
    name: z.string().trim().min(1).max(160),
    email: z.email(),
  }),
  queueDelivery: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const BrevoWebhookEventSchema = z.object({
  event: z.string().trim().min(1),
  email: z.email().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  date: z.string().optional(),
  ts: z.number().optional(),
  ts_event: z.number().optional(),
  ts_epoch: z.number().optional(),
  "message-id": z.string().trim().min(1),
  reason: z.string().optional(),
  subject: z.string().optional(),
  tag: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough();

export type QueueOrganizerCommunication = z.infer<typeof QueueOrganizerCommunicationSchema>;
export type CreatePlacementCalendar = z.infer<typeof CreatePlacementCalendarSchema>;
export type BrevoWebhookEvent = z.infer<typeof BrevoWebhookEventSchema>;
