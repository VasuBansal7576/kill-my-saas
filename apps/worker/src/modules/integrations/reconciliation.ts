import type { AirtableConfigurationRecord, AirtableEntity, AirtableRecord, CanonicalSyncRecord } from "./types";

const ID_FIELD = "_programflow_id";
const TYPE_FIELD = "_programflow_type";
const REVISION_FIELD = "_programflow_revision";
const UPDATED_FIELD = "_programflow_updated_at";

export function mapCanonicalRecord(record: CanonicalSyncRecord, configuration: AirtableConfigurationRecord): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [ID_FIELD]: record.canonicalId,
    [TYPE_FIELD]: record.entityType,
    [REVISION_FIELD]: record.revision,
    [UPDATED_FIELD]: record.updatedAt.toISOString(),
  };
  for (const mapping of configuration.mappings) {
    if (!mapping.enabled || mapping.entityType !== record.entityType || mapping.owner !== "programflow") continue;
    if (mapping.direction !== "export" && mapping.direction !== "both") continue;
    const value = record.fields[mapping.localField];
    if (value !== undefined && value !== null) fields[mapping.externalField] = toAirtableValue(value);
  }
  return fields;
}
export function readCanonicalIdentity(record: AirtableRecord): { canonicalId: string; entityType: AirtableEntity } | null {
  const canonicalId = record.fields[ID_FIELD];
  const entityType = record.fields[TYPE_FIELD];
  if (typeof canonicalId !== "string" || !isUuid(canonicalId)) return null;
  if (entityType !== "person" && entityType !== "speaker" && entityType !== "session") return null;
  return { canonicalId, entityType };
}

export function mapAirtableAugmentation(
  record: AirtableRecord,
  entityType: AirtableEntity,
  configuration: AirtableConfigurationRecord,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const mapping of configuration.mappings) {
    if (!mapping.enabled || mapping.entityType !== entityType || mapping.owner !== "airtable") continue;
    if (mapping.direction !== "import" && mapping.direction !== "both") continue;
    if (Object.hasOwn(record.fields, mapping.externalField)) attributes[mapping.localField] = record.fields[mapping.externalField];
  }
  return attributes;
}

export function readExternalModifiedAt(record: AirtableRecord, modifiedTimeField: string | null): Date | null {
  if (!modifiedTimeField) return null;
  const value = record.fields[modifiedTimeField];
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function localValueIsNewer(localUpdatedAt: Date, externalModifiedAt: Date): boolean {
  return localUpdatedAt.getTime() > externalModifiedAt.getTime();
}

function toAirtableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? JSON.stringify(item) : item);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
