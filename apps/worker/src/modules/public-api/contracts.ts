import { z } from "zod";

const OptionalFilterSchema = z.string().trim().max(120).optional();

export const SessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().max(2_048).optional(),
  search: OptionalFilterSchema,
  track: OptionalFilterSchema,
  format: OptionalFilterSchema,
  room: OptionalFilterSchema,
  day: z.iso.date().optional(),
  speaker: OptionalFilterSchema,
});

export const SpeakerListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().max(2_048).optional(),
  search: OptionalFilterSchema,
  session: OptionalFilterSchema,
});

export const AgendaQuerySchema = SessionListQuerySchema.omit({ search: true, speaker: true });

export interface PageMetadata {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;
export type SpeakerListQuery = z.infer<typeof SpeakerListQuerySchema>;
export type AgendaQuery = z.infer<typeof AgendaQuerySchema>;
