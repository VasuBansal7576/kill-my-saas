import { z } from "zod";

export const PublicWidgetTypeSchema = z.enum([
  "sessions",
  "speakers",
  "agenda",
  "itinerary",
  "speaker_gallery",
]);

export const EmbedOutputFormatSchema = z.enum(["styled", "basic", "json", "xml", "ical"]);

export const PushCrmContactToEventCommandSchema = z.object({
  organizationId: z.uuid(),
  contactId: z.uuid(),
  eventId: z.uuid(),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const RunAirtableSyncCommandSchema = z.object({
  organizationId: z.uuid(),
  eventId: z.uuid().optional(),
  direction: z.enum(["export", "import"]),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export type PushCrmContactToEventCommand = z.infer<typeof PushCrmContactToEventCommandSchema>;
export type RunAirtableSyncCommand = z.infer<typeof RunAirtableSyncCommandSchema>;

export interface CrmEventSpeakerHandoff {
  contactId: string;
  eventId: string;
  eventSpeakerId: string;
  personId: string;
  idempotent: boolean;
}

export interface ExternalSyncReceipt {
  provider: "airtable";
  runId: string;
  status: "complete" | "partial_failure" | "blocked_external";
  exported: number;
  imported: number;
  failed: number;
}
