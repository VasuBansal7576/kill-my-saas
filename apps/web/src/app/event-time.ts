export type EventDateTimeStyle = "date" | "date-time" | "time";

export function formatEventDateTime(
  value: string | Date,
  timeZone: string,
  style: EventDateTimeStyle = "date-time",
): string {
  const options: Intl.DateTimeFormatOptions = style === "date"
    ? { timeZone, year: "numeric", month: "short", day: "numeric", timeZoneName: "short" }
    : style === "time"
      ? { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }
      : { timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  return new Intl.DateTimeFormat(undefined, options).format(asDate(value));
}

export function formatEventTimeRange(
  startsAt: string,
  endsAt: string,
  timeZone: string,
  includeDate = false,
): string {
  const startOptions: Intl.DateTimeFormatOptions = includeDate
    ? { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { timeZone, hour: "numeric", minute: "2-digit" };
  const endOptions: Intl.DateTimeFormatOptions = { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  return `${new Intl.DateTimeFormat(undefined, startOptions).format(asDate(startsAt))}–${new Intl.DateTimeFormat(undefined, endOptions).format(asDate(endsAt))}`;
}

export function formatEventDateRange(startsOn: string, endsOn: string): string {
  const start = asDate(`${startsOn}T00:00:00Z`);
  const end = asDate(`${endsOn}T00:00:00Z`);
  const monthDay = (date: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(date);
  const full = (date: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(date);
  if (startsOn === endsOn) return full(start);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) return `${monthDay(start)}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  if (sameYear) return `${monthDay(start)}–${monthDay(end)}, ${end.getUTCFullYear()}`;
  return `${full(start)}–${full(end)}`;
}

export function eventDateTimeInputValue(value: string | null, timeZone: string): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(asDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function eventLocalDateTimeToIso(value: string, timeZone: string): string | null {
  if (!value) return null;
  const [day = "", time = ""] = value.split("T");
  const [year, month, date] = day.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  if (!year || !month || !date) throw new Error("Choose a valid event date and time.");
  const target = Date.UTC(year, month - 1, date, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const observed = Date.UTC(values.year ?? year, (values.month ?? month) - 1, values.day ?? date, values.hour ?? hour, values.minute ?? minute);
    const adjustment = target - observed;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate).toISOString();
}

function asDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("A valid event time is required.");
  return date;
}
