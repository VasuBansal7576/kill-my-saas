import { CreateSubmissionCommandSchema } from "@programflow/contracts";
import type { FormFieldDefinition, PublishedFormDefinition } from "@programflow/database";
import { z } from "zod";

const ConditionSchema = z.object({
  fieldKey: z.string().trim().min(1).max(80),
  operator: z.enum(["equals", "not_equals"]),
  value: z.unknown(),
});

const FieldSettingsSchema = z.object({
  options: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  helpText: z.string().trim().max(500).optional(),
  catalog: z.enum(["track", "format"]).optional(),
  routeByValue: z.record(z.string(), z.string().trim().min(1).max(120)).optional(),
}).catchall(z.unknown());

export const FormFieldInputSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/, "Use a lowercase field key."),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["short_text", "long_text", "select", "multi_select", "checkbox", "date"]),
  required: z.boolean().default(false),
  settings: FieldSettingsSchema.default({}),
  condition: ConditionSchema.nullable().default(null),
});

export const FormConfigurationInputSchema = z.object({
  name: z.string().trim().min(3).max(160),
  target: z.enum(["abstract", "session"]),
  opensAt: z.iso.datetime().nullable(),
  closesAt: z.iso.datetime().nullable(),
  welcomeCopy: z.string().trim().max(10_000).default(""),
  instructionsCopy: z.string().trim().max(20_000).default(""),
  successCopy: z.string().trim().max(10_000).default(""),
  allowDrafts: z.boolean().default(true),
  allowMultipleDrafts: z.boolean().default(true),
  draftsCountTowardLimit: z.boolean().default(false),
  allowSubmittedEdits: z.boolean().default(true),
  confirmationEmailEnabled: z.boolean().default(true),
  draftReminderEnabled: z.boolean().default(true),
  draftReminderLeadHours: z.number().int().min(1).max(720).default(48),
  maxSubmissionsPerPerson: z.number().int().min(1).max(100).nullable(),
  minimumParticipants: z.number().int().min(1).max(20),
  maximumParticipants: z.number().int().min(1).max(20),
  participantRoleLabels: z.object({
    author: z.string().trim().min(1).max(80),
    co_author: z.string().trim().min(1).max(80),
    presenter: z.string().trim().min(1).max(80),
  }),
  fields: z.array(FormFieldInputSchema).max(100),
  revision: z.number().int().positive().optional(),
}).superRefine((input, context) => {
  if (input.opensAt && input.closesAt && input.opensAt >= input.closesAt) {
    context.addIssue({ code: "custom", path: ["closesAt"], message: "The close time must be after the open time." });
  }
  if (input.minimumParticipants > input.maximumParticipants) {
    context.addIssue({ code: "custom", path: ["maximumParticipants"], message: "Maximum participants must be at least the minimum." });
  }

  const keys = new Set<string>();
  input.fields.forEach((field, index) => {
    if (keys.has(field.key)) {
      context.addIssue({ code: "custom", path: ["fields", index, "key"], message: "Field keys must be unique." });
    }
    keys.add(field.key);
    const options = field.settings.options;
    if ((field.type === "select" || field.type === "multi_select") && field.settings.catalog === undefined && (!options || options.length === 0)) {
      context.addIssue({ code: "custom", path: ["fields", index, "settings", "options"], message: "Select fields need at least one option or an event catalog." });
    }
  });
  input.fields.forEach((field, index) => {
    if (field.condition && !keys.has(field.condition.fieldKey)) {
      context.addIssue({ code: "custom", path: ["fields", index, "condition", "fieldKey"], message: "Conditions must reference another field in this form." });
    }
    if (field.condition?.fieldKey === field.key) {
      context.addIssue({ code: "custom", path: ["fields", index, "condition"], message: "A field cannot depend on itself." });
    }
  });
});

export const SubmissionInputSchema = CreateSubmissionCommandSchema.omit({ eventSlug: true, formId: true });
export const DraftSubmissionInputSchema = z.object({
  title: z.string().trim().min(3).max(180),
  answers: z.record(z.string(), z.unknown()).default({}),
  participants: z.array(z.object({
    name: z.string().trim().min(1),
    email: z.email(),
    role: z.enum(["author", "co_author", "presenter"]),
  })).default([]),
  saveAsDraft: z.literal(true),
});

export type FormConfigurationInput = z.infer<typeof FormConfigurationInputSchema>;
export type SubmissionInput = z.infer<typeof SubmissionInputSchema> | z.infer<typeof DraftSubmissionInputSchema>;

export type FieldIssue = { field: string; message: string };

export function toPublishedDefinition(input: FormConfigurationInput): PublishedFormDefinition {
  return {
    target: input.target,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    welcomeCopy: input.welcomeCopy,
    instructionsCopy: input.instructionsCopy,
    successCopy: input.successCopy,
    allowDrafts: input.allowDrafts,
    allowMultipleDrafts: input.allowMultipleDrafts,
    draftsCountTowardLimit: input.draftsCountTowardLimit,
    allowSubmittedEdits: input.allowSubmittedEdits,
    confirmationEmailEnabled: input.confirmationEmailEnabled,
    draftReminderEnabled: input.draftReminderEnabled,
    draftReminderLeadHours: input.draftReminderLeadHours,
    maxSubmissionsPerPerson: input.maxSubmissionsPerPerson,
    minimumParticipants: input.minimumParticipants,
    maximumParticipants: input.maximumParticipants,
    participantRoleLabels: input.participantRoleLabels,
    fields: input.fields.map((field, sortOrder): FormFieldDefinition => ({ ...field, sortOrder })),
  };
}

export function formAvailability(
  status: "draft" | "published" | "closed",
  definition: Pick<PublishedFormDefinition, "opensAt" | "closesAt">,
  now = new Date(),
): "draft" | "upcoming" | "open" | "closed" {
  if (status === "draft") return "draft";
  if (status === "closed") return "closed";
  if (definition.opensAt && now < new Date(definition.opensAt)) return "upcoming";
  if (definition.closesAt && now >= new Date(definition.closesAt)) return "closed";
  return "open";
}

export function isFieldVisible(field: FormFieldDefinition, answers: Record<string, unknown>): boolean {
  if (!field.condition) return true;
  const equals = valuesEqual(answers[field.condition.fieldKey], field.condition.value);
  return field.condition.operator === "equals" ? equals : !equals;
}

export function validateSubmission(
  definition: PublishedFormDefinition,
  input: SubmissionInput,
  catalogValues: { tracks: ReadonlySet<string>; formats: ReadonlySet<string> },
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const knownKeys = new Set(definition.fields.map((field) => field.key));
  for (const key of Object.keys(input.answers)) {
    if (!knownKeys.has(key)) issues.push({ field: key, message: "This answer is not part of the published form." });
  }

  if (input.saveAsDraft) return issues;

  for (const field of definition.fields) {
    if (!isFieldVisible(field, input.answers)) continue;
    const value = input.answers[field.key];
    if (field.required && isBlank(value)) {
      issues.push({ field: field.key, message: `${field.label} is required.` });
      continue;
    }
    if (isBlank(value)) continue;
    validateFieldValue(field, value, catalogValues, issues);
  }

  if (input.participants.length < definition.minimumParticipants) {
    issues.push({ field: "participants", message: `Add at least ${definition.minimumParticipants} participant(s).` });
  }
  if (input.participants.length > definition.maximumParticipants) {
    issues.push({ field: "participants", message: `Add no more than ${definition.maximumParticipants} participant(s).` });
  }
  if (!input.participants.some((participant) => participant.role === "author")) {
    issues.push({ field: "participants", message: "At least one participant must be the primary author." });
  }
  const emails = new Set<string>();
  for (const participant of input.participants) {
    const email = participant.email.trim().toLowerCase();
    if (emails.has(email)) issues.push({ field: "participants", message: `Participant email ${email} is duplicated.` });
    emails.add(email);
  }

  return issues;
}

export function deriveRoutingKey(definition: PublishedFormDefinition, answers: Record<string, unknown>): string | null {
  for (const field of definition.fields) {
    if (!isFieldVisible(field, answers)) continue;
    const routes = field.settings.routeByValue;
    const value = answers[field.key];
    if (isStringRecord(routes) && typeof value === "string" && typeof routes[value] === "string") return routes[value];
  }
  return null;
}

function validateFieldValue(
  field: FormFieldDefinition,
  value: unknown,
  catalogs: { tracks: ReadonlySet<string>; formats: ReadonlySet<string> },
  issues: FieldIssue[],
) {
  if ((field.type === "short_text" || field.type === "long_text") && typeof value !== "string") {
    issues.push({ field: field.key, message: `${field.label} must be text.` });
  }
  if (field.type === "checkbox" && typeof value !== "boolean") {
    issues.push({ field: field.key, message: `${field.label} must be checked or unchecked.` });
  }
  if (field.type === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
    issues.push({ field: field.key, message: `${field.label} must be a date.` });
  }

  const allowed = allowedValues(field, catalogs);
  if (field.type === "select" && (typeof value !== "string" || !allowed.has(value))) {
    issues.push({ field: field.key, message: `Choose a valid ${field.label} option.` });
  }
  if (field.type === "multi_select" && (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !allowed.has(entry)))) {
    issues.push({ field: field.key, message: `Choose valid ${field.label} options.` });
  }
}

function allowedValues(
  field: FormFieldDefinition,
  catalogs: { tracks: ReadonlySet<string>; formats: ReadonlySet<string> },
): ReadonlySet<string> {
  if (field.settings.catalog === "track") return catalogs.tracks;
  if (field.settings.catalog === "format") return catalogs.formats;
  const options = Array.isArray(field.settings.options)
    ? field.settings.options.filter((option): option is string => typeof option === "string")
    : [];
  return new Set(options);
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) return left.some((entry) => Object.is(entry, right));
  return Object.is(left, right);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
