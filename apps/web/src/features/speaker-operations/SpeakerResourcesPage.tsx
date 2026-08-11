import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { jsonRequest, requestJson } from "./api";
import styles from "./speaker-operations.module.css";
import type { SpeakerResource } from "./types";

const emptyResource: SpeakerResource = { id: "", slug: "", title: "", summary: "", contentHtml: "<h2>Resource title</h2><p>Add useful speaker guidance here.</p>", status: "draft", visibleToStatuses: ["invited", "onboarding", "ready"], allowedEmbedOrigins: [], revision: 0 };

export function SpeakerResourcesPage() {
  const { eventSlug = "" } = useParams();
  const [resources, setResources] = useState<SpeakerResource[]>([]);
  const [selected, setSelected] = useState<SpeakerResource>(emptyResource);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const rows = await requestJson<SpeakerResource[]>(`/api/v1/organizer/events/${eventSlug}/resources`); setResources(rows); if (!selected.id && rows[0]) setSelected(rows[0]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Resources could not be loaded."); }
  }, [eventSlug, selected.id]);
  useEffect(() => {
    let active = true;
    void requestJson<SpeakerResource[]>(`/api/v1/organizer/events/${eventSlug}/resources`).then((rows) => {
      if (!active) return;
      setResources(rows);
      if (rows[0]) setSelected(rows[0]);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "Resources could not be loaded.");
    });
    return () => { active = false; };
  }, [eventSlug]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget); const slug = String(form.get("slug"));
    try {
      const saved = await requestJson<SpeakerResource>(`/api/v1/organizer/events/${eventSlug}/resources/${slug}`, jsonRequest("PUT", {
        title: form.get("title"), summary: form.get("summary"), contentHtml: form.get("contentHtml"), status: form.get("status"),
        visibleToStatuses: ["invited", "onboarding", "ready"],
        allowedEmbedOrigins: String(form.get("allowedEmbedOrigins") ?? "").split("\n").map((value) => value.trim()).filter(Boolean),
        ...(selected.revision ? { expectedRevision: selected.revision } : {}),
      }));
      setSelected(saved); setMessage("Resource sanitized and persisted."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The resource could not be saved."); }
    finally { setSaving(false); }
  }

  return <div className={styles.workspace}><header className={styles.pageHead}><div><p className={styles.eyebrow}>Speaker portal</p><h1>Resources & wiki</h1><p>Keep trusted reference material beside speaker tasks, with controlled external embeds.</p></div><button className={styles.primaryButton} onClick={() => setSelected(emptyResource)} type="button">New page</button></header>{message ? <div className={styles.notice} role="status">{message}</div> : null}<div className={styles.resourceLayout}><aside className={styles.resourceList}>{resources.map((resource) => <button type="button" key={resource.id} className={resource.id === selected.id ? styles.selectedResource : ""} onClick={() => setSelected(resource)}><strong>{resource.title}</strong><small>{resource.status} · revision {resource.revision}</small></button>)}</aside><form className={styles.editor} key={`${selected.id}:${selected.revision}`} onSubmit={(event) => void save(event)}><div className={styles.sectionHead}><h2>{selected.id ? "Edit resource" : "New resource"}</h2><span>Sanitized on save</span></div><div className={styles.formGrid}><label>Title<input required name="title" defaultValue={selected.title} /></label><label>Slug<input required readOnly={Boolean(selected.id)} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={selected.slug} /></label><label className={styles.wide}>Summary<input name="summary" defaultValue={selected.summary} /></label><label>Status<select name="status" defaultValue={selected.status}><option value="draft">Draft</option><option value="published">Published</option></select></label><label>Allowed HTTPS embed origins<textarea name="allowedEmbedOrigins" rows={2} defaultValue={selected.allowedEmbedOrigins?.join("\n")} placeholder="https://scheduler.example.com" /></label><label className={styles.wide}>HTML content<textarea name="contentHtml" rows={12} defaultValue={selected.contentHtml} /></label></div><p className={styles.help}>Scripts, event handlers, unsafe links, and unapproved iframes are removed. Published resources are visible only to eligible event speakers.</p><button className={styles.primaryButton} disabled={saving}>{saving ? "Saving…" : "Save resource"}</button></form><section className={styles.resourcePreview}><div className={styles.sectionHead}><h2>Last saved preview</h2><span>Portal rendering</span></div><div className={styles.renderedHtml} dangerouslySetInnerHTML={{ __html: selected.contentHtml }} /></section></div></div>;
}
