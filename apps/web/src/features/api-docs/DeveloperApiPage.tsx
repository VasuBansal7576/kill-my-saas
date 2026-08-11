import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import styles from "./api-docs.module.css";

const endpointDefinitions = [
  { label: "Event", suffix: "", note: "Dates, timezone, branding, catalogs, and live publication revision." },
  { label: "Sessions", suffix: "/sessions?limit=25&track=Applied%20AI", note: "Approved scheduled sessions with stable cursor pagination and filters." },
  { label: "Speakers", suffix: "/speakers?limit=25", note: "Public profiles for speakers represented in the live program." },
  { label: "Agenda", suffix: "/agenda?day=2027-05-12&limit=25", note: "Chronological placements filtered by day, room, track, or format." },
] as const;

export function DeveloperApiPage({ eventSlug: eventSlugOverride }: { eventSlug?: string }) {
  const params = useParams();
  const eventSlug = eventSlugOverride ?? params.eventSlug ?? "devflow-conf-2027";
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const baseUrl = `${origin}/api/v1/public/events/${encodeURIComponent(eventSlug)}`;
  const endpoints = useMemo(() => endpointDefinitions.map((endpoint) => ({
    ...endpoint,
    url: `${baseUrl}${endpoint.suffix}`,
  })), [baseUrl]);
  const curl = `curl --fail --header 'Accept: application/json' '${endpoints[1]?.url ?? baseUrl}'`;

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1_800);
    } catch {
      setCopied("unavailable");
    }
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><p>Developer API</p><h1>Use the live program anywhere.</h1><span>Anonymous, read-only JSON over the same approved and scheduled records used by public ProgramFlow surfaces.</span></div>
      <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI 3.1 ↗</a>
    </header>

    <section className={styles.notice} aria-label="API access policy">
      <i />
      <div><strong>No API key required</strong><span>Only a live Publication is readable. Unknown events return 404; draft or paused programs return 409 without leaking content.</span></div>
    </section>

    <section className={styles.endpoints} aria-labelledby="endpoint-heading">
      <div className={styles.sectionHead}><div><p>Version 1</p><h2 id="endpoint-heading">Endpoints</h2></div><code>application/json</code></div>
      {endpoints.map((endpoint) => <article key={endpoint.label}>
        <span className={styles.method}>GET</span>
        <div><strong>{endpoint.label}</strong><code>{endpoint.url}</code><p>{endpoint.note}</p></div>
        <button type="button" onClick={() => { void copy(endpoint.url, endpoint.label); }}>{copied === endpoint.label ? "Copied" : "Copy URL"}</button>
      </article>)}
    </section>

    <section className={styles.example} aria-labelledby="example-heading">
      <div className={styles.sectionHead}><div><p>Quick start</p><h2 id="example-heading">Request a filtered page</h2></div><button type="button" onClick={() => { void copy(curl, "curl"); }}>{copied === "curl" ? "Copied" : "Copy curl"}</button></div>
      <pre><code>{curl}</code></pre>
      <div className={styles.hints}><span><strong>Pagination</strong> Pass the returned <code>nextCursor</code> unchanged.</span><span><strong>Caching</strong> Revalidate with <code>If-None-Match</code>; unchanged responses return 304.</span></div>
    </section>

    {copied === "unavailable" ? <p className={styles.clipboardError} role="alert">Clipboard access is unavailable. Select the URL or command to copy it manually.</p> : null}
  </div>;
}
