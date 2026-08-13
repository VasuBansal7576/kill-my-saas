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
  const [notificationTarget, setNotificationTarget] = useState<SubmissionRecord | null>(null);
  const [notificationSubject, setNotificationSubject] = useState("");
  const [notificationHtml, setNotificationHtml] = useState("");
  const [notificationText, setNotificationText] = useState("");
  const [notificationRevision, setNotificationRevision] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState<"draft" | "reviewed" | "queued" | "handed_off">("draft");
  const [changeDecisionTarget, setChangeDecisionTarget] = useState<SubmissionRecord | null>(null);
  const [changeReason, setChangeReason] = useState("");

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
        ? `“${decisionTarget.title}” was accepted privately. Its linked Session is ready; review the staged message before release.`
        : `“${decisionTarget.title}” was rejected privately. Review the staged message before release.`);
      setDecisionTarget(null);
      setDecisionReason("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The decision could not be recorded.");
    } finally {
      setBusyId(null);
    }
  }

  function openNotification(submission: SubmissionRecord) {
    const notification = submission.decisionNotification;
    if (!notification) return;
    setNotificationTarget(submission);
    setNotificationSubject(notification.subjectTemplate);
    setNotificationHtml(notification.htmlTemplate);
    setNotificationText(notification.textTemplate);
    setNotificationRevision(notification.revision);
    setNotificationStatus(notification.status);
  }

  async function saveNotification() {
    if (!notificationTarget?.decisionId) return;
    setBusyId(notificationTarget.id);
    try {
      const saved = await readApi<NonNullable<SubmissionRecord["decisionNotification"]>>(await fetch(
        `/api/v1/organizer/events/${eventSlug}/decisions/${notificationTarget.decisionId}/notification`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision: notificationRevision, subjectTemplate: notificationSubject, htmlTemplate: notificationHtml, textTemplate: notificationText }),
        },
      ));
      setNotificationRevision(saved.revision);
      setNotificationStatus(saved.status);
      setMessage("Decision communication reviewed and saved. It is ready for explicit release.");
      await reloadSubmissions();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The staged decision communication could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function releaseNotification() {
    if (!notificationTarget?.decisionId) return;
    setBusyId(notificationTarget.id);
    try {
      await readApi(await fetch(`/api/v1/organizer/events/${eventSlug}/decisions/${notificationTarget.decisionId}/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      }));
      setMessage(`“${notificationTarget.title}” is now released to the submitter and its reviewed notification is queued.`);
      setNotificationTarget(null);
      await reloadSubmissions();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The Decision could not be released.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeDecision() {
    if (!changeDecisionTarget?.decisionId || !changeDecisionTarget.decision) return;
    const outcome = changeDecisionTarget.decision === "accepted" ? "rejected" : "accepted";
    setBusyId(changeDecisionTarget.id);
    try {
      await readApi(await fetch(`/api/v1/organizer/events/${eventSlug}/decisions/${changeDecisionTarget.decisionId}/change`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: changeDecisionTarget.id,
          outcome,
          reason: decisionReason,
          changeReason,
          idempotencyKey: crypto.randomUUID(),
        }),
      }));
      setMessage(`Decision changed to ${outcome}. The new outcome is private until its new message is reviewed and released.`);
      setChangeDecisionTarget(null);
      setDecisionReason("");
      setChangeReason("");
      await reloadSubmissions();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The Decision could not be changed safely.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveChangeRequest(requestId: string, resolution: "approved" | "rejected") {
    setBusyId(requestId);
    try {
      await readApi(await fetch(`/api/v1/organizer/events/${eventSlug}/session-change-requests/${requestId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution, note: resolution === "approved" ? "Approved into a new audited Session version." : "Request declined by the program team.", idempotencyKey: crypto.randomUUID() }),
      }));
      setMessage(resolution === "approved" ? "Session change approved. A new version was created and content returned to review." : "Session change request rejected with an audit record.");
      await reloadSubmissions();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The Session change request could not be resolved.");
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
              </> : submission.decision ? <><small>{submission.decisionReleasedAt ? `Released · ${submission.decisionNotification?.status ?? "queued"}` : `Private · message ${submission.decisionNotification?.status ?? "draft"}`}</small>{submission.decisionNotification && !submission.decisionReleasedAt ? <button type="button" onClick={() => openNotification(submission)}>Review & release</button> : null}<button type="button" className="secondary-action" onClick={() => { setChangeDecisionTarget(submission); setDecisionReason(submission.decision === "accepted" ? "Program requirements changed" : "Corrected program decision"); setChangeReason(""); }}>Change decision</button></> : <small>Draft is private</small>}
            </div>
            {submission.changeRequests.filter((request) => request.status === "pending").map((request) => <div className="submission-change-request" key={request.id}><strong>Session change requested</strong><small>{request.proposedTitle}</small><p>{request.reason}</p><div><button type="button" disabled={busyId === request.id} onClick={() => void resolveChangeRequest(request.id, "rejected")}>Reject</button><button type="button" className="primary-action" disabled={busyId === request.id} onClick={() => void resolveChangeRequest(request.id, "approved")}>Approve new version</button></div></div>)}
          </article>
        )) : null}
        {!loading && visibleSubmissions.length === 0 && !message ? <div className="cfp-empty"><strong>{submissions.length ? `No ${filter} proposals.` : "No proposals yet."}</strong><p>{submissions.length ? "Choose another decision queue to keep working." : "New proposals will appear here automatically."}</p></div> : null}
      </section>
      {decisionTarget ? <div className="submission-decision-backdrop"><section className="submission-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-decision-title"><p className="eyebrow">Private program decision</p><h2 id="submission-decision-title">{decisionTarget.title}</h2><p>Accept creates the linked Session as a private organizer handoff. Neither outcome, onboarding, nor email is released until you review the staged communication.</p><label>Private decision note<textarea autoFocus rows={5} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Why is this the right program decision?" /></label><footer><button type="button" className="secondary-action" onClick={() => { setDecisionTarget(null); setDecisionReason(""); }}>Cancel</button><button type="button" className="secondary-action danger" disabled={busyId === decisionTarget.id || decisionReason.trim().length < 3} onClick={() => void decide("rejected")}>Record rejection privately</button><button type="button" className="primary-action" disabled={busyId === decisionTarget.id || decisionReason.trim().length < 3} onClick={() => void decide("accepted")}>{busyId === decisionTarget.id ? "Recording…" : "Accept privately & create Session"}</button></footer></section></div> : null}
      {notificationTarget?.decisionNotification ? <div className="submission-decision-backdrop"><section className="submission-decision-dialog decision-notification-dialog" role="dialog" aria-modal="true"><p className="eyebrow">Decision release queue</p><h2>{notificationTarget.title}</h2><p>The outcome is still private. Review the exact email snapshot, save it, then release the Decision and queue delivery.</p><label>Subject<input value={notificationSubject} onChange={(event) => setNotificationSubject(event.target.value)} /></label><label>HTML body<textarea rows={7} value={notificationHtml} onChange={(event) => setNotificationHtml(event.target.value)} /></label><label>Plain-text body<textarea rows={5} value={notificationText} onChange={(event) => setNotificationText(event.target.value)} /></label><footer><button type="button" className="secondary-action" onClick={() => setNotificationTarget(null)}>Close</button><button type="button" className="secondary-action" disabled={busyId === notificationTarget.id} onClick={() => void saveNotification()}>Save reviewed message</button><button type="button" className="primary-action" disabled={busyId === notificationTarget.id || notificationStatus !== "reviewed"} onClick={() => void releaseNotification()}>Release & queue notification</button></footer></section></div> : null}
      {changeDecisionTarget?.decision ? <div className="submission-decision-backdrop"><section className="submission-decision-dialog" role="dialog" aria-modal="true"><p className="eyebrow">Audited Decision change</p><h2>{changeDecisionTarget.title}</h2><p>{changeDecisionTarget.decision === "accepted" ? "Accepted outcomes have a linked Session and may have placements or a live Publication. The server will reject a reversal that would silently corrupt those downstream records." : "Changing Rejected to Accepted creates the canonical linked Session, resets release state, and stages a fresh acceptance communication."}</p><label>New decision note<textarea rows={4} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></label><label>Why is the final Decision changing?<textarea rows={4} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></label><footer><button type="button" className="secondary-action" onClick={() => setChangeDecisionTarget(null)}>Cancel</button><button type="button" className={changeDecisionTarget.decision === "accepted" ? "secondary-action danger" : "primary-action"} disabled={busyId === changeDecisionTarget.id || decisionReason.trim().length < 1 || changeReason.trim().length < 3} onClick={() => void changeDecision()}>Change to {changeDecisionTarget.decision === "accepted" ? "Rejected" : "Accepted"}</button></footer></section></div> : null}
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
