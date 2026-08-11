import { PushCrmContactToEventCommandSchema } from "@programflow/contracts";
import { z } from "zod";

const OptionalFilter = z.string().trim().max(160).optional();
export const CrmDirectoryFilterSchema = z.object({
  search: z.string().trim().max(160).default(""),
  companies: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  jobTitles: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  metadata: z.record(z.string().trim().min(1).max(80), z.string().trim().max(500)).default({}),
  company: OptionalFilter,
  jobTitle: OptionalFilter,
  tag: OptionalFilter,
});

const ContactFields = {
  displayName: z.string().trim().min(1).max(160),
  email: z.email(),
  biography: z.string().trim().max(20_000).default(""),
  company: z.string().trim().max(160).default(""),
  jobTitle: z.string().trim().max(160).default(""),
  internalNotes: z.string().trim().max(20_000).default(""),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  customMetadata: z.record(z.string().trim().min(1).max(80), z.string().trim().max(2_000)).default({}),
};

export const CreateCrmContactSchema = z.object(ContactFields);
export const UpdateCrmContactSchema = z.object({
  displayName: ContactFields.displayName.optional(),
  biography: ContactFields.biography.optional(),
  company: ContactFields.company.optional(),
  jobTitle: ContactFields.jobTitle.optional(),
  internalNotes: ContactFields.internalNotes.optional(),
  tags: ContactFields.tags.optional(),
  customMetadata: ContactFields.customMetadata.optional(),
  expectedRevision: z.number().int().positive().optional(),
});
export const ImportCrmCsvSchema = z.object({ csv: z.string().min(1).max(5_000_000) });
export const AddCrmNoteSchema = z.object({ body: z.string().trim().min(1).max(20_000) });
export const MergeCrmContactsSchema = z.object({
  primaryContactId: z.uuid(),
  duplicateContactId: z.uuid(),
  reason: z.string().trim().max(1_000).default("Organizer-confirmed duplicate"),
}).refine((value) => value.primaryContactId !== value.duplicateContactId, { message: "Choose two different contacts." });
export const SaveCrmSegmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: CrmDirectoryFilterSchema,
});
export const MoveCrmPipelineContactSchema = z.object({
  stageId: z.uuid(),
  note: z.string().trim().max(2_000).default(""),
});
export const CreateCrmOutreachHandoffSchema = z.object({
  eventId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  contactIds: z.array(z.uuid()).min(1).max(1_000).transform((ids) => [...new Set(ids)]),
  subjectTemplate: z.string().trim().min(1).max(998),
  htmlTemplate: z.string().min(1).max(250_000),
  textTemplate: z.string().min(1).max(100_000),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export { PushCrmContactToEventCommandSchema };
export type CrmDirectoryFilter = z.infer<typeof CrmDirectoryFilterSchema>;
export type CreateCrmContact = z.infer<typeof CreateCrmContactSchema>;
export type UpdateCrmContact = z.infer<typeof UpdateCrmContactSchema>;
export type MergeCrmContacts = z.infer<typeof MergeCrmContactsSchema>;
export type SaveCrmSegment = z.infer<typeof SaveCrmSegmentSchema>;
export type CreateCrmOutreachHandoff = z.infer<typeof CreateCrmOutreachHandoffSchema>;
