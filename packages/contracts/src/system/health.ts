import { z } from "zod";

export const DependencyStatusSchema = z.object({
  configured: z.boolean(),
  detail: z.string(),
});

export const ReadinessResponseSchema = z.object({
  status: z.enum(["ready", "needs_configuration"]),
  service: z.literal("programflow"),
  environment: z.string(),
  commit: z.string(),
  dependencies: z.object({
    database: DependencyStatusSchema,
    auth: DependencyStatusSchema,
    email: DependencyStatusSchema,
    files: DependencyStatusSchema,
    queue: DependencyStatusSchema,
    ai: DependencyStatusSchema,
  }),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

