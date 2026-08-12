import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsonRequest, requestJson } from "./api";
import styles from "./speaker-operations.module.css";
import type { EmployerApprovalStatus, RosterSpeaker, SpeakerDetail, SpeakerStatus } from "./types";

const statuses: SpeakerStatus[] = ["invited", "onboarding", "ready", "withdrawn"];

export function SpeakersPage() {
  const { eventSlug = "", eventSpeakerId } = useParams();
  const navigate = useNavigate();
  const [speakers, setSpeakers] = useState<RosterSpeaker[]>([]);
  const [selected, setSelected] = useState<SpeakerDetail | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [taskStatus, setTaskStatus] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ search, taskStatus });
      if (status) query.set("status", status);
      setSpeakers(await requestJson<RosterSpeaker[]>(`/api/v1/organizer/events/${eventSlug}/speakers?${query}`));
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The speaker roster could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [eventSlug, search, status, taskStatus]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ search, taskStatus });
    if (status) query.set("status", status);
    void requestJson<RosterSpeaker[]>(`/api/v1/organizer/events/${eventSlug}/speakers?${query}`).then((rows) => {
      if (!active) return;
      setSpeakers(rows);
      setMessage(null);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "The speaker roster could not be loaded.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [eventSlug, search, status, taskStatus]);

  useEffect(() => {
    if (!eventSpeakerId) return;
    let active = true;
    void requestJson<SpeakerDetail>(`/api/v1/organizer/events/${eventSlug}/speakers/${eventSpeakerId}`).then((speaker) => {
      if (!active) return;
      setSelected(speaker);
      setMessage(null);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "The speaker could not be loaded.");
    });
    return () => { active = false; };
  }, [eventSpeakerId, eventSlug]);

  async function importCsv(file: File) {
    try {
      const result = await requestJson<{ imported: number; reused: number }>(
        `/api/v1/organizer/events/${eventSlug}/speakers/import`,
        jsonRequest("POST", { csv: await file.text() }),
      );
      setMessage(`${result.imported} speakers imported; ${result.reused} existing people reused.`);
      await loadRoster();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The CSV could not be imported.");
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.pageHead}>
        <div><p className={styles.eyebrow}>People</p><h1>Speakers</h1><p>Profiles, assignments, and onboarding progress in one searchable roster.</p></div>
        <div className={styles.actions}>
          <label className={styles.secondaryButton}>Import CSV<input className={styles.hiddenInput} type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} /></label>
          <button className={styles.primaryButton} type="button" onClick={() => setShowAdd((value) => !value)}>Add speaker</button>
        </div>
      </header>
      {message ? <div className={styles.notice} role="status">{message}</div> : null}
      {showAdd ? <AddSpeakerForm eventSlug={eventSlug} onSaved={async (speaker) => { setShowAdd(false); await loadRoster(); navigate(`/organizer/events/${eventSlug}/speakers/${speaker.eventSpeakerId}`); }} /> : null}
      <section className={styles.metrics} aria-label="Speaker progress summary">
        <Metric label="Visible speakers" value={String(speakers.length)} />
        <Metric label="Onboarding complete" value={`${speakers.filter((speaker) => speaker.taskProgress.total > 0 && speaker.taskProgress.complete === speaker.taskProgress.total).length}`} />
        <Metric label="Overdue" value={String(speakers.filter((speaker) => speaker.taskProgress.overdue > 0).length)} tone="danger" />
      </section>
      <section className={styles.panel}>
        <div className={styles.filters}>
          <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, company, or title" /></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
          <label>Task progress<select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}><option value="all">All progress</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option></select></label>
        </div>
        <div className={styles.table} role="table" aria-label="Speaker roster">
          <div className={styles.tableHeader} role="row"><span>Speaker</span><span>Status</span><span>Progress</span><span>Sessions</span><span /></div>
          {loading ? <div className={styles.empty}>Loading speakers…</div> : speakers.length === 0 ? <div className={styles.empty}>No speakers match these filters.</div> : speakers.map((speaker) => (
            <button className={styles.tableRow} type="button" role="row" key={speaker.eventSpeakerId} aria-label={`Open details for ${speaker.displayName}`} onClick={() => navigate(`/organizer/events/${eventSlug}/speakers/${speaker.eventSpeakerId}`)}>
              <span className={styles.person}><Avatar name={speaker.displayName} /><span><strong>{speaker.displayName}</strong><small>{[speaker.jobTitle, speaker.company].filter(Boolean).join(" · ") || speaker.email}</small></span></span>
              <span><Status value={speaker.status} /></span>
              <span><strong>{speaker.taskProgress.complete}/{speaker.taskProgress.total}</strong>{speaker.taskProgress.overdue ? <small className={styles.danger}>{speaker.taskProgress.overdue} overdue</small> : null}</span>
              <span>{speaker.sessionCount}</span><span className={styles.rowAction}>Open details</span>
            </button>
          ))}
        </div>
      </section>
      {eventSpeakerId && selected?.eventSpeakerId !== eventSpeakerId ? <div className={styles.backdrop}><p className={styles.detailLoading} role="status">Loading speaker details…</p></div> : null}
      {eventSpeakerId && selected?.eventSpeakerId === eventSpeakerId ? <SpeakerDetailPanel eventSlug={eventSlug} speaker={selected} onClose={() => navigate(`/organizer/events/${eventSlug}/speakers`)} onSaved={async (speaker) => { setSelected(speaker); await loadRoster(); }} /> : null}
    </div>
  );
}

function AddSpeakerForm({ eventSlug, onSaved }: { eventSlug: string; onSaved: (speaker: SpeakerDetail) => void | Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const speaker = await requestJson<SpeakerDetail>(`/api/v1/organizer/events/${eventSlug}/speakers`, jsonRequest("POST", {
        displayName: form.get("displayName"), email: form.get("email"), jobTitle: form.get("jobTitle"), company: form.get("company"), biography: form.get("biography"),
      }));
      await onSaved(speaker);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The speaker could not be saved.");
    } finally { setSaving(false); }
  }
  return <form className={styles.editor} onSubmit={(event) => void submit(event)}><div className={styles.sectionHead}><h2>Add a speaker</h2><span>Organizer-added speaker</span></div>{error ? <p className={styles.danger}>{error}</p> : null}<div className={styles.formGrid}><label>Name<input required name="displayName" /></label><label>Email<input required type="email" name="email" /></label><label>Job title<input name="jobTitle" /></label><label>Company<input name="company" /></label><label className={styles.wide}>Biography<textarea name="biography" rows={4} /></label></div><button className={styles.primaryButton} disabled={saving}>{saving ? "Saving…" : "Save speaker"}</button></form>;
}

function SpeakerDetailPanel({ eventSlug, speaker, onClose, onSaved }: { eventSlug: string; speaker: SpeakerDetail; onClose: () => void; onSaved: (speaker: SpeakerDetail) => void | Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget);
    try {
      const updated = await requestJson<SpeakerDetail>(`/api/v1/organizer/events/${eventSlug}/speakers/${speaker.eventSpeakerId}`, jsonRequest("PATCH", {
        displayName: form.get("displayName"), jobTitle: form.get("jobTitle"), company: form.get("company"), biography: form.get("biography"), logistics: { travelPreferences: form.get("travelPreferences") },
      }));
      await onSaved(updated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The profile could not be saved."); } finally { setSaving(false); }
  }
  async function changeStatus(value: SpeakerStatus) {
    try { await onSaved(await requestJson<SpeakerDetail>(`/api/v1/organizer/events/${eventSlug}/speakers/${speaker.eventSpeakerId}/status`, jsonRequest("PATCH", { status: value }))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The status could not be changed."); }
  }
  async function changeEmployerApproval(value: EmployerApprovalStatus) {
    try { await onSaved(await requestJson<SpeakerDetail>(`/api/v1/organizer/events/${eventSlug}/speakers/${speaker.eventSpeakerId}/employer-approval`, jsonRequest("PATCH", { status: value }))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The employer approval state could not be changed."); }
  }
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`${speaker.displayName} speaker details`}><div className={styles.sectionHead}><div className={styles.person}><Avatar name={speaker.displayName} /><span><h2>{speaker.displayName}</h2><small>{speaker.email}</small></span></div><button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close speaker details">×</button></div>{error ? <p className={styles.danger}>{error}</p> : null}<div className={styles.statusGrid}><label className={styles.statusControl}>Speaker status<select value={speaker.status} onChange={(event) => void changeStatus(event.target.value as SpeakerStatus)}>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><label className={styles.statusControl}>Employer approval<select value={speaker.employerApprovalStatus} onChange={(event) => void changeEmployerApproval(event.target.value as EmployerApprovalStatus)}><option value="not_required">Not required</option><option value="pending">Pending</option><option value="approved">Approved</option></select></label></div><form onSubmit={(event) => void saveProfile(event)} className={styles.stack}><label>Name<input name="displayName" defaultValue={speaker.displayName} /></label><label>Job title<input name="jobTitle" defaultValue={speaker.jobTitle} /></label><label>Company<input name="company" defaultValue={speaker.company} /></label><label>Biography<textarea rows={6} name="biography" defaultValue={speaker.biography} /></label><label>Travel & logistics<textarea rows={3} name="travelPreferences" defaultValue={speaker.logistics.travelPreferences ?? ""} /></label><button className={styles.primaryButton} disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></form><div className={styles.detailSection}><h3>Assigned sessions</h3>{speaker.assignedSessions.length ? speaker.assignedSessions.map((session) => <article key={session.id} className={styles.compactCard}><strong>{session.title}</strong><small>{session.contentStatus.replace("_", " ")} · {session.role}</small></article>) : <p className={styles.muted}>No accepted sessions assigned yet.</p>}</div><div className={styles.detailSection}><h3>Tasks and status</h3>{speaker.tasks.length ? speaker.tasks.map((task) => <article className={styles.compactCard} key={task.id}><strong>{task.title}</strong><small>{task.status === "complete" ? "Complete" : "Pending"} · {formatDate(task.dueAt)}</small></article>) : <p className={styles.muted}>No tasks assigned yet.</p>}</div></aside></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) { return <article className={styles.metric}><small>{label}</small><strong className={tone ? styles[tone] : undefined}>{value}</strong></article>; }
function Avatar({ name }: { name: string }) { return <span className={styles.avatar}>{name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>; }
function Status({ value }: { value: SpeakerStatus }) { return <span className={`${styles.status} ${styles[value]}`}>{statusLabel(value)}</span>; }
function statusLabel(value: SpeakerStatus) { return value[0]?.toUpperCase() + value.slice(1); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "No due date"; }
