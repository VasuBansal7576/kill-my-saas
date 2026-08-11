import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./forms-submissions.css";
import { fieldIsVisible, readApi, type FormField, type PublicForm, type SubmissionRecord } from "./model";

export function SubmissionsPage() {
  const { eventSlug = "" } = useParams();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<PublicForm | null>(null);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/v1/organizer/events/${eventSlug}/submissions`).then((response) => readApi<{ submissions: SubmissionRecord[] }>(response)),
      fetch(`/api/v1/public/cfp/${eventSlug}`).then((response) => readApi<PublicForm>(response)),
    ])
      .then(([result, form]) => { setSubmissions(result.submissions); setManualForm(form); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Submissions could not be loaded."));
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
        setMessage("Manual submission persisted with organizer provenance and routed to Reviews.");
      }} /> : null}
      <section className="cfp-panel submission-inbox">
        <div className="submission-row submission-header"><span>Proposal</span><span>Participants</span><span>Route</span><span>Status</span><span>Updated</span></div>
        {submissions.map((submission) => (
          <article className="submission-row" key={submission.id}>
            <div>
              <strong>{submission.title}</strong><small>Form v{submission.formVersion} · content v{submission.version}</small>
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
            <span className={`submission-state ${submission.state}`}>{submission.state}</span>
            <time dateTime={submission.updatedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(submission.updatedAt))}</time>
          </article>
        ))}
        {submissions.length === 0 && !message ? <div className="cfp-empty"><strong>No proposals yet.</strong><p>Published form submissions will appear here without re-entry.</p></div> : null}
      </section>
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
    <div className="section-head"><div><span>Organizer entry · {form.form.definition.target}</span><h2 id="manual-submission-heading">Add a submission without re-entry later</h2></div><button type="button" onClick={close}>Close</button></div>
    <form onSubmit={submit} className="cfp-form-grid">
      <label className="wide">Title<input required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      {form.form.definition.fields.filter((field) => fieldIsVisible(field, answers)).map((field) => <ManualField key={field.key} field={field} value={answers[field.key]} form={form} onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))} />)}
      <label>Primary participant name<input required value={participant.name} onChange={(event) => setParticipant({ ...participant, name: event.target.value })} /></label>
      <label>Primary participant email<input required type="email" value={participant.email} onChange={(event) => setParticipant({ ...participant, email: event.target.value })} /></label>
      {error ? <div className="form-error wide" role="alert">{error}</div> : null}
      <div className="cfp-submit-actions wide"><button type="button" className="secondary-action" onClick={close}>Cancel</button><button className="primary-action" disabled={busy} type="submit">{busy ? "Saving…" : "Create & route"}</button></div>
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
