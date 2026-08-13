import { z } from "zod";

export const AcceptedMediaTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const CreateFileRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().max(4_000).default(""),
  dueAt: z.iso.datetime().nullable(),
  eventSpeakerIds: z.array(z.uuid()).min(1),
  acceptedMediaTypes: z.array(z.enum(AcceptedMediaTypes)).min(1).default([...AcceptedMediaTypes]),
  maxByteSize: z.number().int().positive().max(250 * 1024 * 1024).default(100 * 1024 * 1024),
  handoff: z.enum(["session_file", "speaker_headshot"]).default("session_file"),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export const CommentSchema = z.object({ body: z.string().trim().min(1).max(4_000) });
export const ReviewDeliverableSchema = z.object({
  status: z.enum(["changes_requested", "approved"]),
  reason: z.string().trim().min(1).max(2_000).nullable().default(null),
  requestWithoutNote: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.status === "changes_requested" && !value.reason && !value.requestWithoutNote) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Add actionable feedback or explicitly confirm a request without a note." });
  }
});
export const UpdateSessionContentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  abstract: z.string().max(20_000),
  expectedRevision: z.number().int().positive(),
});
export const SessionApprovalSchema = z.object({
  status: z.enum(["draft", "in_review", "approved"]),
  expectedRevision: z.number().int().positive(),
});
export const RestoreVersionSchema = z.object({ expectedRevision: z.number().int().positive() });
export const UpdateSpeakerContentSchema = z.object({
  biography: z.string().max(20_000),
  company: z.string().trim().max(300),
  jobTitle: z.string().trim().max(300),
  expectedVersion: z.number().int().nonnegative(),
});
export const RequestBundleExportSchema = z.object({
  deliverableIds: z.array(z.uuid()).min(1).max(500),
  grouping: z.enum(["session", "speaker", "flat"]).default("session"),
});

export const ProfileHeadshotUploadSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().trim().min(12).max(200),
});

export type CreateFileRequestInput = z.infer<typeof CreateFileRequestSchema>;
export type UpdateSessionContentInput = z.infer<typeof UpdateSessionContentSchema>;
export type UpdateSpeakerContentInput = z.infer<typeof UpdateSpeakerContentSchema>;
