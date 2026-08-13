import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./forms-submissions.css";
import { fieldIsVisible, readApi, type FormField, type PublicForm, type SubmissionRecord } from "./model";

export function SubmissionsPage() {
  const { eventSlug = "" } = useParams();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<PublicForm | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [filter, setFilter] = useState<"all" | "unreviewed" | "maybe" | "accepted" | "rejected">("all");
  const [decisionTarget, setDecisionTarget] = useState<SubmissionRecord | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleSubmissions = submissions.filter((submission) => {
    if (filter === "all") return true;
    if (filter === "accepted" || filter === "rejected") return submission.decision === filter;
    return !submission.decision && submission.triageState === filter;
  });

  async function reloadSubmissions() {
    const result = await readApi<{ submissions: SubmissionRecord[] }>(await fetch(`/api/v1/organizer/events/${eventSlug}/submissions`));
    setSubmissions(result.submissions);
  }

  async function markMaybe(submission: SubmissionRecord) {
    setBusyId(submission.id);
    setMessage(null);
    try {
      const updated = await readApi<SubmissionRecord>(await fetch(`/api/v1/organizer/events/${eventSlug}/submissions/${submission.id}/triage`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: submission.triageState === "maybe" ? "unreviewed" : "maybe" }),
      }));
      setSubmissions((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setMessage(updated.triageState === "maybe" ? `“${updated.title}” moved to Maybe.` : `“${updated.title}” moved back to Unreviewed.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The decision queue could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function decide(outcome: "accepted" | "rejected") {
    if (!decisionTarget) return;
    setBusyId(decisionTarget.id);
    setMessage(null);
    try {
      await readApi(await fetch(`/api/v1/organizer/events/${eventSlug}/evaluations/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: decisionTarget.id, outcome, reason: decisionReason, idempotencyKey: crypto.randomUUID() }),
      }));
      await reloadSubmissions();
      setMessage(outcome === "accepted"
        ? `“${decisionTarget.title}” was accepted. Its session, speaker record, onboarding tasks, and notification were created together.`
        : `“${decisionTarget.title}” was rejected and the submitter notification was queued.`);
      setDecisionTarget(null);
      setDecisionReason("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The decision could not be recorded.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/organizer/events/${eventSlug}/submissions`)
      .then((response) => readApi<{ submissions: SubmissionRecord[] }>(response))
      .then((result) => { if (active) setSubmissions(result.submissions); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Submissions could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    void fetch(`/api/v1/public/cfp/${eventSlug}`)
      .then((response) => readApi<PublicForm>(response))
      .then((form) => { if (active) setManualForm(form); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [eventSlug]);

  return (
    <div className="cfp-workspace">
      <div className="page-head cfp-page-head">
        <div><p className="eyebrow">Program</p><h1>Submissions</h1><p>Submitted proposals are ready for Reviews; drafts remain private to their submitters.</p></div>
        <div className="cfp-actions"><span className="cfp-handoff-badge">{submissions.filter((submission) => submission.state === "submitted").length} ready for review</span><button className="primary-action" disabled={!manualForm} onClick={() => setShowManual(true)}>Add manually</button></div>
      </div>
      {message ? <div className="form-error" role="alert">{message}</div> : null}
      {showManual && manualForm ? <ManualSubmissionForm eventSlug={eventSlug} form={manualForm} close={() => setShowManual(false)} created={(submission) => {
        setSubmissions((current) => [submission, ...current]);
        setShowManual(false);
        setMessage("Manual submission created by an organizer and sent to review.");
      }} /> : null}
      <div className="submission-queue-tabs" aria-label="Decision queue filters">
        {(["all", "unreviewed", "maybe", "accepted", "rejected"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{humanize(value)} <span>{submissions.filter((submission) => value === "all" ? true : value === "accepted" || value === "rejected" ? submission.decision === value : !submission.decision && submission.triageState === value).length}</span></button>)}
      </div>
      <section className="cfp-panel submission-inbox" aria-busy={loading}>
        <div className="submission-row submission-header"><span>Proposal</span><span>Participants</span><span>Route</span><span>Decision</span><span>Actions</span></div>
        {loading ? <div className="submission-loading" aria-live="polite"><i /><span><strong>Loading decision queue…</strong><small>Reading the latest proposals and outcomes.</small></span></div> : null}
        {!loading ? visibleSubmissions.map((submission) => (
          <article className="submission-row" key={submission.id}>
            <div>
              <strong>{submission.title}</strong>
              <details className="submission-detail">
                <summary>View proposal answers</summary>
                <dl>
                  {Object.entries(submission.answers).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{displayAnswer(value)}</dd></div>)}
                  <div><dt>Participants</dt><dd>{submission.participants.map((participant) => `${participant.name} · ${humanize(participant.role)} · ${participant.email}`).join("\n") || "Not added yet"}</dd></div>
                </dl>
              </details>
            </div>
            <div><strong>{submission.participants[0]?.name ?? "No participant yet"}</strong><small>{submission.participants.length > 1 ? `+${submission.participants.length - 1} co-presenter(s)` : submission.participants[0]?.email ?? "Draft contact incomplete"}</small></div>
            <span>{submission.routingKey ?? "General queue"}</span>
            <span className={`submission-state ${submission.decision ?? submission.triageState}`}>{submission.decision ?? submission.triageState}</span>
            <div className="submission-decision-actions">
              {submission.state === "submitted" && !submission.decision ? <>
                <button type="button" disabled={busyId === submission.id} onClick={() => setDecisionTarget(submission)}>Accept / reject</button>
                <button type="button" disabled={busyId === submission.id} className={submission.triageState === "maybe" ? "active" : ""} onClick={() => void markMaybe(submission)}>{submission.triageState === "maybe" ? "Undo maybe" : "Maybe"}</button>
              </> : <small>{submission.decision === "accepted" ? "Session created" : submission.decision === "rejected" ? "Final outcome recorded" : "Draft is private"}</small>}
            </div>
          </article>
        )) : null}
        {!loading && visibleSubmissions.length === 0 && !message ? <div className="cfp-empty"><strong>{submissions.length ? `No ${filter} proposals.` : "No proposals yet."}</strong><p>{submissions.length ? "Choose another decision queue to keep working." : "New proposals will appear here automatically."}</p></div> : null}
      </section>
      {decisionTarget ? <div className="submission-decision-backdrop"><section className="submission-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-decision-title"><p className="eyebrow">Final program decision</p><h2 id="submission-decision-title">{decisionTarget.title}</h2><p>Accept adds this proposal to the program, creates the speaker’s onboarding work, and prepares their decision message. Reject records the outcome and prepares the rejection message.</p><label>Private decision note<textarea autoFocus rows={5} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Why is this the right program decision?" /></label><footer><button type="button" className="secondary-action" onClick={() => { setDecisionTarget(null); setDecisionReason(""); }}>Cancel</button><button type="button" className="secondary-action danger" disabled={busyId === decisionTarget.id || decisionReason.trim().length < 3} onClick={() => void decide("rejected")}>Reject</button><button type="button" className="primary-action" disabled={busyId === decisionTarget.id || decisionReason.trim().length < 3} onClick={() => void decide("accepted")}>{busyId === decisionTarget.id ? "Recording…" : "Accept & create session"}</button></footer></section></div> : null}
    </div>
  );
}

function ManualSubmissionForm({ eventSlug, form, close, created }: {
  eventSlug: string;
  form: PublicForm;
  close(): void;
  created(submission: SubmissionRecord): void;
}) {
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [participant, setParticipant] = useState({ name: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const submission = await readApi<SubmissionRecord>(await fetch(
        `/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/submissions/manual?formId=${encodeURIComponent(form.form.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            answers,
            participants: [{ ...participant, role: "author" }],
            saveAsDraft: false,
          }),
        },
      ));
      created(submission);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The manual submission could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="cfp-panel" aria-labelledby="manual-submission-heading">
    <div className="section-head"><div><span>Organizer entry · {form.form.definition.target}</span><h2 id="manual-submission-heading">Add a submission</h2></div><button type="button" onClick={close}>Close</button></div>
    <form onSubmit={submit} className="cfp-form-grid">
      <label className="wide">Proposal title<small>This becomes the session title if accepted. If another question asks for a session title, use the same title.</small><input required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      {form.form.definition.fields.filter((field) => fieldIsVisible(field, answers)).map((field) => <ManualField key={field.key} field={field} value={answers[field.key]} form={form} onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))} />)}
      <label>Primary participant name<input required value={participant.name} onChange={(event) => setParticipant({ ...participant, name: event.target.value })} /></label>
      <label>Primary participant email<input required type="email" value={participant.email} onChange={(event) => setParticipant({ ...participant, email: event.target.value })} /></label>
      {error ? <div className="form-error wide" role="alert">{error}</div> : null}
      <div className="cfp-submit-actions wide"><button type="button" className="secondary-action" onClick={close}>Cancel</button><button className="primary-action" disabled={busy} type="submit">{busy ? "Saving…" : "Create submission and send to review"}</button></div>
    </form>
  </section>;
}

function ManualField({ field, value, form, onChange }: { field: FormField; value: unknown; form: PublicForm; onChange(value: unknown): void }) {
  const options = field.settings.catalog === "track" ? form.event.tracks : field.settings.catalog === "format" ? form.event.formats : field.settings.options ?? [];
  return <label className={field.type === "long_text" ? "wide" : undefined}>{field.label}
    {field.type === "long_text" ? <textarea required={field.required} rows={4} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /> : null}
    {field.type === "short_text" ? <input required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /> : null}
    {field.type === "date" ? <input required={field.required} type="date" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /> : null}
    {field.type === "checkbox" ? <span><input checked={value === true} type="checkbox" onChange={(event) => onChange(event.target.checked)} /> Yes</span> : null}
    {field.type === "select" ? <select required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
    {field.type === "multi_select" ? <select multiple required={field.required} value={Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
  </label>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayAnswer(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
