export interface CalendarArtifactInput {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  startsAt: Date;
  endsAt: Date;
  generatedAt: Date;
  summary: string;
  description: string;
  location: string;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
}

export function buildSpeakerCalendar(input: CalendarArtifactInput): string {
  const status = input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//ProgramFlow//Speaker Calendar//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${utc(input.generatedAt)}`,
    `DTSTART:${utc(input.startsAt)}`,
    `DTEND:${utc(input.endsAt)}`,
    `SEQUENCE:${input.sequence}`,
    `STATUS:${status}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
    `LOCATION:${escapeText(input.location)}`,
    `ORGANIZER;CN=${escapeParameter(input.organizer.name)}:mailto:${input.organizer.email}`,
    `ATTENDEE;CN=${escapeParameter(input.attendee.name)};CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendee.email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}

function utc(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n");
}

function escapeParameter(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', "\\\"")}"`;
}

function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return [line];
  const folded: string[] = [];
  let current = "";
  for (const character of line) {
    const candidate = current + character;
    const limit = folded.length === 0 ? 75 : 74;
    if (encoder.encode(candidate).length > limit) {
      folded.push(folded.length === 0 ? current : ` ${current}`);
      current = character;
    } else current = candidate;
  }
  if (current) folded.push(folded.length === 0 ? current : ` ${current}`);
  return folded;
}
