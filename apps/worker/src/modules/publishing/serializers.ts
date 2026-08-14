import type { PublishedProgram } from "./contracts";

interface WidgetPresentation {
  widgetType: "sessions" | "speakers" | "agenda" | "itinerary" | "speaker_gallery";
  branding: { primaryColor: string; backgroundColor: string; textColor: string; showEventBranding: boolean };
  fields: string[];
}

export function serializeCalendar(program: PublishedProgram, sessions = program.sessions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ProgramFlow//Published Program//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeCalendar(program.event.name)}`,
    `X-WR-TIMEZONE:${escapeCalendar(program.event.timezone)}`,
  ];
  for (const session of sessions) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${session.id}@programflow`,
      `DTSTAMP:${toUtc(new Date(program.publication.liveAt))}`,
      `DTSTART:${toUtc(new Date(session.startsAt))}`,
      `DTEND:${toUtc(new Date(session.endsAt))}`,
      `SEQUENCE:${program.publication.publicRevision}`,
      `SUMMARY:${escapeCalendar(session.title)}`,
      `DESCRIPTION:${escapeCalendar(session.description)}`,
      `LOCATION:${escapeCalendar(session.room.name)}`,
      `CATEGORIES:${escapeCalendar([session.track?.name, session.format?.name].filter(Boolean).join(","))}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(foldCalendarLine).join("\r\n") + "\r\n";
}

export function serializeXml(program: PublishedProgram): string {
  const sessions = program.sessions.map((session) => `  <session id="${xml(session.id)}">
    <title>${xml(session.title)}</title>
    <description>${xml(session.description)}</description>
    <startsAt>${xml(session.startsAt)}</startsAt>
    <endsAt>${xml(session.endsAt)}</endsAt>
    <room>${xml(session.room.name)}</room>
    <track>${xml(session.track?.name ?? "")}</track>
    <format>${xml(session.format?.name ?? "")}</format>
    <speakers>${session.speakers.map((speaker) => `<speaker id="${xml(speaker.id)}">${xml(speaker.name)}</speaker>`).join("")}</speakers>
  </session>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<publishedProgram event="${xml(program.event.slug)}" publicRevision="${program.publication.publicRevision}">\n${sessions}\n</publishedProgram>\n`;
}

export function serializeBasicHtml(program: PublishedProgram, presentation: WidgetPresentation): string {
  const body = presentation.widgetType === "speakers" || presentation.widgetType === "speaker_gallery"
    ? program.speakers.map((speaker) => `<article>${field(presentation, "speakers", `<h2>${html(speaker.name)}</h2>`)}${field(presentation, "speaker_job_title", `<p>${html(speaker.jobTitle || "Speaker")}</p>`)}${field(presentation, "speaker_company", `<p>${html(speaker.company)}</p>`)}</article>`).join("")
    : program.sessions.map((session) => `<article>${field(presentation, "title", `<h2>${html(session.title)}</h2>`)}${field(presentation, "description", `<p>${html(session.description)}</p>`)}${field(presentation, "date_time", `<time datetime="${html(session.startsAt)}">${html(session.startsAt)}–${html(session.endsAt)}</time>`)}${field(presentation, "room", `<p>${html(session.room.name)}</p>`)}${field(presentation, "track", `<p>${html(session.track?.name ?? "")}</p>`)}${field(presentation, "format", `<p>${html(session.format?.name ?? "")}</p>`)}${field(presentation, "speakers", `<p>${html(session.speakers.map((speaker) => speaker.name).join(", "))}</p>`)}</article>`).join("");
  return `<section data-programflow-widget="${presentation.widgetType}" data-public-revision="${program.publication.publicRevision}">${body}</section>`;
}

export function serializeStyledHtml(program: PublishedProgram, presentation: WidgetPresentation): string {
  const speakerMode = presentation.widgetType === "speakers" || presentation.widgetType === "speaker_gallery";
  const cards = speakerMode
    ? program.speakers.map((speaker) => `<article class="card" data-search="${html(speaker.name.toLocaleLowerCase())}">${field(presentation, "speakers", `<h2>${html(speaker.name)}</h2>`)}<div class="meta">${field(presentation, "speaker_job_title", html(speaker.jobTitle || "Speaker"))}${presentation.fields.includes("speaker_job_title") && presentation.fields.includes("speaker_company") ? " · " : ""}${field(presentation, "speaker_company", html(speaker.company))}</div></article>`).join("")
    : program.sessions.map((session) => `<article class="card" data-search="${html(`${session.title} ${session.speakers.map((speaker) => speaker.name).join(" ")}`.toLocaleLowerCase())}">${field(presentation, "title", `<h2>${html(session.title)}</h2>`)}<div class="meta">${field(presentation, "date_time", html(`${session.startsAt}–${session.endsAt}`))}${presentation.fields.includes("date_time") && presentation.fields.includes("room") ? " · " : ""}${field(presentation, "room", html(session.room.name))}</div>${field(presentation, "description", `<p>${html(session.description)}</p>`)}<div>${field(presentation, "track", `<span class="tag">${html(session.track?.name ?? "General")}</span>`)}${field(presentation, "format", `<span class="tag">${html(session.format?.name ?? "Session")}</span>`)}</div>${field(presentation, "speakers", `<p class="meta">${html(session.speakers.map((speaker) => speaker.name).join(", "))}</p>`)}</article>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(program.event.name)} · Program</title>
<style>:root{color-scheme:dark;font:14px/1.5 Inter,system-ui,sans-serif;background:${presentation.branding.backgroundColor};color:${presentation.branding.textColor};--accent:${presentation.branding.primaryColor}}*{box-sizing:border-box}body{margin:0;padding:18px}header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:16px}h1{font-size:20px;margin:0}input{width:min(420px,100%);padding:10px 12px;border:1px solid #555;border-radius:7px;background:transparent;color:inherit}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.card{padding:15px;border:1px solid color-mix(in srgb,var(--accent) 32%,#555);border-radius:8px;background:color-mix(in srgb,var(--accent) 7%,transparent)}h2{font-size:15px;margin:0 0 8px}.meta{opacity:.72;font-size:12px}.tag{display:inline-block;margin:8px 6px 0 0;padding:2px 7px;border:1px solid var(--accent);border-radius:999px;font-size:11px}@media(max-width:520px){body{padding:12px}header{align-items:stretch;flex-direction:column}}</style></head>
<body><header><div><h1>${presentation.branding.showEventBranding ? html(program.event.name) : "Program"}</h1><div class="meta">${html(program.event.location)} · live revision ${program.publication.publicRevision}</div></div><input id="search" type="search" placeholder="Search the program" aria-label="Search the program"></header><main class="grid" id="results">${cards}</main>
<script>const search=document.querySelector('#search');const cards=[...document.querySelectorAll('[data-search]')];search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase();for(const card of cards)card.hidden=!card.dataset.search.includes(q)});</script></body></html>`;
}

function field(presentation: WidgetPresentation, name: string, value: string): string {
  return presentation.fields.includes(name) ? value : "";
}

function toUtc(value: Date): string {
  return value.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function escapeCalendar(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\r\n", "\\n").replaceAll("\n", "\\n");
}

function foldCalendarLine(line: string): string[] {
  const chunks: string[] = [];
  let remainder = line;
  while (new TextEncoder().encode(remainder).length > 73) {
    let index = Math.min(73, remainder.length);
    while (new TextEncoder().encode(remainder.slice(0, index)).length > 73) index -= 1;
    chunks.push(remainder.slice(0, index));
    remainder = ` ${remainder.slice(index)}`;
  }
  chunks.push(remainder);
  return chunks;
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function html(value: string): string {
  return xml(value);
}
