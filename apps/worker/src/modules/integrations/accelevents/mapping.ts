import type {
  AcceleventsConfiguration,
  AcceleventsEntity,
  AcceleventsRecordLink,
  CanonicalAcceleventsRecord,
} from "./types";

export interface MappedAcceleventsRecord {
  entityType: AcceleventsEntity;
  canonicalId: string;
  payload: Record<string, unknown>;
  fingerprint: string;
  operation: "create" | "update" | "skip" | "validate";
  externalId?: string;
  errors: Array<{ code: string; message: string }>;
}

export const defaultAcceleventsMappings = [
  { entityType: "speaker", canonicalField: "displayName.first", externalField: "firstName", required: true, enabled: true },
  { entityType: "speaker", canonicalField: "displayName.last", externalField: "lastName", required: true, enabled: true },
  { entityType: "speaker", canonicalField: "email", externalField: "email", required: true, enabled: true },
  { entityType: "speaker", canonicalField: "biography", externalField: "bio", required: false, enabled: true },
  { entityType: "speaker", canonicalField: "company", externalField: "company", required: false, enabled: true },
  { entityType: "speaker", canonicalField: "jobTitle", externalField: "title", required: false, enabled: true },
  { entityType: "session", canonicalField: "title", externalField: "title", required: true, enabled: true },
  { entityType: "session", canonicalField: "abstract", externalField: "description", required: false, enabled: true },
  { entityType: "session", canonicalField: "placement.startsAt", externalField: "startTime", required: true, enabled: true },
  { entityType: "session", canonicalField: "placement.endsAt", externalField: "endTime", required: true, enabled: true },
  { entityType: "session", canonicalField: "placement.room.name", externalField: "location", required: true, enabled: true },
  { entityType: "session", canonicalField: "format.id", externalField: "format", required: true, enabled: true },
  { entityType: "session", canonicalField: "track.id", externalField: "tracks", required: true, enabled: true },
  { entityType: "session", canonicalField: "speakerIds", externalField: "speakerList", required: true, enabled: true },
] as const;

export async function mapCanonicalRecord(
  record: CanonicalAcceleventsRecord,
  configuration: AcceleventsConfiguration,
  links: ReadonlyMap<string, AcceleventsRecordLink>,
  timezone: string,
): Promise<MappedAcceleventsRecord> {
  const payload: Record<string, unknown> = {};
  const errors: Array<{ code: string; message: string }> = [];
  const mappings = configuration.mappings.filter((mapping) => mapping.entityType === record.entityType && mapping.enabled);
  for (const mapping of mappings) {
    const value = resolveCanonicalValue(record, mapping.canonicalField, configuration, links, timezone);
    if (mapping.required && missing(value)) {
      errors.push({ code: "required_mapping_value_missing", message: `${record.entityType}.${mapping.canonicalField} has no mapped Accelevents value.` });
      continue;
    }
    if (!missing(value)) payload[mapping.externalField] = value;
  }
  if (!mappings.length) errors.push({ code: "field_mapping_missing", message: `No enabled ${record.entityType} field mappings are configured.` });
  if (record.entityType === "session") {
    payload.status = "VISIBLE";
    payload.sessionVisibilityType = "PUBLIC";
  } else {
    payload.allowAttendeeAccess = true;
  }
  const fingerprint = await stableFingerprint({ entityType: record.entityType, canonicalId: record.canonicalId, payload });
  const link = links.get(linkKey(record.entityType, record.canonicalId));
  return {
    entityType: record.entityType,
    canonicalId: record.canonicalId,
    payload,
    fingerprint,
    operation: errors.length ? "validate" : !link ? "create" : link.canonicalFingerprint === fingerprint ? "skip" : "update",
    externalId: link?.externalId,
    errors,
  };
}

function resolveCanonicalValue(
  record: CanonicalAcceleventsRecord,
  canonicalField: string,
  configuration: AcceleventsConfiguration,
  links: ReadonlyMap<string, AcceleventsRecordLink>,
  timezone: string,
): unknown {
  if (record.entityType === "speaker") {
    const name = splitName(record.displayName);
    const values: Record<string, unknown> = {
      "displayName.first": name.firstName,
      "displayName.last": name.lastName,
      email: record.email,
      biography: record.biography,
      company: record.company,
      jobTitle: record.jobTitle,
    };
    return values[canonicalField];
  }
  const reference = (type: "track" | "format", canonicalId: string | undefined) => canonicalId
    ? configuration.referenceMappings.find((mapping) => mapping.referenceType === type && mapping.canonicalId === canonicalId)?.externalValue
    : undefined;
  const values: Record<string, unknown> = {
    title: record.title,
    abstract: record.abstract,
    "placement.startsAt": formatProviderTime(record.placement.startsAt, timezone),
    "placement.endsAt": formatProviderTime(record.placement.endsAt, timezone),
    "placement.room.name": record.placement.room.name,
    "format.id": reference("format", record.format?.id),
    "track.id": reference("track", record.track?.id) ? [Number(reference("track", record.track?.id)) || reference("track", record.track?.id)] : undefined,
    speakerIds: record.speakerIds.map((id) => links.get(linkKey("speaker", id))?.externalId).filter((id): id is string => Boolean(id)).map((id) => ({ speakerId: Number(id) || id })),
  };
  if (canonicalField === "speakerIds" && record.speakerIds.length !== (values.speakerIds as unknown[]).length) return undefined;
  return values[canonicalField];
}

export function linkKey(entityType: AcceleventsEntity, canonicalId: string) { return `${entityType}:${canonicalId}`; }

export function formatProviderTime(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

function splitName(displayName: string) {
  const segments = displayName.trim().split(/\s+/).filter(Boolean);
  if (segments.length < 2) return { firstName: segments[0] ?? "", lastName: "" };
  return { firstName: segments.slice(0, -1).join(" "), lastName: segments.at(-1) ?? "" };
}

function missing(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

async function stableFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
