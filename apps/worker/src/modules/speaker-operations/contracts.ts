import { z } from "zod";

export const SpeakerStatusSchema = z.enum(["invited", "onboarding", "ready", "withdrawn"]);
export const EmployerApprovalStatusSchema = z.enum(["not_required", "pending", "approved"]);
export const TaskCompletionFilterSchema = z.enum(["all", "complete", "incomplete"]);

const SocialLinksSchema = z.record(z.string().trim().min(1).max(40), z.string().trim().max(500));
const LogisticsSchema = z.record(z.string().trim().min(1).max(80), z.string().trim().max(2_000));

export const AddSpeakerInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.email(),
  jobTitle: z.string().trim().max(160).default(""),
  company: z.string().trim().max(160).default(""),
  biography: z.string().trim().max(20_000).default(""),
  socialLinks: SocialLinksSchema.default({}),
  logistics: LogisticsSchema.default({}),
});

export const UpdateSpeakerInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160).optional(),
  jobTitle: z.string().trim().max(160).optional(),
  company: z.string().trim().max(160).optional(),
  biography: z.string().trim().max(20_000).optional(),
  socialLinks: SocialLinksSchema.optional(),
  logistics: LogisticsSchema.optional(),
});

export const UpdateSpeakerStatusInputSchema = z.object({ status: SpeakerStatusSchema });
export const UpdateEmployerApprovalInputSchema = z.object({ status: EmployerApprovalStatusSchema });

export const RosterQuerySchema = z.object({
  search: z.string().trim().max(160).default(""),
  status: SpeakerStatusSchema.optional(),
  employerApprovalStatus: EmployerApprovalStatusSchema.optional(),
  taskStatus: TaskCompletionFilterSchema.default("all"),
});

const DateTimeSchema = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date and time.");

export const CreateSpeakerTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10_000).default(""),
  kind: z.enum(["action", "form"]),
  required: z.boolean().default(true),
  dueAt: DateTimeSchema.nullable().default(null),
  configuration: z.record(z.string(), z.unknown()).default({}),
  eventSpeakerIds: z.array(z.uuid()).min(1).max(500),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const UpdateAssignmentDueDateInputSchema = z.object({ dueAt: DateTimeSchema.nullable() });
export const CompleteSpeakerTaskInputSchema = z.object({
  response: z.record(z.string(), z.unknown()).nullable().default(null),
});

export const SaveSpeakerResourceInputSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().max(1_000).default(""),
  contentHtml: z.string().max(100_000),
  status: z.enum(["draft", "published"]),
  visibleToStatuses: z.array(z.enum(["invited", "onboarding", "ready"])).min(1),
  allowedEmbedOrigins: z.array(z.string().url()).max(30).default([]),
  expectedRevision: z.number().int().positive().optional(),
});

export const ImportSpeakersInputSchema = z.object({ csv: z.string().min(1).max(2_000_000) });

export type AddSpeakerInput = z.infer<typeof AddSpeakerInputSchema>;
export type UpdateSpeakerInput = z.infer<typeof UpdateSpeakerInputSchema>;
export type RosterQuery = z.infer<typeof RosterQuerySchema>;
export type CreateSpeakerTaskInput = z.infer<typeof CreateSpeakerTaskInputSchema>;
export type SaveSpeakerResourceInput = z.infer<typeof SaveSpeakerResourceInputSchema>;
export type SpeakerStatus = z.infer<typeof SpeakerStatusSchema>;
export type EmployerApprovalStatus = z.infer<typeof EmployerApprovalStatusSchema>;
