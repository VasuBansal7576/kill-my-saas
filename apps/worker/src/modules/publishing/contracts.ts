import { EmbedOutputFormatSchema, PublicWidgetTypeSchema } from "@programflow/contracts";
import { z } from "zod";

export const WidgetFieldSchema = z.enum([
  "title",
  "description",
  "date_time",
  "room",
  "track",
  "format",
  "speakers",
  "speaker_company",
  "speaker_job_title",
]);

export const WidgetBrandingSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  showEventBranding: z.boolean(),
});

export const WidgetFiltersSchema = z.object({
  trackIds: z.array(z.uuid()).default([]),
  formatIds: z.array(z.uuid()).default([]),
  roomIds: z.array(z.uuid()).default([]),
});

export const SaveWidgetConfigurationSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(120),
  widgetType: PublicWidgetTypeSchema,
  branding: WidgetBrandingSchema,
  filters: WidgetFiltersSchema,
  fields: z.array(WidgetFieldSchema).min(1),
  outputFormats: z.array(EmbedOutputFormatSchema).min(1),
});

export const PausePublicationSchema = z.object({
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const PublicProgramQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  track: z.string().max(120).optional(),
  format: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  day: z.iso.date().optional(),
});

export interface PublicSpeaker {
  id: string;
  eventSpeakerId: string;
  name: string;
  biography: string;
  company: string;
  jobTitle: string;
  headshotUrl: string | null;
  sessions: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    room: string;
  }>;
}

export interface PublicSession {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  day: string;
  room: { id: string; name: string };
  track: { id: string; name: string } | null;
  format: { id: string; name: string } | null;
  speakers: PublicSpeaker[];
}

export interface PublishedProgram {
  publication: {
    id: string;
    publicRevision: number;
    scheduleRevisionId: string;
    liveAt: string;
  };
  event: {
    id: string;
    slug: string;
    name: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
    location: string;
    branding: { primaryColor: string; logoUrl?: string };
  };
  days: string[];
  tracks: Array<{ id: string; name: string }>;
  formats: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string }>;
  sessions: PublicSession[];
  speakers: PublicSpeaker[];
}

export type SaveWidgetConfigurationInput = z.infer<typeof SaveWidgetConfigurationSchema>;
export type PublicProgramQuery = z.infer<typeof PublicProgramQuerySchema>;
