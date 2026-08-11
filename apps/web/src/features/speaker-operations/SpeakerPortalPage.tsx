import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { jsonRequest, requestJson } from "./api";
import styles from "./speaker-operations.module.css";
import type { SpeakerPortal } from "./types";

export function SpeakerPortalPage() {
  const { eventSlug = "" } = useParams();
  const [portal, setPortal] = useState<SpeakerPortal | null>(null);
  const [activeResource, setActiveResource] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, Record<string, unknown>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    void requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}`).then((next) => {
      if (!active) return;
      setPortal(next);
      setMessage(null);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "Your portal could not be loaded.");
    });
    return () => { active = false; };
  }, [eventSlug]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      setPortal(await requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}/profile`, jsonRequest("PATCH", {
        displayName: form.get("displayName"), biography: form.get("biography"), jobTitle: form.get("jobTitle"), company: form.get("company"),
        socialLinks: { linkedin: String(form.get("linkedin") ?? ""), twitter: String(form.get("twitter") ?? "") },
      })));
      setEditing(false); setMessage("Profile changes persisted for the organizer and public-program handoff.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your profile could not be saved."); }
  }

  async function completeTask(assignmentId: string) {
    try {
      setPortal(await requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}/task-assignments/${assignmentId}/complete`, jsonRequest("POST", { response: responses[assignmentId] ?? null })));
      setMessage("Task marked complete.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The task could not be completed."); }
  }

  if (!portal) return <div className={styles.portalShell}><p className={message ? styles.danger : styles.muted}>{message ?? "Loading your speaker portal…"}</p></div>;
  const { speaker } = portal;
  const selectedResource = portal.resources.find((resource) => resource.id === activeResource);
  return <div className={styles.portalShell}><header className={styles.portalHeader}><div><p className={styles.eyebrow}>Speaker portal · {portal.event.name}</p><h1>Welcome, {speaker.displayName.split(" ")[0]}</h1><p>Your sessions, tasks, profile, and resources—scoped to your event participation.</p></div><span className={`${styles.status} ${styles[speaker.status]}`}>{speaker.status}</span></header>{message ? <div className={styles.notice} role="status">{message}</div> : null}<section className={styles.portalMetrics}><Metric label="Tasks complete" value={`${speaker.taskProgress.complete}/${speaker.taskProgress.total}`} /><Metric label="Assigned sessions" value={String(speaker.sessionCount)} /><Metric label="Resources" value={String(portal.resources.length)} /></section><div className={styles.portalGrid}><main className={styles.stack}><section className={styles.panel}><div className={styles.sectionHead}><h2>Your tasks</h2><span>{speaker.taskProgress.overdue ? `${speaker.taskProgress.overdue} overdue` : "On track"}</span></div>{speaker.tasks.length ? speaker.tasks.map((task) => <article className={styles.portalTask} key={task.id}><span className={`${styles.checkmark} ${task.status === "complete" ? styles.checked : ""}`}>{task.status === "complete" ? "✓" : "○"}</span><div><strong>{task.title}</strong><small>{formatDate(task.dueAt)} · {task.required ? "Required" : "Optional"}</small>{task.description ? <p>{task.description}</p> : null}{task.kind === "form" && task.status === "pending" ? <TaskFormFields configuration={task.configuration} values={responses[task.id] ?? {}} onChange={(key, value) => setResponses((current) => ({ ...current, [task.id]: { ...(current[task.id] ?? {}), [key]: value } }))} /> : null}</div>{task.status === "pending" && task.kind !== "file_request" ? <button className={styles.secondaryButton} type="button" onClick={() => void completeTask(task.id)}>Mark complete</button> : task.kind === "file_request" ? <small>Open in Files</small> : null}</article>) : <p className={styles.empty}>You have no assigned tasks.</p>}</section><section className={styles.panel}><div className={styles.sectionHead}><h2>Your sessions</h2><span>Program handoff</span></div>{speaker.assignedSessions.length ? speaker.assignedSessions.map((session) => <article className={styles.sessionCard} key={session.id}><strong>{session.title}</strong><p>{session.abstract}</p><small>{session.contentStatus.replace("_", " ")} · {session.role}</small></article>) : <p className={styles.empty}>No accepted session has been linked yet.</p>}</section></main><aside className={styles.stack}><section className={styles.panel}><div className={styles.sectionHead}><h2>Your profile</h2><button className={styles.textButton} type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit"}</button></div>{editing ? <form className={styles.stack} onSubmit={(event) => void saveProfile(event)}><label>Name<input name="displayName" defaultValue={speaker.displayName} /></label><label>Job title<input name="jobTitle" defaultValue={speaker.jobTitle} /></label><label>Company<input name="company" defaultValue={speaker.company} /></label><label>Biography<textarea rows={6} name="biography" defaultValue={speaker.biography} /></label><label>LinkedIn<input name="linkedin" defaultValue={speaker.socialLinks.linkedin} /></label><label>Twitter / X<input name="twitter" defaultValue={speaker.socialLinks.twitter} /></label><button className={styles.primaryButton}>Save profile</button></form> : <div className={styles.profileSummary}><span className={styles.largeAvatar}>{speaker.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span><strong>{speaker.displayName}</strong><small>{[speaker.jobTitle, speaker.company].filter(Boolean).join(" · ")}</small><p>{speaker.biography || "Add your biography so organizers and attendees know you."}</p></div>}</section><section className={styles.panel}><div className={styles.sectionHead}><h2>Resources</h2><span>Wiki & embeds</span></div>{selectedResource ? <><button className={styles.textButton} type="button" onClick={() => setActiveResource(null)}>← All resources</button><div className={styles.renderedHtml} dangerouslySetInnerHTML={{ __html: selectedResource.contentHtml }} /></> : portal.resources.length ? portal.resources.map((resource) => <button className={styles.resourceLink} type="button" key={resource.id} onClick={() => setActiveResource(resource.id)}><strong>{resource.title}</strong><small>{resource.summary}</small></button>) : <p className={styles.empty}>No published resources yet.</p>}</section></aside></div></div>;
}

function TaskFormFields({ configuration, values, onChange }: { configuration: Record<string, unknown>; values: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const fields = Array.isArray(configuration.fields) ? configuration.fields.filter(isField) : [];
  return <div className={styles.taskForm}>{fields.map((field) => <label key={field.key}>{field.label ?? field.key}<input required={Boolean(field.required)} value={String(values[field.key] ?? "")} onChange={(event) => onChange(field.key, event.target.value)} /></label>)}</div>;
}
function isField(value: unknown): value is { key: string; label?: string; required?: boolean } { return typeof value === "object" && value !== null && "key" in value && typeof value.key === "string"; }
function Metric({ label, value }: { label: string; value: string }) { return <article className={styles.metric}><small>{label}</small><strong>{value}</strong></article>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "No due date"; }
