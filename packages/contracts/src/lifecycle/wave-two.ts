import { z } from "zod";

export const RequestUploadCommandSchema = z.object({
  eventId: z.uuid(),
  taskAssignmentId: z.uuid(),
  originalName: z.string().trim().min(1).max(255),
  mediaType: z.string().trim().min(1).max(160),
  byteSize: z.number().int().positive().max(250 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const QueueCommunicationCommandSchema = z.object({
  eventId: z.uuid(),
  kind: z.enum(["transactional", "campaign", "reminder", "calendar"]),
  recipientPersonIds: z.array(z.uuid()).min(1),
  subjectTemplate: z.string().trim().min(1).max(998),
  htmlTemplate: z.string().min(1),
  textTemplate: z.string().min(1),
  mergeDataByPersonId: z.record(z.uuid(), z.record(z.string(), z.unknown())).default({}),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const PlaceSessionCommandSchema = z.object({
  eventId: z.uuid(),
  revisionId: z.uuid(),
  sessionId: z.uuid(),
  roomId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
