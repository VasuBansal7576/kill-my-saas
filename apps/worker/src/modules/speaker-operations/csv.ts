import { AddSpeakerInputSchema, type AddSpeakerInput } from "./contracts";

export interface SpeakerCsvRow {
  row: number;
  input: AddSpeakerInput;
}

export function parseSpeakerCsv(csv: string): SpeakerCsvRow[] {
  const records = parseRecords(csv);
  const header = records.shift()?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const required = ["name", "email", "title", "company", "bio"];
  for (const column of required) {
    if (!header.includes(column)) throw new Error(`CSV is missing the required ${column} column.`);
  }

  return records.flatMap((record, index) => {
    if (record.every((cell) => cell.trim() === "")) return [];
    const value = (column: string) => record[header.indexOf(column)]?.trim() ?? "";
    const parsed = AddSpeakerInputSchema.safeParse({
      displayName: value("name"),
      email: value("email"),
      jobTitle: value("title"),
      company: value("company"),
      biography: value("bio"),
    });
    if (!parsed.success) throw new Error(`CSV row ${index + 2} is invalid: ${parsed.error.issues[0]?.message ?? "Invalid speaker"}`);
    return [{ row: index + 2, input: parsed.data }];
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
