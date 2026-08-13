import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { formatEventDueDate } from "../../app/event-time";
import { jsonRequest, requestJson } from "./api";
import { fileRequestActionLabel, speakerPortalHeading, speakerPortalSection } from "./presentation";
import styles from "./speaker-operations.module.css";
import type { SpeakerPortal, SpeakerResource } from "./types";

type LoadState = "loading" | "ready" | "error";
type Feedback = { text: string; tone: "success" | "error" } | null;

export function SpeakerPortalPage() {
  const { eventSlug = "" } = useParams();
  const location = useLocation();
  const section = speakerPortalSection(location.pathname);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [portal, setPortal] = useState<SpeakerPortal | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [activeResource, setActiveResource] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, Record<string, unknown>>>({});
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [uploadingHeadshot, setUploadingHeadshot] = useState(false);

  const loadPortal = useCallback(async () => {
    try {
      const nextPortal = await requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}`);
      setPortal(nextPortal);
      setLoadState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your speaker workspace could not be loaded.");
      setLoadState("error");
    }
  }, [eventSlug]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadPortal());
    return () => cancelAnimationFrame(frame);
  }, [loadPortal]);

  useEffect(() => {
    if (loadState === "loading") return;
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }, [loadState, location.pathname]);

  useEffect(() => {
    if (!portal || section !== "sessions" || !location.hash.startsWith("#session-")) return;
    requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" }));
  }, [location.hash, location.pathname, portal, section]);

  function retryPortal() {
    setLoadState("loading");
    setLoadError(null);
    void loadPortal();
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingProfile(true);
    try {
      setPortal(await requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}/profile`, jsonRequest("PATCH", {
        displayName: form.get("displayName"), biography: form.get("biography"), jobTitle: form.get("jobTitle"), company: form.get("company"),
        socialLinks: { linkedin: String(form.get("linkedin") ?? ""), twitter: String(form.get("twitter") ?? "") },
      })));
      setEditing(false);
      setFeedback({ text: "Profile changes saved. Organizers and public pages now use this information.", tone: "success" });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Your profile could not be saved.", tone: "error" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function completeTask(assignmentId: string) {
    setBusyTask(assignmentId);
    try {
      setPortal(await requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}/task-assignments/${assignmentId}/complete`, jsonRequest("POST", { response: responses[assignmentId] ?? null })));
      setFeedback({ text: "Task marked complete.", tone: "success" });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "The task could not be completed.", tone: "error" });
    } finally {
      setBusyTask(null);
    }
  }

  async function uploadHeadshot(file: File) {
    setUploadingHeadshot(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const checksumSha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      const authorization = await requestJson<{ id: string; uploadUrl: string | null }>(`/api/v1/speaker/events/${eventSlug}/profile/headshot-uploads`, jsonRequest("POST", {
        originalName: file.name, mediaType: file.type, byteSize: file.size, checksumSha256, idempotencyKey: crypto.randomUUID(),
      }));
      if (!authorization.uploadUrl) throw new Error("Private profile-photo storage is unavailable.");
      const uploaded = await fetch(authorization.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!uploaded.ok) throw new Error("The private profile-photo upload failed.");
      await requestJson(`/api/v1/speaker/files/uploads/${authorization.id}/finalize`, { method: "POST" });
      setPortal(await requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}`));
      setFeedback({ text: "Profile headshot saved for organizer and public program views.", tone: "success" });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Your profile headshot could not be saved.", tone: "error" });
    } finally {
      setUploadingHeadshot(false);
    }
  }

  if (loadState === "loading") return <SpeakerPortalLoading headingRef={headingRef} />;
  if (loadState === "error" || !portal) return <SpeakerPortalError headingRef={headingRef} message={loadError} onRetry={retryPortal} />;

  const { speaker } = portal;
  const heading = speakerPortalHeading(section, speaker.displayName.split(" ")[0] ?? speaker.displayName);
  const selectedResource = portal.resources.find((resource) => resource.id === activeResource);
  const tasksPanel = <TasksPanel eventSlug={eventSlug} timezone={portal.event.timezone} tasks={speaker.tasks} responses={responses} busyTask={busyTask} onResponse={(assignmentId, key, value) => setResponses((current) => ({ ...current, [assignmentId]: { ...(current[assignmentId] ?? {}), [key]: value } }))} onComplete={completeTask} />;
  const sessionsPanel = <SessionsPanel sessions={speaker.assignedSessions} />;
  const profilePanel = <ProfilePanel eventSlug={eventSlug} speaker={speaker} editing={editing} saving={savingProfile} uploadingHeadshot={uploadingHeadshot} onToggleEditing={() => setEditing((value) => !value)} onSave={saveProfile} onUploadHeadshot={uploadHeadshot} />;
  const resourcesPanel = <ResourcesPanel resources={portal.resources} selectedResource={selectedResource} onSelect={setActiveResource} />;

  return <div id={`portal-${section}`} className={styles.portalShell}>
    <header className={styles.portalHeader}>
      <div><p className={styles.eyebrow}>Speaker portal · {portal.event.name}</p><h1 ref={headingRef} tabIndex={-1}>{heading.title}</h1><p>{heading.description}</p></div>
      <span className={`${styles.status} ${styles[speaker.status]}`}>{speaker.status}</span>
    </header>
    {feedback ? <div className={feedback.tone === "error" ? styles.errorNotice : styles.notice} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</div> : null}
    {section === "overview" ? <>
      <section className={styles.portalMetrics} aria-label="Speaker workspace summary"><Metric label="Tasks complete" value={`${speaker.taskProgress.complete}/${speaker.taskProgress.total}`} /><Metric label="Released sessions" value={String(speaker.sessionCount)} /><Metric label="Resources" value={String(portal.resources.length)} /></section>
      <div className={styles.overviewGrid}>
        <OverviewSummary title="Tasks" empty="No assigned tasks." items={speaker.tasks.slice(0, 3).map((task) => ({ id: task.id, title: task.title, detail: task.status === "complete" ? "Complete" : `${formatEventDueDate(task.dueAt, portal.event.timezone)} · ${task.required ? "Required" : "Optional"}` }))} linkTo={`/speaker/events/${eventSlug}/tasks`} linkLabel="Open all tasks" />
        <OverviewSummary title="Sessions" empty="No released sessions yet." items={speaker.assignedSessions.slice(0, 2).map((session) => ({ id: session.id, title: session.title, detail: `${session.contentStatus.replace("_", " ")} · ${session.role}` }))} linkTo={`/speaker/events/${eventSlug}/sessions`} linkLabel="Open sessions" />
        <OverviewSummary title="Profile" items={[{ id: speaker.eventSpeakerId, title: speaker.displayName, detail: [speaker.jobTitle, speaker.company].filter(Boolean).join(" · ") || "Add your role and company" }]} linkTo={`/speaker/events/${eventSlug}/profile`} linkLabel="Open profile" />
        <OverviewSummary title="Resources" empty="No published resources yet." items={portal.resources.slice(0, 2).map((resource) => ({ id: resource.id, title: resource.title, detail: resource.summary }))} linkTo={`/speaker/events/${eventSlug}/resources`} linkLabel="Open resources" />
      </div>
    </> : section === "tasks" ? tasksPanel : section === "sessions" ? sessionsPanel : section === "profile" ? profilePanel : resourcesPanel}
  </div>;
}

function SpeakerPortalLoading({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return <div className={styles.portalShell} aria-busy="true"><header className={styles.portalHeader}><div><p className={styles.eyebrow}>Speaker portal</p><h1 ref={headingRef} tabIndex={-1}>Loading your workspace…</h1><p>We’re retrieving the latest released speaker information.</p></div></header><div className={styles.loadingGrid} aria-label="Loading speaker workspace"><span /><span /><span /></div></div>;
}

function SpeakerPortalError({ headingRef, message, onRetry }: { headingRef: React.RefObject<HTMLHeadingElement | null>; message: string | null; onRetry: () => void }) {
  return <div className={styles.portalShell}><header className={styles.portalHeader}><div><p className={styles.eyebrow}>Speaker portal</p><h1 ref={headingRef} tabIndex={-1}>Speaker workspace unavailable</h1><p>We could not retrieve the latest speaker information.</p></div></header><div className={styles.errorState} role="alert"><strong>Nothing has been changed.</strong><p>{message ?? "Your speaker workspace could not be loaded."}</p><button className={styles.primaryButton} type="button" onClick={onRetry}>Retry loading workspace</button></div></div>;
}

function OverviewSummary({ title, items, empty, linkTo, linkLabel }: { title: string; items: Array<{ id: string; title: string; detail: string }>; empty?: string; linkTo: string; linkLabel: string }) {
  return <section className={styles.panel}><div className={styles.sectionHead}><h2>{title}</h2><Link className={styles.textLink} to={linkTo}>{linkLabel} →</Link></div>{items.length ? <div className={styles.summaryList}>{items.map((item) => <article key={item.id}><strong>{item.title}</strong><small>{item.detail}</small></article>)}</div> : <p className={styles.empty}>{empty}</p>}</section>;
}

function TasksPanel({ eventSlug, timezone, tasks, responses, busyTask, onResponse, onComplete }: { eventSlug: string; timezone: string; tasks: SpeakerPortal["speaker"]["tasks"]; responses: Record<string, Record<string, unknown>>; busyTask: string | null; onResponse: (assignmentId: string, key: string, value: unknown) => void; onComplete: (assignmentId: string) => Promise<void> }) {
  return <section className={`${styles.panel} ${styles.focusedPanel}`}><div className={styles.sectionHead}><h2>Assigned tasks</h2><span>{tasks.filter((task) => task.status === "pending").length} remaining</span></div>{tasks.length ? tasks.map((task) => <article className={styles.portalTask} key={task.id}><span className={`${styles.checkmark} ${task.status === "complete" ? styles.checked : ""}`} aria-hidden="true">{task.status === "complete" ? "✓" : "○"}</span><div><strong>{task.title}</strong><small>{formatEventDueDate(task.dueAt, timezone)} · {task.required ? "Required" : "Optional"} · {task.status === "complete" ? "Complete" : "Pending"}</small>{task.description ? <p>{task.description}</p> : null}{task.kind === "form" && task.status === "pending" ? <TaskFormFields configuration={task.configuration} values={responses[task.id] ?? {}} onChange={(key, value) => onResponse(task.id, key, value)} /> : null}</div>{task.status === "pending" && task.kind !== "file_request" ? <button className={styles.secondaryButton} disabled={busyTask === task.id} type="button" onClick={() => void onComplete(task.id)}>{busyTask === task.id ? "Saving…" : "Mark complete"}</button> : task.kind === "file_request" ? <Link className={styles.secondaryButton} to={`/speaker/events/${eventSlug}/files`}>{fileRequestActionLabel(task.status)}</Link> : null}</article>) : <p className={styles.empty}>You have no assigned tasks. New organizer requests will appear here.</p>}</section>;
}

function SessionsPanel({ sessions }: { sessions: SpeakerPortal["speaker"]["assignedSessions"] }) {
  return <section className={`${styles.panel} ${styles.focusedPanel}`}><div className={styles.sectionHead}><h2>Released program sessions</h2><span>{sessions.length} linked</span></div>{sessions.length ? sessions.map((session) => <article id={`session-${session.id}`} className={styles.sessionCard} key={session.id}><strong>{session.title}</strong><p>{session.abstract}</p><small>{session.contentStatus.replace("_", " ")} · {session.role}</small></article>) : <div className={styles.contextualEmpty}><strong>No released session is linked yet.</strong><p>Accepted sessions appear here only after organizers release the program handoff. Proposal decisions remain available in Decisions.</p></div>}</section>;
}

function ProfilePanel({ eventSlug, speaker, editing, saving, uploadingHeadshot, onToggleEditing, onSave, onUploadHeadshot }: { eventSlug: string; speaker: SpeakerPortal["speaker"]; editing: boolean; saving: boolean; uploadingHeadshot: boolean; onToggleEditing: () => void; onSave: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onUploadHeadshot: (file: File) => Promise<void> }) {
  return <section className={`${styles.panel} ${styles.focusedPanel}`}><div className={styles.sectionHead}><h2>Published speaker details</h2><button className={styles.textButton} type="button" onClick={onToggleEditing}>{editing ? "Cancel editing" : "Edit profile"}</button></div>{editing ? <form className={styles.profileForm} onSubmit={(event) => void onSave(event)}><label>Name<input name="displayName" defaultValue={speaker.displayName} /></label><div className={styles.formGrid}><label>Job title<input name="jobTitle" defaultValue={speaker.jobTitle} /></label><label>Company<input name="company" defaultValue={speaker.company} /></label></div><label>Biography<textarea rows={6} name="biography" defaultValue={speaker.biography} /></label><div className={styles.formGrid}><label>LinkedIn<input name="linkedin" defaultValue={speaker.socialLinks.linkedin} /></label><label>Twitter / X<input name="twitter" defaultValue={speaker.socialLinks.twitter} /></label></div><label>Profile headshot<input aria-label={`Upload a profile headshot for ${speaker.displayName}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingHeadshot} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadHeadshot(file); }} /><small>{uploadingHeadshot ? "Uploading and checking headshot…" : "PNG, JPEG, or WebP. The saved image is used by organizers and public program pages."}</small></label><button className={styles.primaryButton} disabled={saving}>{saving ? "Saving profile…" : "Save profile"}</button></form> : <div className={styles.profileSummary}>{speaker.headshotFileId ? <img className={styles.profileImage} src={`/api/v1/speaker/events/${eventSlug}/profile/headshot?v=${speaker.headshotFileId}`} alt={`Headshot of ${speaker.displayName}`} /> : <span className={styles.largeAvatar} aria-hidden="true">{speaker.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>}<strong>{speaker.displayName}</strong><small>{[speaker.jobTitle, speaker.company].filter(Boolean).join(" · ") || "No role or company added"}</small><p>{speaker.biography || "Add your biography so organizers and attendees know you."}</p></div>}</section>;
}

function ResourcesPanel({ resources, selectedResource, onSelect }: { resources: SpeakerResource[]; selectedResource: SpeakerResource | undefined; onSelect: (id: string | null) => void }) {
  return <section className={`${styles.panel} ${styles.focusedPanel}`}><div className={styles.sectionHead}><h2>Published guides and tools</h2><span>{resources.length} available</span></div>{selectedResource ? <><button className={styles.textButton} type="button" onClick={() => onSelect(null)}>← All resources</button><div className={styles.renderedHtml} dangerouslySetInnerHTML={{ __html: selectedResource.contentHtml }} /></> : resources.length ? resources.map((resource) => <button className={styles.resourceLink} type="button" key={resource.id} onClick={() => onSelect(resource.id)}><strong>{resource.title}</strong><small>{resource.summary}</small></button>) : <div className={styles.contextualEmpty}><strong>No resources published yet.</strong><p>Guides and tools from organizers will appear here when they are available.</p></div>}</section>;
}

function TaskFormFields({ configuration, values, onChange }: { configuration: Record<string, unknown>; values: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const fields = Array.isArray(configuration.fields) ? configuration.fields.filter(isField) : [];
  return <div className={styles.taskForm}>{fields.map((field) => <label key={field.key}>{field.label ?? field.key}<input required={Boolean(field.required)} value={String(values[field.key] ?? "")} onChange={(event) => onChange(field.key, event.target.value)} /></label>)}</div>;
}

function isField(value: unknown): value is { key: string; label?: string; required?: boolean } { return typeof value === "object" && value !== null && "key" in value && typeof value.key === "string"; }
function Metric({ label, value }: { label: string; value: string }) { return <article className={styles.metric}><small>{label}</small><strong>{value}</strong></article>; }
