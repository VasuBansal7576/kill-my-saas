import { CreateCrmContactSchema, type CreateCrmContact } from "./contracts";

export class CrmCsvError extends Error {
  constructor(readonly row: number, message: string) {
    super(`CSV row ${row}: ${message}`);
  }
}

export interface ParsedCrmCsvRow { row: number; input: CreateCrmContact }

export function parseCrmCsv(csv: string): ParsedCrmCsvRow[] {
  const records = parseRecords(csv.replace(/^\uFEFF/, ""));
  if (records.length < 2) throw new CrmCsvError(1, "Include a header and at least one contact row.");
  if (records.length > 5_001) throw new CrmCsvError(1, "Import at most 5,000 contacts at a time.");
  const headers = records[0]?.map((value) => normalizeHeader(value)) ?? [];
  const displayNameIndex = findHeader(headers, ["displayname", "name", "fullname"]);
  const emailIndex = findHeader(headers, ["email", "emailaddress"]);
  if (displayNameIndex < 0 || emailIndex < 0) throw new CrmCsvError(1, "Required headers are name and email.");
  const known = new Set(["displayname", "name", "fullname", "email", "emailaddress", "company", "jobtitle", "title", "biography", "bio", "notes", "internalnotes", "tags"]);
  const seenEmails = new Map<string, number>();

  return records.slice(1).flatMap((record, offset) => {
    const row = offset + 2;
    if (record.every((value) => value.trim() === "")) return [];
    if (record.length > headers.length) throw new CrmCsvError(row, "The row has more columns than the header.");
    const value = (aliases: string[]) => {
      const index = findHeader(headers, aliases);
      return index < 0 ? "" : (record[index] ?? "").trim();
    };
    const email = value(["email", "emailaddress"]).toLowerCase();
    const priorRow = seenEmails.get(email);
    if (priorRow) throw new CrmCsvError(row, `Email duplicates row ${priorRow}; resolve it before importing.`);
    seenEmails.set(email, row);
    const customMetadata = Object.fromEntries(headers.flatMap((header, index) => {
      const rawHeader = records[0]?.[index]?.trim() ?? "";
      const cell = record[index]?.trim() ?? "";
      if (!cell || known.has(header)) return [];
      const key = rawHeader.replace(/^custom[.:_-]?/i, "").trim();
      return key ? [[key, cell]] : [];
    }));
    const parsed = CreateCrmContactSchema.safeParse({
      displayName: record[displayNameIndex]?.trim(),
      email,
      company: value(["company"]),
      jobTitle: value(["jobtitle", "title"]),
      biography: value(["biography", "bio"]),
      internalNotes: value(["notes", "internalnotes"]),
      tags: value(["tags"]).split(/[|;]/).map((tag) => tag.trim()).filter(Boolean),
      customMetadata,
    });
    if (!parsed.success) throw new CrmCsvError(row, parsed.error.issues[0]?.message ?? "Invalid contact data.");
    return [{ row, input: parsed.data }];
  });
}

function findHeader(headers: string[], alternatives: string[]) {
  return headers.findIndex((header) => alternatives.includes(header));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseRecords(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') {
      if (field.length) throw new CrmCsvError(rows.length + 1, "A quote must begin at the start of a field.");
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new CrmCsvError(rows.length + 1, "An opening quote is not closed.");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
