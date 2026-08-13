import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { jsonRequest, requestJson } from "./api";
import { htmlToMarkdown, markdownToSafeHtml } from "./resource-markdown";
import styles from "./speaker-operations.module.css";
import type { SpeakerResource } from "./types";

type AuthoringMode = "markdown" | "advanced_html";
const emptyResource: SpeakerResource = { id: "", slug: "", title: "", summary: "", contentHtml: "", status: "draft", visibleToStatuses: ["invited", "onboarding", "ready"], allowedEmbedOrigins: [], revision: 0 };
const starterMarkdown = "# Resource title\n\nAdd the guidance speakers need here.\n\n## Before the event\n\n- Complete your profile\n- Review your session details";

export function SpeakerResourcesPage() {
  const { eventSlug = "" } = useParams();
  const [resources, setResources] = useState<SpeakerResource[]>([]);
  const [selected, setSelected] = useState<SpeakerResource>(emptyResource);
  const [draft, setDraft] = useState<SpeakerResource>(emptyResource);
  const [source, setSource] = useState(starterMarkdown);
  const [mode, setMode] = useState<AuthoringMode>("markdown");
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);

  const choose = useCallback((resource: SpeakerResource) => {
    const advanced = /<iframe\b/i.test(resource.contentHtml);
    setSelected(resource);
    setDraft(resource);
    setMode(advanced ? "advanced_html" : "markdown");
    setSource(advanced ? resource.contentHtml : htmlToMarkdown(resource.contentHtml) || starterMarkdown);
    setMessage(null);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const rows = await requestJson<SpeakerResource[]>(`/api/v1/organizer/events/${eventSlug}/resources`);
      setResources(rows);
      if (selected.id) {
        const current = rows.find((resource) => resource.id === selected.id);
        if (current) choose(current);
      } else if (rows[0]) choose(rows[0]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Resources could not be loaded.");
    }
  }, [choose, eventSlug, selected.id]);

  useEffect(() => {
    let active = true;
    void requestJson<SpeakerResource[]>(`/api/v1/organizer/events/${eventSlug}/resources`).then((rows) => {
      if (!active) return;
      setResources(rows);
      if (rows[0]) choose(rows[0]);
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Resources could not be loaded.");
    });
    return () => { active = false; };
  }, [choose, eventSlug]);

  function startNewResource() {
    setSelected(emptyResource);
    setDraft(emptyResource);
    setMode("markdown");
    setSource(starterMarkdown);
    setMessage("Start with the title and guidance. You can save a private draft before publishing.");
  }

  function update<Key extends keyof SpeakerResource>(key: Key, value: SpeakerResource[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(status: "draft" | "published") {
    const issue = validateResource(draft, source);
    if (issue) { setMessage(issue); return; }
    setSaving(status);
    setMessage(null);
    try {
      const contentHtml = mode === "markdown" ? markdownToSafeHtml(source) : source;
      const saved = await requestJson<SpeakerResource>(`/api/v1/organizer/events/${eventSlug}/resources/${draft.slug}`, jsonRequest("PUT", {
        title: draft.title,
        summary: draft.summary,
        contentHtml,
        status,
        visibleToStatuses: ["invited", "onboarding", "ready"],
        allowedEmbedOrigins: draft.allowedEmbedOrigins ?? [],
        ...(selected.revision ? { expectedRevision: selected.revision } : {}),
      }));
      setSelected(saved);
      setDraft(saved);
      setSource(mode === "markdown" ? htmlToMarkdown(saved.contentHtml) : saved.contentHtml);
      setMessage(status === "published" ? "Published. Eligible speakers can now read this sanitized resource." : "Draft saved privately. Speakers cannot see it until you publish.");
      setResources((current) => [saved, ...current.filter((resource) => resource.id !== saved.id)]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The resource could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  const previewHtml = useMemo(() => mode === "markdown" ? markdownToSafeHtml(source) : source, [mode, source]);

  return <div className={styles.workspace}>
    <header className={styles.pageHead}><div><p className={styles.eyebrow}>Speaker portal</p><h1>Resources & wiki</h1><p>Write useful speaker guidance, preview it, then deliberately save or publish.</p></div><button className={styles.primaryButton} onClick={startNewResource} type="button">New page</button></header>
    {message ? <div className={styles.notice} role="status" aria-live="polite">{message}</div> : null}
    {loadError ? <div className={styles.errorState} role="alert"><strong>Resources are unavailable.</strong><p>{loadError}</p><button className={styles.primaryButton} type="button" onClick={() => void load()}>Retry resources</button></div> : null}
    {!loadError && resources.length === 0 && !draft.title ? <section className={styles.firstResource}><p className={styles.eyebrow}>Your first resource</p><h2>Give speakers one reliable place to start.</h2><p>Create a handbook, arrival guide, slide checklist, or another page that stays beside their tasks.</p><button className={styles.primaryButton} type="button" onClick={startNewResource}>Create first resource</button></section> : null}
    <div className={styles.resourceLayout}>
      <aside className={styles.resourceList} aria-label="Portal resource pages">{resources.length ? resources.map((resource) => <button type="button" key={resource.id} className={resource.id === selected.id ? styles.selectedResource : ""} onClick={() => choose(resource)}><strong>{resource.title}</strong><small>{resource.status === "published" ? "Published to speakers" : "Private draft"}</small></button>) : <p className={styles.empty}>No saved pages yet.</p>}</aside>
      <section className={styles.editor} aria-labelledby="resource-editor-title">
        <div className={styles.sectionHead}><div><h2 id="resource-editor-title">{selected.id ? "Edit resource" : "New resource"}</h2><p className={styles.help}>{draft.status === "published" ? "Currently published" : "Currently a private draft"}</p></div><span>Sanitized on save</span></div>
        <div className={styles.formGrid}><label>Title<input required value={draft.title} onChange={(event) => update("title", event.target.value)} /></label><label>Page URL<input required readOnly={Boolean(selected.id)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} placeholder="speaker-handbook" onChange={(event) => update("slug", slugify(event.target.value))} /></label><label className={styles.wide}>Summary<input value={draft.summary} onChange={(event) => update("summary", event.target.value)} /></label></div>
        <fieldset className={styles.authoringMode}><legend>Writing mode</legend><label><input type="radio" name="resource-mode" checked={mode === "markdown"} onChange={() => { setMode("markdown"); setSource(mode === "advanced_html" ? htmlToMarkdown(source) : source); }} /> Simple formatting</label><label><input type="radio" name="resource-mode" checked={mode === "advanced_html"} onChange={() => { setMode("advanced_html"); setSource(mode === "markdown" ? markdownToSafeHtml(source) : source); }} /> Advanced HTML</label></fieldset>
        {mode === "markdown" ? <label>Page content <small>Use # for headings, - for lists, **bold**, *emphasis*, and [link text](https://example.com). No HTML knowledge needed.</small><textarea value={source} rows={14} onChange={(event) => setSource(event.target.value)} /></label> : <details open className={styles.advancedResource}><summary>Advanced HTML and embeds</summary><p>Use this only for trusted existing material. Scripts and unsafe attributes are removed by the existing server sanitizer when you save.</p><label>Allowed HTTPS embed origins <small>One exact origin per line, such as https://scheduler.example.com</small><textarea rows={3} value={(draft.allowedEmbedOrigins ?? []).join("\n")} onChange={(event) => update("allowedEmbedOrigins", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label><label>HTML content<textarea rows={14} value={source} onChange={(event) => setSource(event.target.value)} /></label></details>}
        <div className={styles.resourceActions}><button className={styles.secondaryButton} disabled={saving !== null} type="button" onClick={() => void save("draft")}>{saving === "draft" ? "Saving draft…" : "Save private draft"}</button><button className={styles.primaryButton} disabled={saving !== null} type="button" onClick={() => void save("published")}>{saving === "published" ? "Publishing…" : "Publish to speakers"}</button></div>
      </section>
      <section className={styles.resourcePreview}><div className={styles.sectionHead}><div><h2>Live authoring preview</h2><p className={styles.help}>{mode === "markdown" ? "Safe formatting preview" : "Sandboxed draft preview; saving still runs the server sanitizer"}</p></div><span>{draft.status === "published" ? "Published" : "Draft"}</span></div>{mode === "markdown" ? <div className={styles.renderedHtml} dangerouslySetInnerHTML={{ __html: previewHtml }} /> : <iframe className={styles.resourcePreviewFrame} title="Advanced HTML resource preview" sandbox="" srcDoc={previewHtml} />}</section>
    </div>
  </div>;
}

function validateResource(resource: SpeakerResource, source: string) {
  if (resource.title.trim().length < 2) return "Add a resource title before saving.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resource.slug)) return "Use a page URL made from lowercase letters, numbers, and hyphens.";
  if (!source.trim()) return "Add page content before saving.";
  if ((resource.allowedEmbedOrigins ?? []).some((origin) => !/^https:\/\/[^/]+$/i.test(origin))) return "Every embed origin must be an exact HTTPS origin without a path.";
  return null;
}

function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
