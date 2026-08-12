import { z } from "zod";

export const WorkspaceSlugSchema = z.string().trim().min(3).max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens.");

export const EventSetupInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug: WorkspaceSlugSchema,
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  timezone: z.string().trim().min(1).refine((value) => {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Timezone must be a valid IANA timezone."),
  location: z.string().trim().min(2).max(180),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#7c5cff"),
}).superRefine((value, context) => {
  if (value.endsOn < value.startsOn) {
    context.addIssue({ code: "custom", path: ["endsOn"], message: "End date must be on or after start date." });
  }
});

export const WorkspaceSetupInputSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(2).max(120),
    slug: WorkspaceSlugSchema,
  }),
  event: EventSetupInputSchema,
});

const uniqueNames = (values: ReadonlyArray<{ name: string } | string>) => {
  const normalized = values.map((value) => (typeof value === "string" ? value : value.name).trim().toLocaleLowerCase("en-US"));
  return new Set(normalized).size === normalized.length;
};

export const EventConfigurationInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  timezone: z.string().trim().min(1).refine((value) => {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Timezone must be a valid IANA timezone."),
  location: z.string().trim().min(2).max(180),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  tracks: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  formats: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    durationMinutes: z.number().int().min(5).max(480),
  })).min(1).max(20),
  rooms: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
}).superRefine((value, context) => {
  if (value.endsOn < value.startsOn) {
    context.addIssue({ code: "custom", path: ["endsOn"], message: "End date must be on or after start date." });
  }
  for (const [path, values] of [["tracks", value.tracks], ["formats", value.formats], ["rooms", value.rooms]] as const) {
    if (!uniqueNames(values)) context.addIssue({ code: "custom", path: [path], message: `${path} names must be unique.` });
  }
});

export const EventConfigurationSchema = EventConfigurationInputSchema.and(z.object({
  id: z.uuid(),
  slug: z.string(),
}));

export type EventConfigurationInput = z.infer<typeof EventConfigurationInputSchema>;
export type EventConfiguration = z.infer<typeof EventConfigurationSchema>;
export type EventSetupInput = z.infer<typeof EventSetupInputSchema>;
export type WorkspaceSetupInput = z.infer<typeof WorkspaceSetupInputSchema>;
