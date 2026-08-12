export type FieldType = "short_text" | "long_text" | "select" | "multi_select" | "checkbox" | "date";
export type ParticipantRole = "author" | "co_author" | "presenter";

export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
  settings: {
    options?: string[];
    helpText?: string;
    catalog?: "track" | "format";
    routeByValue?: Record<string, string>;
    [key: string]: unknown;
  };
  condition: { fieldKey: string; operator: "equals" | "not_equals"; value: unknown } | null;
};

export type FormDefinition = {
  target: "abstract" | "session";
  opensAt: string | null;
  closesAt: string | null;
  welcomeCopy: string;
  instructionsCopy: string;
  successCopy: string;
  allowDrafts: boolean;
  allowMultipleDrafts: boolean;
  draftsCountTowardLimit: boolean;
  allowSubmittedEdits: boolean;
  confirmationEmailEnabled: boolean;
  draftReminderEnabled: boolean;
  draftReminderLeadHours: number;
  maxSubmissionsPerPerson: number | null;
  minimumParticipants: number;
  maximumParticipants: number;
  participantRoleLabels: Record<ParticipantRole, string>;
  fields: FormField[];
};

export type FormWorkspace = {
  event: { id: string; slug: string; name: string; timezone: string };
  form: null | FormDefinition & {
    id: string;
    name: string;
    status: "draft" | "published" | "closed";
    revision: number;
    publishedVersion: number | null;
  };
};

export type PublicForm = {
  event: {
    slug: string;
    name: string;
    location: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
    primaryColor: string;
    tracks: string[];
    formats: string[];
  };
  form: {
    id: string;
    versionId: string;
    version: number;
    name: string;
    availability: "upcoming" | "open" | "closed";
    definition: FormDefinition;
  };
};

export type SubmissionRecord = {
  id: string;
  eventId: string;
  formId: string;
  formVersion: number;
  title: string;
  state: "draft" | "submitted";
  triageState: "unreviewed" | "maybe";
  decision: "accepted" | "rejected" | null;
  acceptedSession: { id: string; title: string } | null;
  routingKey: string | null;
  version: number;
  answers: Record<string, unknown>;
  participants: Array<{
    id: string;
    personId: string | null;
    name: string;
    email: string;
    role: ParticipantRole;
    sortOrder: number;
  }>;
  submittedAt: string | null;
  updatedAt: string;
};

export async function readApi<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string; fields?: Record<string, string[]> } } | T | null;
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body
      ? (body as { error?: { message?: string; fields?: Record<string, string[]> } }).error
      : undefined;
    const fieldMessage = error?.fields ? Object.values(error.fields).flat()[0] : undefined;
    throw new Error(fieldMessage ?? error?.message ?? "The request could not be completed.");
  }
  return body as T;
}

export function fieldIsVisible(field: FormField, answers: Record<string, unknown>): boolean {
  if (!field.condition) return true;
  const current = answers[field.condition.fieldKey];
  const equals = Array.isArray(current) ? current.includes(field.condition.value) : Object.is(current, field.condition.value);
  return field.condition.operator === "equals" ? equals : !equals;
}
