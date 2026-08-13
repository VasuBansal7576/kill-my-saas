import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { jsonRequest, publicProgramRequest } from "./api";
import type {
  EmbedOutputFormat,
  PublishingWorkspace,
  PublicWidgetType,
  WidgetConfiguration,
  WidgetField,
} from "./types";
import "./public-program.css";

const widgetTypes: Array<{ value: PublicWidgetType; label: string }> = [
  { value: "sessions", label: "Sessions" },
  { value: "speakers", label: "Speakers" },
  { value: "agenda", label: "Agenda" },
  { value: "itinerary", label: "Itinerary" },
  { value: "speaker_gallery", label: "Speaker gallery" },
];
const allFields: WidgetField[] = ["title", "description", "date_time", "room", "track", "format", "speakers", "speaker_company", "speaker_job_title"];
const allOutputs: EmbedOutputFormat[] = ["styled", "basic", "json", "xml", "ical"];

export function PublishProgramPage() {
  const { eventSlug = "" } = useParams();
  const [workspace, setWorkspace] = useState<PublishingWorkspace | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [widgetType, setWidgetType] = useState<PublicWidgetType>("sessions");
  const [name, setName] = useState("Public sessions");
  const [slug, setSlug] = useState("public-sessions");
  const [primaryColor, setPrimaryColor] = useState("#6c94f9");
  const [backgroundColor, setBackgroundColor] = useState("#111111");
  const [textColor, setTextColor] = useState("#eeeeee");
  const [showEventBranding, setShowEventBranding] = useState(true);
  const [trackId, setTrackId] = useState("");
  const [formatId, setFormatId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [fields, setFields] = useState<WidgetField[]>(allFields);
  const [outputs, setOutputs] = useState<EmbedOutputFormat[]>(allOutputs);

  const load = useCallback(async () => {
    const result = await publicProgramRequest<PublishingWorkspace>(`/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/publish`);
    setWorkspace(result);
    const active = result.publication?.scheduleRevisionId;
    const latestReady = [...result.revisions].reverse().find((revision) => revision.status === "ready")?.id;
    setSelectedRevisionId((current) => current && result.revisions.some((revision) => revision.id === current) ? current : active ?? latestReady ?? "");
  }, [eventSlug]);

  useEffect(() => {
    let active = true;
    void publicProgramRequest<PublishingWorkspace>(`/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/publish`)
      .then((result) => {
        if (!active) return;
        setWorkspace(result);
        const currentRevisionId = result.publication?.scheduleRevisionId
          ?? [...result.revisions].reverse().find((revision) => revision.status === "ready")?.id
          ?? "";
        setSelectedRevisionId(currentRevisionId);
      })
      .catch((caught: unknown) => { if (active) setError(message(caught)); });
    return () => { active = false; };
  }, [eventSlug]);

  const selectedRevision = useMemo(() => workspace?.revisions.find((revision) => revision.id === selectedRevisionId) ?? null, [selectedRevisionId, workspace]);
  const liveOrigin = typeof window !== "undefined" && window.location.protocol === "https:" && !["localhost", "127.0.0.1"].includes(window.location.hostname);

  async function publish() {
    if (!workspace || !selectedRevisionId) return;
    await mutate(async () => {
      await publicProgramRequest<{ publicRevision: number }>(
        `/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/publish`,
        jsonRequest("POST", {
          eventId: workspace.event.id,
          scheduleRevisionId: selectedRevisionId,
          idempotencyKey: `publish-${crypto.randomUUID()}`,
        }),
      );
      await load();
      setNotice(workspace.publication?.state === "live" ? "Public program updated." : "Public program is live.");
    });
  }

  async function pause() {
    await mutate(async () => {
      await publicProgramRequest(
        `/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/publish/pause`,
        jsonRequest("POST", { idempotencyKey: `pause-${crypto.randomUUID()}` }),
      );
      await load();
      setNotice("Public access is paused.");
    });
  }

  async function saveWidget() {
    await mutate(async () => {
      await publicProgramRequest<WidgetConfiguration>(
        `/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/publish/widgets/${encodeURIComponent(slug)}`,
        jsonRequest("PUT", {
          slug,
          name,
          widgetType,
          branding: { primaryColor, backgroundColor, textColor, showEventBranding },
          filters: { trackIds: trackId ? [trackId] : [], formatIds: formatId ? [formatId] : [], roomIds: roomId ? [roomId] : [] },
          fields,
          outputFormats: outputs,
        }),
      );
      await load();
      setNotice(`${name} is ready to share.`);
    });
  }

  async function mutate(operation: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  function toggleField(field: WidgetField) {
    setFields((current) => current.includes(field) ? current.filter((candidate) => candidate !== field) : [...current, field]);
  }

  function toggleOutput(output: EmbedOutputFormat) {
    setOutputs((current) => current.includes(output) ? current.filter((candidate) => candidate !== output) : [...current, output]);
  }

  function selectWidget(widget: WidgetConfiguration) {
    setWidgetType(widget.widgetType);
    setName(widget.name);
    setSlug(widget.slug);
    setPrimaryColor(widget.branding.primaryColor);
    setBackgroundColor(widget.branding.backgroundColor);
    setTextColor(widget.branding.textColor);
    setShowEventBranding(widget.branding.showEventBranding);
    setTrackId(widget.filters.trackIds[0] ?? "");
    setFormatId(widget.filters.formatIds[0] ?? "");
    setRoomId(widget.filters.roomIds[0] ?? "");
    setFields(widget.fields);
    setOutputs(widget.outputFormats);
  }

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(success);
    } catch {
      setError("Clipboard access is unavailable. Open the link and copy it from the address bar.");
    }
  }

  if (!workspace) return <section className="publication-loading"><p>{error ?? "Loading public program settings…"}</p></section>;

  return <div className="publication-workspace">
    <header className="publication-head">
      <div><p className="publication-kicker">Deliver</p><h1>Public program</h1><p>Update the public schedule, then copy a link or embed for your event website.</p></div>
      <div className="publication-state"><i className={workspace.publication?.state === "live" ? "live" : ""} /><span><strong>{workspace.publication?.state === "live" ? "Live" : "Not live"}</strong><small>{workspace.publication?.state === "paused" ? "Public access paused" : workspace.publication?.state === "live" ? "Visible to attendees" : "Ready when you are"}</small></span></div>
    </header>

    {error ? <div className="publication-alert error" role="alert">{error}</div> : null}
    {notice ? <div className="publication-alert success" role="status">{notice}</div> : null}

    <section className="publication-gate">
      <div className="publication-gate-copy"><span>Schedule update</span><h2>{selectedRevision?.status === "ready" ? "Your latest conflict-free schedule is ready" : "Finish the schedule before publishing"}</h2><p>{workspace.eligibility.approvedSessions} approved session{workspace.eligibility.approvedSessions === 1 ? " is" : "s are"} ready. {workspace.eligibility.excludedSessions} unapproved session{workspace.eligibility.excludedSessions === 1 ? " stays" : "s stay"} private.</p></div>
      <div className="publication-gate-controls">
        <button type="button" className="publication-primary" disabled={busy || selectedRevision?.status !== "ready"} onClick={() => { void publish(); }}>{busy ? "Updating…" : workspace.publication?.state === "live" ? "Update public program" : "Publish public program"}</button>
        <details className="publication-advanced"><summary>Advanced publication settings</summary><label>Schedule version<select value={selectedRevisionId} onChange={(event) => setSelectedRevisionId(event.target.value)}><option value="">Choose version</option>{workspace.revisions.map((revision) => <option value={revision.id} key={revision.id}>Version {revision.version} · {revision.status} · {revision.placementCount} sessions</option>)}</select></label>{workspace.publication?.state === "live" ? <button className="publication-secondary" type="button" disabled={busy} onClick={() => { void pause(); }}>Pause public access</button> : null}<small>Public update {workspace.publication?.publicRevision ?? 0}; schedule version {selectedRevision?.version ?? "none"}.</small></details>
      </div>
      <div className="publication-metrics"><article><span>Total sessions</span><strong>{workspace.eligibility.totalSessions}</strong></article><article><span>Approved & eligible</span><strong>{workspace.eligibility.approvedSessions}</strong></article><article><span>Excluded as unapproved</span><strong>{workspace.eligibility.excludedSessions}</strong></article></div>
    </section>

    <section className="widget-studio">
      <div className="widget-studio-head"><div><span>Links & embeds</span><h2>Share a public view</h2><p>Choose what attendees should see, save it, then copy the link or website embed.</p></div></div>
      <div className="widget-studio-grid">
        <form className="widget-form" onSubmit={(event) => { event.preventDefault(); void saveWidget(); }}>
          <div className="widget-form-row simple"><label>Public view<select value={widgetType} onChange={(event) => setWidgetType(event.target.value as PublicWidgetType)}>{widgetTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label></div>
          <button className="publication-primary" type="submit" disabled={busy || fields.length === 0 || outputs.length === 0}>{busy ? "Saving…" : "Save share option"}</button>
          <details className="widget-advanced"><summary>Advanced: branding, filters, fields, and feeds</summary><label>Link name<input value={slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => setSlug(event.target.value)} required /></label><fieldset><legend>Branding</legend><div className="widget-form-row colors"><label>Accent<input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} /></label><label>Background<input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /></label><label>Text<input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label className="widget-check"><input type="checkbox" checked={showEventBranding} onChange={(event) => setShowEventBranding(event.target.checked)} /> Event branding</label></div></fieldset><fieldset><legend>Content filters</legend><div className="widget-form-row"><CatalogSelect label="Track" value={trackId} options={workspace.catalogs.tracks} change={setTrackId} /><CatalogSelect label="Format" value={formatId} options={workspace.catalogs.formats} change={setFormatId} /><CatalogSelect label="Room" value={roomId} options={workspace.catalogs.rooms} change={setRoomId} /></div></fieldset><fieldset><legend>Visible fields</legend><div className="widget-check-grid">{allFields.map((field) => <label className="widget-check" key={field}><input type="checkbox" checked={fields.includes(field)} onChange={() => toggleField(field)} /> {field.replaceAll("_", " ")}</label>)}</div></fieldset><fieldset><legend>Advanced feeds</legend><div className="widget-check-grid outputs">{allOutputs.map((output) => <label className="widget-check" key={output}><input type="checkbox" checked={outputs.includes(output)} onChange={() => toggleOutput(output)} /> {output === "ical" ? "iCalendar" : output.toUpperCase()}</label>)}</div></fieldset><span className={liveOrigin ? "origin-proof ready" : "origin-proof blocked"}>{liveOrigin ? "HTTPS is ready for external embeds" : "External embed testing requires deployed HTTPS"}</span></details>
        </form>

        <aside className="widget-list"><header><strong>Saved links & embeds</strong><span>{workspace.widgets.length}</span></header>{workspace.widgets.length === 0 ? <p className="widget-empty">Save a public view to create its link and embed.</p> : workspace.widgets.map((widget) => <article key={widget.id}>
          <button className="widget-select" type="button" onClick={() => selectWidget(widget)}><span>{widget.widgetType.replaceAll("_", " ")}</span><strong>{widget.name}</strong></button>
          <div className="widget-links"><a href={widget.publicUrl} target="_blank" rel="noreferrer">Open</a><button type="button" onClick={() => { void copy(new URL(widget.publicUrl, window.location.origin).toString(), `${widget.name} link copied.`); }}>Copy link</button><button type="button" onClick={() => { void copy(widget.styledIframeSnippet, `${widget.name} embed copied.`); }}>Copy embed</button></div>
          <details><summary>View embed code & advanced formats</summary><small>Configuration version {widget.revision} · iframe and script code plus every saved feed</small><div className="advanced-output-links">{widget.outputFormats.filter((output) => output !== "styled").map((output) => widget.outputUrls[output] ? <a key={output} href={widget.outputUrls[output]} target="_blank" rel="noreferrer">{output === "ical" ? "iCalendar" : output.toUpperCase()}</a> : null)}</div><label>Iframe HTML<textarea readOnly value={widget.styledIframeSnippet} /></label><label>Script HTML<textarea readOnly value={widget.styledScriptSnippet} /></label></details>
        </article>)}</aside>
      </div>
    </section>
  </div>;
}

function CatalogSelect(props: { label: string; value: string; options: Array<{ id: string; name: string }>; change(value: string): void }) {
  return <label>{props.label}<select value={props.value} onChange={(event) => props.change(event.target.value)}><option value="">All {props.label.toLocaleLowerCase()}s</option>{props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The public program could not be updated.";
}
