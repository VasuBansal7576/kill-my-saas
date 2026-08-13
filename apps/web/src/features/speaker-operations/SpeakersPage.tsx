import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AccessibleDialog } from "../../app/AccessibleDialog";
import { jsonRequest, requestJson } from "./api";
import styles from "./speaker-operations.module.css";
import operatorStyles from "./operator-tools.module.css";
import type { RosterSpeaker, SpeakerDetail, SpeakerImportPreviewRow, SpeakerStatus } from "./types";

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
  const [importRows, setImportRows] = useState<SpeakerImportPreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);

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
    await previewCsv(await file.text());
  }

  async function previewCsv(csv: string) {
    try {
      const result = await requestJson<{ rows: Omit<SpeakerImportPreviewRow, "selected">[] }>(
        `/api/v1/organizer/events/${eventSlug}/speakers/import/preview`,
        jsonRequest("POST", { csv }),
      );
      setImportRows(result.rows.map((row) => ({ ...row, selected: row.issues.length === 0 && row.identity !== "duplicate_in_file" && row.identity !== "existing_event_speaker" })));
      setMessage("Review every row. Correct or exclude invalid and duplicate rows before committing selected speakers.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The CSV could not be imported.");
    }
  }

  async function revalidateImport() {
    if (!importRows) return;
    await previewCsv(toSpeakerCsv(importRows));
  }

  async function commitImport() {
    if (!importRows) return;
    const selectedRows = importRows.filter((row) => row.selected && !row.dirty && row.issues.length === 0 && row.identity !== "duplicate_in_file");
    if (selectedRows.length === 0) { setMessage("Select at least one validated, non-duplicate row to commit."); return; }
    setImporting(true);
    try {
      const result = await requestJson<{ imported: number; reused: number }>(`/api/v1/organizer/events/${eventSlug}/speakers/import/commit`, jsonRequest("POST", {
        rows: selectedRows.map((row) => ({ row: row.row, input: row.input })),
      }));
      setMessage(`${result.imported} event speakers added; ${result.reused} canonical people safely reused. Excluded rows were not committed.`);
      setImportRows(null);
      await loadRoster();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The selected rows could not be committed."); }
    finally { setImporting(false); }
  }

  function updateImportRow(rowNumber: number, field: keyof SpeakerImportPreviewRow["input"], value: string) {
    setImportRows((current) => current?.map((row) => row.row === rowNumber ? { ...row, input: { ...row.input, [field]: value }, dirty: true, selected: false } : row) ?? null);
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.pageHead}>
        <div><p className={styles.eyebrow}>People</p><h1>Speakers</h1><p>Profiles, assignments, and onboarding progress in one searchable roster.</p></div>
        <div className={styles.actions}>
          <label className={styles.secondaryButton}>Import CSV<input aria-label="Import speakers from a CSV file" className={styles.hiddenInput} type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} /></label>
          <button className={styles.primaryButton} type="button" onClick={() => setShowAdd((value) => !value)}>Add speaker</button>
        </div>
      </header>
      {message ? <div className={styles.notice} role="status">{message}</div> : null}
      {importRows ? <section className={operatorStyles.importReview} aria-label="Review CSV import rows">
        <div className={styles.sectionHead}><div><h2>Review import rows</h2><p className={styles.help}>Nothing is written until Commit selected. Editing a row requires revalidation so identity matching cannot become stale.</p></div><button className={styles.iconButton} type="button" onClick={() => setImportRows(null)} aria-label="Close import review">×</button></div>
        <div className={operatorStyles.importTable}>
          <div className={operatorStyles.importHeader}><span>Include</span><span>Row</span><span>Name</span><span>Email / identity</span><span>Title</span><span>Company</span><span>Validation</span></div>
          {importRows.map((row) => <div className={operatorStyles.importRow} key={row.row} data-invalid={row.issues.length > 0 || row.dirty}>
            <input aria-label={`Include row ${row.row}`} type="checkbox" checked={row.selected} disabled={row.issues.length > 0 || Boolean(row.dirty) || row.identity === "duplicate_in_file"} onChange={(event) => setImportRows((current) => current?.map((candidate) => candidate.row === row.row ? { ...candidate, selected: event.target.checked } : candidate) ?? null)} />
            <span>{row.row}</span>
            <input aria-label={`Row ${row.row} name`} value={row.input.displayName} onChange={(event) => updateImportRow(row.row, "displayName", event.target.value)} />
            <label><input aria-label={`Row ${row.row} email`} value={row.input.email} onChange={(event) => updateImportRow(row.row, "email", event.target.value)} /><small>{identityLabel(row)}</small></label>
            <input aria-label={`Row ${row.row} job title`} value={row.input.jobTitle} onChange={(event) => updateImportRow(row.row, "jobTitle", event.target.value)} />
            <input aria-label={`Row ${row.row} company`} value={row.input.company} onChange={(event) => updateImportRow(row.row, "company", event.target.value)} />
            <span className={row.issues.length || row.dirty ? styles.danger : operatorStyles.valid}>{row.dirty ? "Revalidate edited row" : row.issues.length ? row.issues.map((issue) => `${issue.field}: ${issue.message}`).join(" · ") : "Ready"}</span>
          </div>)}
        </div>
        <div className={operatorStyles.importActions}><button className={styles.secondaryButton} type="button" onClick={() => void revalidateImport()}>Revalidate corrections</button><button className={styles.primaryButton} disabled={importing || !importRows.some((row) => row.selected)} type="button" onClick={() => void commitImport()}>{importing ? "Committing…" : `Commit selected (${importRows.filter((row) => row.selected).length})`}</button></div>
      </section> : null}
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

export function SpeakerDetailPanel({ eventSlug, speaker, onClose, onSaved }: { eventSlug: string; speaker: SpeakerDetail; onClose: () => void; onSaved: (speaker: SpeakerDetail) => void | Promise<void> }) {
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
  async function replaceHeadshot(file: File) {
    setSaving(true); setError(null);
    try {
      const authorization = await requestJson<{ id: string; uploadUrl: string | null; failureCode: string | null }>(`/api/v1/organizer/events/${eventSlug}/content/speakers/${speaker.eventSpeakerId}/headshot-uploads`, jsonRequest("POST", { originalName: file.name, mediaType: file.type, byteSize: file.size, checksumSha256: await sha256(file), idempotencyKey: crypto.randomUUID() }));
      if (!authorization.uploadUrl) throw new Error(`Headshot upload blocked by external storage: ${authorization.failureCode ?? "unknown"}.`);
      const uploaded = await fetch(authorization.uploadUrl.replace("/api/v1/speaker/", "/api/v1/organizer/"), { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!uploaded.ok) throw new Error("The private headshot upload failed.");
      await requestJson(`/api/v1/organizer/files/uploads/${authorization.id}/finalize`, { method: "POST" });
      await onSaved(await requestJson<SpeakerDetail>(`/api/v1/organizer/events/${eventSlug}/speakers/${speaker.eventSpeakerId}`));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The headshot could not be replaced."); }
    finally { setSaving(false); }
  }
  return <AccessibleDialog close={onClose} label={`${speaker.displayName} speaker details`} backdropClassName={styles.backdrop} dialogClassName={styles.drawer}>
    <div className={styles.sectionHead}><div className={styles.person}><Avatar name={speaker.displayName} /><span><h2>{speaker.displayName}</h2><small>{speaker.email}</small></span></div><button data-dialog-initial-focus className={styles.iconButton} type="button" onClick={onClose} aria-label="Close speaker details">×</button></div>{error ? <p className={styles.danger}>{error}</p> : null}<div className={operatorStyles.headshotAction}><div><strong>Profile headshot</strong><small>{speaker.headshotFileId ? "Verified canonical image on file" : "No verified image yet"}</small></div><label className={styles.secondaryButton}>Replace headshot<input className={styles.hiddenInput} disabled={saving} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceHeadshot(file); }} /></label></div><label className={styles.statusControl}>Speaker status<select value={speaker.status} onChange={(event) => void changeStatus(event.target.value as SpeakerStatus)}>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><form onSubmit={(event) => void saveProfile(event)} className={styles.stack}><label>Name<input name="displayName" defaultValue={speaker.displayName} /></label><label>Job title<input name="jobTitle" defaultValue={speaker.jobTitle} /></label><label>Company<input name="company" defaultValue={speaker.company} /></label><label>Biography<textarea rows={6} name="biography" defaultValue={speaker.biography} /></label><label>Travel & logistics<textarea rows={3} name="travelPreferences" defaultValue={speaker.logistics.travelPreferences ?? ""} /></label><button className={styles.primaryButton} disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></form><div className={styles.detailSection}><h3>Assigned sessions</h3>{speaker.assignedSessions.length ? speaker.assignedSessions.map((session) => <article key={session.id} className={styles.compactCard}><strong>{session.title}</strong><small>{session.contentStatus.replace("_", " ")} · {session.role}</small></article>) : <p className={styles.muted}>No accepted sessions assigned yet.</p>}</div><div className={styles.detailSection}><h3>Tasks and status</h3>{speaker.tasks.length ? speaker.tasks.map((task) => <article className={styles.compactCard} key={task.id}><strong>{task.title}</strong><small>{task.status === "complete" ? "Complete" : "Pending"} · {formatDate(task.dueAt)}</small></article>) : <p className={styles.muted}>No tasks assigned yet.</p>}</div>
  </AccessibleDialog>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) { return <article className={styles.metric}><small>{label}</small><strong className={tone ? styles[tone] : undefined}>{value}</strong></article>; }
function Avatar({ name }: { name: string }) { return <span className={styles.avatar}>{name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>; }
function Status({ value }: { value: SpeakerStatus }) { return <span className={`${styles.status} ${styles[value]}`}>{statusLabel(value)}</span>; }
function statusLabel(value: SpeakerStatus) { return value[0]?.toUpperCase() + value.slice(1); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "No due date"; }
function identityLabel(row: SpeakerImportPreviewRow) { if (row.duplicateOfRow) return `Duplicate of CSV row ${row.duplicateOfRow}`; return row.identity.replaceAll("_", " "); }
function quoteCsv(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function toSpeakerCsv(rows: SpeakerImportPreviewRow[]) { return ["name,email,title,company,bio", ...rows.map((row) => [row.input.displayName, row.input.email, row.input.jobTitle, row.input.company, row.input.biography].map(quoteCsv).join(","))].join("\n"); }
async function sha256(file: File) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((value) => value.toString(16).padStart(2, "0")).join(""); }
