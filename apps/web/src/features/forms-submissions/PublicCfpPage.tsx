import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatEventDateRange, formatEventDateTime } from "../../app/event-time";
import "./forms-submissions.css";
import { ApiError, fieldIsVisible, readApi, type FormField, type ParticipantRole, type PublicForm, type SubmissionRecord } from "./model";
import {
  answersWithCanonicalTitle,
  canonicalTitleField,
  cfpAvailabilityLabel,
  ensurePrimaryParticipant,
  participantLimitGuidance,
  participantValidationMessage,
  removeAdditionalParticipant,
  type ParticipantInput,
} from "./presentation";

type LocalProposal = { title: string; answers: Record<string, unknown>; participants: ParticipantInput[]; savedAt: string };

export function PublicCfpPage() {
  const { eventSlug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [localProposal] = useState(() => readLocalProposal(eventSlug));
  const [publicForm, setPublicForm] = useState<PublicForm | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [title, setTitle] = useState(localProposal?.title ?? "");
  const [answers, setAnswers] = useState<Record<string, unknown>>(localProposal?.answers ?? {});
  const [participants, setParticipants] = useState<ParticipantInput[]>(() => ensurePrimaryParticipant(localProposal?.participants ?? []));
  const [state, setState] = useState<"loading" | "idle" | "saving" | "submitted" | "error">("loading");
  const [pendingAction, setPendingAction] = useState<"draft" | "submit" | null>(null);
  const [message, setMessage] = useState<string | null>(localProposal ? "Your unfinished proposal was restored on this device." : null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const submissionId = searchParams.get("submission");

  useEffect(() => {
    let active = true;
    const speakerRequest = new AbortController();
    const publicRequest = new AbortController();
    let speakerTimeout: number | null = null;
    const publicTimeout = window.setTimeout(() => publicRequest.abort(), 8_000);
    void (async () => {
      try {
        const form = await readApi<PublicForm>(await fetch(`/api/v1/public/cfp/${eventSlug}`, { signal: publicRequest.signal }));
        if (!active) return;
        setPublicForm(form);
        setState("idle");

        speakerTimeout = window.setTimeout(() => speakerRequest.abort(), 8_000);
        try {
          const speakerResponse = await fetch(`/api/v1/speaker/events/${eventSlug}/submissions`, { signal: speakerRequest.signal });
          if (!active) return;
          if (speakerResponse.ok) {
            setAuthenticated(true);
            const speakerData = await readApi<{ submissions: SubmissionRecord[] }>(speakerResponse);
            if (!active) return;
            setSubmissions(speakerData.submissions);
            const submission = speakerData.submissions.find((candidate) => candidate.id === submissionId);
            if (submission) {
              setTitle(submission.title);
              setAnswers(submission.answers);
              setParticipants(ensurePrimaryParticipant(submission.participants.map(({ name, email, role }) => ({ name, email, role }))));
            }
          }
        } catch {
          // Public CFP content is independent of optional speaker-session detection.
        } finally {
          if (speakerTimeout !== null) window.clearTimeout(speakerTimeout);
          if (active) setAuthChecked(true);
        }
      } catch (error) {
        if (!active) return;
        setAuthChecked(true);
        setMessage(publicRequest.signal.aborted ? "The call for speakers took longer than 8 seconds to respond." : error instanceof Error ? error.message : "The call for speakers could not be loaded.");
        setState("error");
      } finally {
        window.clearTimeout(publicTimeout);
      }
    })();
    return () => {
      active = false;
      speakerRequest.abort();
      publicRequest.abort();
      window.clearTimeout(publicTimeout);
      if (speakerTimeout !== null) window.clearTimeout(speakerTimeout);
    };
  }, [eventSlug, loadAttempt, submissionId]);

  useEffect(() => {
    if (!authChecked || authenticated || submissionId) return;
    if (!title.trim() && Object.keys(answers).length === 0 && compactParticipants(participants).length === 0) return;
    writeLocalProposal(eventSlug, { title, answers, participants, savedAt: new Date().toISOString() });
  }, [answers, authChecked, authenticated, eventSlug, participants, submissionId, title]);

  const selected = submissions.find((candidate) => candidate.id === submissionId) ?? null;
  const definition = publicForm?.form.definition;
  const titleField = useMemo(() => canonicalTitleField(definition?.fields ?? []), [definition]);
  const visibleFields = useMemo(() => definition?.fields.filter((field) => field.key !== titleField?.key && fieldIsVisible(field, answers)) ?? [], [answers, definition, titleField]);

  const save = async (saveAsDraft: boolean) => {
    if (!publicForm) return;
    if (!saveAsDraft) {
      const participantError = participantValidationMessage(
        participants,
        publicForm.form.definition.minimumParticipants,
        publicForm.form.definition.maximumParticipants,
      );
      if (participantError) {
        setFieldErrors({ participants: participantError });
        setMessage("Review the proposal and correct the highlighted information.");
        setState("error");
        focusFirstError();
        return;
      }
    }
    setState("saving");
    setPendingAction(saveAsDraft ? "draft" : "submit");
    setMessage(null);
    setFieldErrors({});
    const path = selected
      ? `/api/v1/speaker/events/${eventSlug}/submissions/${selected.id}`
      : `/api/v1/speaker/events/${eventSlug}/submissions?formId=${encodeURIComponent(publicForm.form.id)}`;
    try {
      const saved = await readApi<SubmissionRecord>(await fetch(path, {
        method: selected ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, answers: answersWithCanonicalTitle(answers, titleField, title), participants: compactParticipants(participants), saveAsDraft }),
      }));
      setSubmissions((current) => [saved, ...current.filter((submission) => submission.id !== saved.id)]);
      clearLocalProposal(eventSlug);
      setSearchParams({ submission: saved.id });
      setState(saveAsDraft ? "idle" : "submitted");
      setPendingAction(null);
      setMessage(saveAsDraft ? "Draft saved. You can close this page and resume later." : publicForm.form.definition.successCopy);
    } catch (error) {
      setFieldErrors(error instanceof ApiError ? error.fieldErrors : {});
      setMessage(error instanceof Error ? error.message : "The proposal could not be saved.");
      setState("error");
      setPendingAction(null);
      focusFirstError();
    }
  };

  if (state === "loading") return <main id="main-content" className="public-cfp cfp-recovery" aria-labelledby="cfp-recovery-title"><div className="cfp-public-card"><span className="cfp-public-mark">PF</span><p className="eyebrow">Call for speakers</p><h1 id="cfp-recovery-title">Loading this event’s CFP…</h1><p>The page structure is ready while we look up the submission form.</p><div className="cfp-recovery-skeleton" aria-busy="true" aria-label="Loading call for speakers"><i /><i /><i /></div></div></main>;
  if (!publicForm) return <main id="main-content" className="public-cfp cfp-recovery" aria-labelledby="cfp-recovery-title"><div className="cfp-public-card"><span className="cfp-public-mark">PF</span><p className="eyebrow">Call for speakers</p><h1 id="cfp-recovery-title">We couldn’t open this CFP.</h1><p role="alert">{message ?? "This event may not exist or its call for speakers may not be available."}</p><div className="cfp-recovery-actions"><button type="button" className="primary-action" onClick={() => { setState("loading"); setLoadAttempt((attempt) => attempt + 1); }}>Retry CFP</button><Link className="secondary-action" to="/help">Get help</Link><Link className="secondary-action" to="/">ProgramFlow home</Link></div></div></main>;

  const { event, form } = publicForm;
  const isOpen = form.availability === "open";
  const draftDisabledReason = state === "saving"
    ? "Wait for the current save to finish."
    : title.trim().length < 3
      ? "Enter at least 3 characters in Proposal title to save a draft."
      : null;
  return (
    <main id="main-content" className="public-cfp" style={{ "--cfp-brand": event.primaryColor } as CSSProperties}>
      <header className="public-cfp-header">
        <div><span className="cfp-public-mark">PF</span><strong>{event.name}</strong></div>
        <span>{formatEventDateRange(event.startsOn, event.endsOn)} · {event.location}</span>
      </header>
      <div className="public-cfp-layout">
        <section className="cfp-public-card cfp-public-intro">
          <p className="eyebrow">Call for speakers</p>
          <h1>{form.name}</h1>
          <p>{form.definition.welcomeCopy}</p>
          <div className={`cfp-availability ${form.availability}`}>
            {cfpAvailabilityLabel(form.availability, form.definition.opensAt, form.definition.closesAt, event.timezone, formatEventDateTime)}
          </div>
          <div className="cfp-catalog-summary"><strong>Tracks</strong><p>{event.tracks.join(" · ")}</p><strong>Formats</strong><p>{event.formats.join(" · ")}</p></div>
          {submissions.length > 0 ? (
            <div className="cfp-own-submissions">
              <h2>Your proposals</h2>
              {submissions.map((submission) => <button type="button" key={submission.id} className={submission.id === selected?.id ? "active" : ""} onClick={() => setSearchParams({ submission: submission.id })}><span>{submission.title}</span><em>{submission.state}</em></button>)}
              <button type="button" onClick={() => { setSearchParams({}); setTitle(""); setAnswers({}); setParticipants(ensurePrimaryParticipant([])); setFieldErrors({}); setMessage(null); }}>+ Start another proposal</button>
            </div>
          ) : authenticated ? <p className="cfp-signin-note">Your submitted proposals will appear here.</p> : null}
        </section>

        <section className="cfp-public-card cfp-proposal-form">
          <div className="section-head"><h2>{selected ? "Edit proposal" : "New proposal"}</h2><span>{form.definition.target}</span></div>
          {!isOpen ? <div className="cfp-closed-message" role="status">This call is {form.availability}. New proposals and edits are locked.</div> : !authChecked ? (
            <div className="cfp-auth-gate" aria-live="polite"><span className="cfp-auth-icon">PF</span><h2>Checking speaker access…</h2><p>Your proposal workspace will open in a moment.</p></div>
          ) : !authenticated ? (
            <div className="cfp-auth-gate">
              <span className="cfp-auth-icon">→</span>
              <p className="eyebrow">Speaker access</p>
              <h2>Sign in before you start</h2>
              <p>Your account keeps drafts safe, lets you edit while the call is open, and gives you one place for decisions and speaker tasks.</p>
              {hasLocalProposal(eventSlug) ? <div className="cfp-restored-note">We found unfinished work on this device. Sign in and it will be restored here.</div> : null}
              <div className="cfp-auth-actions">
                <Link className="primary-action" to={`/login?event=${encodeURIComponent(eventSlug)}&next=${encodeURIComponent(`/cfp/${eventSlug}`)}`}>Sign in to continue</Link>
                <Link className="secondary-action" to={`/login?mode=signup&event=${encodeURIComponent(eventSlug)}&next=${encodeURIComponent(`/cfp/${eventSlug}`)}`}>Create speaker account</Link>
              </div>
              <small>No organizer access is granted. Speaker accounts can only see their own proposals and event work.</small>
            </div>
          ) : (
            <form aria-busy={state === "saving"} onSubmit={(event_) => { event_.preventDefault(); void save(false); }}>
              <div className="cfp-form-intro">
                <p className="cfp-instructions">{form.definition.instructionsCopy}</p>
                <p className="cfp-required-note"><span aria-hidden="true">*</span> Required fields</p>
              </div>
              <fieldset className="cfp-form-section">
                <legend>Proposal details</legend>
                <p className="cfp-section-help">Tell the program team what you want to present. You can save a draft before every required answer is complete.</p>
                <label className="cfp-control" htmlFor="proposal-title">{titleField?.label ?? "Proposal title"} <span aria-hidden="true">*</span><small id="proposal-title-help">This is the canonical title used for review and for the accepted session.</small><input id="proposal-title" value={title} minLength={3} maxLength={180} required aria-invalid={Boolean(fieldErrors.title ?? (titleField ? fieldErrors[titleField.key] : null))} aria-describedby={`proposal-title-help${fieldErrors.title || (titleField && fieldErrors[titleField.key]) ? " proposal-title-error" : ""}`} onChange={(event_) => { setTitle(event_.target.value); clearFieldError(setFieldErrors, "title"); if (titleField) clearFieldError(setFieldErrors, titleField.key); }} />{fieldErrors.title || (titleField && fieldErrors[titleField.key]) ? <small className="cfp-field-error" id="proposal-title-error">{fieldErrors.title ?? fieldErrors[titleField!.key]}</small> : null}</label>
                {visibleFields.map((field) => <PublicField key={field.key} field={field} value={answers[field.key]} event={event} error={fieldErrors[field.key] ?? fieldErrors.answers} onChange={(value) => { setAnswers((current) => ({ ...current, [field.key]: value })); clearFieldError(setFieldErrors, field.key); clearFieldError(setFieldErrors, "answers"); }} />)}
              </fieldset>
              <fieldset className="cfp-participants cfp-form-section" tabIndex={-1} aria-invalid={Boolean(fieldErrors.participants)} aria-describedby={`participant-guidance${fieldErrors.participants ? " participant-error" : ""}`}>
                <legend>Participant details</legend>
                <div className="cfp-participant-summary">
                  <p id="participant-guidance">{participantLimitGuidance(form.definition.minimumParticipants, form.definition.maximumParticipants)}</p>
                  <span aria-live="polite">{compactParticipants(participants).length} of {form.definition.maximumParticipants} added</span>
                </div>
                {participants.map((participant, index) => (
                  <div className="cfp-participant-row" key={index}>
                    <div className="cfp-participant-row-head"><strong>{index === 0 ? "Primary participant" : `Additional participant ${index}`}</strong>{index === 0 ? <span>Required</span> : <button type="button" className="cfp-remove-participant" onClick={() => { setParticipants((current) => removeAdditionalParticipant(current, index)); clearFieldError(setFieldErrors, "participants"); }}>Remove participant</button>}</div>
                    <div className="cfp-participant-fields">
                      <label>Name<input value={participant.name} required onChange={(event_) => { patchParticipant(setParticipants, index, { name: event_.target.value }); clearFieldError(setFieldErrors, "participants"); }} /></label>
                      <label>Email<input type="email" value={participant.email} required onChange={(event_) => { patchParticipant(setParticipants, index, { email: event_.target.value }); clearFieldError(setFieldErrors, "participants"); }} /></label>
                      <label>Role<select value={participant.role} disabled={index === 0} aria-describedby={index === 0 ? "primary-role-help" : undefined} onChange={(event_) => { patchParticipant(setParticipants, index, { role: event_.target.value as ParticipantRole }); clearFieldError(setFieldErrors, "participants"); }}>{Object.entries(form.definition.participantRoleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select>{index === 0 ? <small id="primary-role-help">The primary role is kept so the proposal always has an owner.</small> : null}</label>
                    </div>
                  </div>
                ))}
                {fieldErrors.participants ? <p className="cfp-field-error cfp-participant-error" id="participant-error" role="alert">{fieldErrors.participants}</p> : null}
                {participants.length < form.definition.maximumParticipants ? <button className="cfp-add-participant" type="button" onClick={() => { setParticipants((current) => [...ensurePrimaryParticipant(current), { name: "", email: "", role: "co_author" }]); clearFieldError(setFieldErrors, "participants"); }}>+ Add another participant</button> : <p className="cfp-limit-reached" role="status">Participant limit reached.</p>}
              </fieldset>
              {message ? <div className={state === "error" ? "form-error" : "saved-notice"} role={state === "error" ? "alert" : "status"}>{message}</div> : null}
              <div className="cfp-submit-actions">
                <div className="cfp-submit-feedback" aria-live="polite">{state === "saving" ? (pendingAction === "draft" ? "Saving your draft…" : "Submitting your proposal…") : "Drafts stay private until you submit."}</div>
                {form.definition.allowDrafts && selected?.state !== "submitted" ? <><button type="button" className="secondary-action" aria-describedby={draftDisabledReason ? "save-draft-reason" : undefined} disabled={Boolean(draftDisabledReason)} onClick={() => void save(true)}>{state === "saving" && pendingAction === "draft" ? "Saving draft…" : "Save draft"}</button>{draftDisabledReason ? <span id="save-draft-reason" className="cfp-draft-reason" role="status">{draftDisabledReason}</span> : null}</> : null}
                <button type="submit" className="primary-action" disabled={state === "saving"}>{state === "saving" && pendingAction === "submit" ? "Submitting proposal…" : selected?.state === "submitted" ? "Save proposal changes" : "Submit proposal"}</button>
              </div>
            </form>
          )}
          {state === "submitted" ? <p className="cfp-dashboard-link"><Link to={`/speaker/events/${eventSlug}/submissions`}>View proposal status in your speaker dashboard →</Link></p> : null}
        </section>
      </div>
    </main>
  );
}

function PublicField({ field, value, event, error, onChange }: { field: FormField; value: unknown; event: PublicForm["event"]; error?: string; onChange: (value: unknown) => void }) {
  const options = field.settings.catalog === "track" ? event.tracks : field.settings.catalog === "format" ? event.formats : field.settings.options ?? [];
  const help = typeof field.settings.helpText === "string" ? field.settings.helpText : null;
  const inputId = `proposal-field-${field.key}`;
  const describedBy = [help ? `${inputId}-help` : null, error ? `${inputId}-error` : null].filter(Boolean).join(" ") || undefined;
  const attributes = { id: inputId, "aria-invalid": Boolean(error), "aria-describedby": describedBy };
  return (
    <label className="cfp-control" htmlFor={inputId}>{field.label} {field.required ? <span aria-hidden="true">*</span> : null}{help ? <small id={`${inputId}-help`}>{help}</small> : null}
      {field.type === "long_text" ? <textarea {...attributes} rows={6} value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)} /> : null}
      {field.type === "short_text" ? <input {...attributes} value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)} /> : null}
      {field.type === "date" ? <input {...attributes} type="date" value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)} /> : null}
      {field.type === "checkbox" ? <span className="cfp-checkbox"><input {...attributes} type="checkbox" checked={value === true} onChange={(event_) => onChange(event_.target.checked)} /> Yes</span> : null}
      {field.type === "select" ? <select {...attributes} value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)}><option value="">Choose…</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
      {field.type === "multi_select" ? <select {...attributes} multiple value={Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []} required={field.required} onChange={(event_) => onChange(Array.from(event_.target.selectedOptions, (option) => option.value))}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
      {error ? <small className="cfp-field-error" id={`${inputId}-error`}>{error}</small> : null}
    </label>
  );
}

function patchParticipant(setParticipants: Dispatch<SetStateAction<ParticipantInput[]>>, index: number, patch: Partial<ParticipantInput>) {
  setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, ...patch } : participant));
}

function compactParticipants(participants: ParticipantInput[]) {
  return participants.filter((participant) => participant.name.trim() || participant.email.trim());
}

function clearFieldError(setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>, field: string) {
  setFieldErrors((current) => {
    if (!(field in current)) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });
}

function focusFirstError() {
  window.setTimeout(() => {
    document.querySelector<HTMLElement>('.cfp-proposal-form [aria-invalid="true"]')?.focus();
  });
}

function localProposalKey(eventSlug: string) {
  return `programflow:cfp:${eventSlug}:proposal`;
}

function readLocalProposal(eventSlug: string): LocalProposal | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(localProposalKey(eventSlug));
    return value ? JSON.parse(value) as LocalProposal : null;
  } catch {
    return null;
  }
}

function writeLocalProposal(eventSlug: string, proposal: LocalProposal) {
  try {
    window.localStorage.setItem(localProposalKey(eventSlug), JSON.stringify(proposal));
  } catch {
    // Storage can be disabled; authenticated server drafts remain the durable path.
  }
}

function clearLocalProposal(eventSlug: string) {
  try { window.localStorage.removeItem(localProposalKey(eventSlug)); } catch { /* no-op */ }
}

function hasLocalProposal(eventSlug: string) {
  return readLocalProposal(eventSlug) !== null;
}
