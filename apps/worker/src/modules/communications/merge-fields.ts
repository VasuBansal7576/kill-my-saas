const MERGE_FIELD = /{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g;

export class MergeFieldError extends Error {
  constructor(readonly field: string) {
    super(`Merge field "${field}" has no recipient value.`);
  }
}

export function findMergeFields(...templates: ReadonlyArray<string>): string[] {
  const fields = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(MERGE_FIELD)) {
      const field = match[1];
      if (field) fields.add(field);
    }
  }
  return [...fields].sort();
}

export function renderMergeFields(template: string, values: Readonly<Record<string, unknown>>): string {
  return template.replace(MERGE_FIELD, (_placeholder, field: string) => {
    const value = values[field];
    if (value === undefined || value === null) throw new MergeFieldError(field);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (value instanceof Date) return value.toISOString();
    throw new MergeFieldError(field);
  });
}
