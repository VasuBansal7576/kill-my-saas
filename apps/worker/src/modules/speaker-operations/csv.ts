import { AddSpeakerInputSchema, type AddSpeakerInput } from "./contracts";

export interface SpeakerCsvRow {
  row: number;
  input: AddSpeakerInput;
}

export interface SpeakerCsvPreviewRow {
  row: number;
  input: {
    displayName: string;
    email: string;
    jobTitle: string;
    company: string;
    biography: string;
  };
  normalizedEmail: string;
  issues: Array<{ field: string; message: string }>;
  duplicateOfRow: number | null;
}

export function parseSpeakerCsv(csv: string): SpeakerCsvRow[] {
  const preview = previewSpeakerCsv(csv);
  const invalid = preview.find((row) => row.issues.length > 0);
  if (invalid) throw new Error(`CSV row ${invalid.row} is invalid: ${invalid.issues[0]?.message ?? "Invalid speaker"}`);
  return preview.map((row) => ({ row: row.row, input: AddSpeakerInputSchema.parse(row.input) }));
}

export function previewSpeakerCsv(csv: string): SpeakerCsvPreviewRow[] {
  const records = parseRecords(csv);
  const header = records.shift()?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const required = ["name", "email", "title", "company", "bio"];
  for (const column of required) {
    if (!header.includes(column)) throw new Error(`CSV is missing the required ${column} column.`);
  }

  const firstRowByEmail = new Map<string, number>();
  return records.flatMap((record, index) => {
    if (record.every((cell) => cell.trim() === "")) return [];
    const value = (column: string) => record[header.indexOf(column)]?.trim() ?? "";
    const input = {
      displayName: value("name"),
      email: value("email"),
      jobTitle: value("title"),
      company: value("company"),
      biography: value("bio"),
    };
    const parsed = AddSpeakerInputSchema.safeParse(input);
    const normalizedEmail = input.email.trim().toLowerCase();
    const duplicateOfRow = normalizedEmail ? firstRowByEmail.get(normalizedEmail) ?? null : null;
    if (normalizedEmail && duplicateOfRow === null) firstRowByEmail.set(normalizedEmail, index + 2);
    return [{
      row: index + 2,
      input,
      normalizedEmail,
      issues: parsed.success ? [] : parsed.error.issues.map((issue) => ({
        field: typeof issue.path[0] === "string" ? issue.path[0] : "row",
        message: issue.message,
      })),
      duplicateOfRow,
    }];
  });
}

function parseRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n") {
      record.push(cell.replace(/\r$/, ""));
      records.push(record);
      record = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field.");
  if (cell.length > 0 || record.length > 0) {
    record.push(cell.replace(/\r$/, ""));
    records.push(record);
  }
  return records;
}
