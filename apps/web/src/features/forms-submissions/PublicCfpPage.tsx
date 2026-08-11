import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import "./forms-submissions.css";
import { fieldIsVisible, readApi, type FormField, type ParticipantRole, type PublicForm, type SubmissionRecord } from "./model";

type ParticipantInput = { name: string; email: string; role: ParticipantRole };

export function PublicCfpPage() {
  const { eventSlug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [publicForm, setPublicForm] = useState<PublicForm | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "submitted" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const submissionId = searchParams.get("submission");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const form = await readApi<PublicForm>(await fetch(`/api/v1/public/cfp/${eventSlug}`));
        if (!active) return;
      setPublicForm(form);
      const speakerResponse = await fetch(`/api/v1/speaker/events/${eventSlug}/submissions`);
        if (!active) return;
      if (speakerResponse.ok) {
        setAuthenticated(true);
        const speakerData = await readApi<{ submissions: SubmissionRecord[] }>(speakerResponse);
          if (!active) return;
        setSubmissions(speakerData.submissions);
          const submission = speakerData.submissions.find((candidate) => candidate.id === submissionId);
          setTitle(submission?.title ?? "");
          setAnswers(submission?.answers ?? {});
          setParticipants(submission?.participants.map(({ name, email, role }) => ({ name, email, role })) ?? []);
      }
      setState("idle");
      } catch (error) {
        if (!active) return;
      setMessage(error instanceof Error ? error.message : "The call for speakers could not be loaded.");
      setState("error");
      }
    })();
    return () => { active = false; };
  }, [eventSlug, submissionId]);

  const selected = submissions.find((candidate) => candidate.id === submissionId) ?? null;
  const definition = publicForm?.form.definition;
  const visibleFields = useMemo(() => definition?.fields.filter((field) => fieldIsVisible(field, answers)) ?? [], [answers, definition]);

  const save = async (saveAsDraft: boolean) => {
    if (!publicForm) return;
    setState("saving");
    setMessage(null);
    const path = selected
      ? `/api/v1/speaker/events/${eventSlug}/submissions/${selected.id}`
      : `/api/v1/speaker/events/${eventSlug}/submissions?formId=${encodeURIComponent(publicForm.form.id)}`;
    try {
      const saved = await readApi<SubmissionRecord>(await fetch(path, {
        method: selected ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, answers, participants: compactParticipants(participants), saveAsDraft }),
      }));
      setSubmissions((current) => [saved, ...current.filter((submission) => submission.id !== saved.id)]);
      setSearchParams({ submission: saved.id });
      setState(saveAsDraft ? "idle" : "submitted");
      setMessage(saveAsDraft ? "Draft saved. You can close this page and resume later." : publicForm.form.definition.successCopy);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The proposal could not be saved.");
      setState("error");
    }
  };

  if (state === "loading") return <main className="public-cfp"><p>Loading call for speakers…</p></main>;
  if (!publicForm) return <main className="public-cfp"><div className="cfp-public-card"><h1>Call unavailable</h1><p role="alert">{message}</p></div></main>;

  const { event, form } = publicForm;
  const isOpen = form.availability === "open";
  return (
    <main className="public-cfp" style={{ "--cfp-brand": event.primaryColor } as CSSProperties}>
      <header className="public-cfp-header">
        <div><span className="cfp-public-mark">PF</span><strong>{event.name}</strong></div>
        <span>{event.startsOn}–{event.endsOn} · {event.location}</span>
      </header>
      <div className="public-cfp-layout">
        <section className="cfp-public-card cfp-public-intro">
          <p className="eyebrow">Call for speakers</p>
          <h1>{form.name}</h1>
          <p>{form.definition.welcomeCopy}</p>
          <div className={`cfp-availability ${form.availability}`}>
            {form.availability === "open" ? `Open${form.definition.closesAt ? ` until ${formatDate(form.definition.closesAt)}` : ""}` : form.availability === "upcoming" ? `Opens ${formatDate(form.definition.opensAt)}` : "Submissions are closed"}
          </div>
          <div className="cfp-catalog-summary"><strong>Tracks</strong><p>{event.tracks.join(" · ")}</p><strong>Formats</strong><p>{event.formats.join(" · ")}</p></div>
          {submissions.length > 0 ? (
            <div className="cfp-own-submissions">
              <h2>Your proposals</h2>
              {submissions.map((submission) => <button type="button" key={submission.id} className={submission.id === selected?.id ? "active" : ""} onClick={() => setSearchParams({ submission: submission.id })}><span>{submission.title}</span><em>{submission.state}</em></button>)}
              <button type="button" onClick={() => { setSearchParams({}); setTitle(""); setAnswers({}); setParticipants([]); }}>+ Start another proposal</button>
            </div>
          ) : <p className="cfp-signin-note">{authenticated
            ? "Your submitted proposals will appear here."
            : <>Sign in to save and return to proposals. <Link to={`/login?event=${encodeURIComponent(eventSlug)}&next=${encodeURIComponent(`/cfp/${eventSlug}`)}`}>Sign in</Link> or <Link to={`/login?mode=signup&event=${encodeURIComponent(eventSlug)}&next=${encodeURIComponent(`/cfp/${eventSlug}`)}`}>create a speaker account</Link>.</>}
          </p>}
        </section>

        <section className="cfp-public-card cfp-proposal-form">
          <div className="section-head"><h2>{selected ? "Edit proposal" : "New proposal"}</h2><span>{form.definition.target}</span></div>
          {!isOpen ? <div className="cfp-closed-message" role="status">This call is {form.availability}. New proposals and edits are locked.</div> : (
            <form onSubmit={(event_) => { event_.preventDefault(); void save(false); }}>
              <p className="cfp-instructions">{form.definition.instructionsCopy}</p>
              <label>Proposal title <span aria-hidden="true">*</span><input value={title} minLength={3} maxLength={180} required onChange={(event_) => setTitle(event_.target.value)} /></label>
              {visibleFields.map((field) => <PublicField key={field.key} field={field} value={answers[field.key]} event={event} onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))} />)}
              <fieldset className="cfp-participants">
                <legend>Participants <small>{form.definition.minimumParticipants}–{form.definition.maximumParticipants}</small></legend>
                {participants.map((participant, index) => (
                  <div className="cfp-participant-row" key={index}>
                    <label>Name<input value={participant.name} required onChange={(event_) => patchParticipant(setParticipants, index, { name: event_.target.value })} /></label>
                    <label>Email<input type="email" value={participant.email} required onChange={(event_) => patchParticipant(setParticipants, index, { email: event_.target.value })} /></label>
                    <label>Role<select value={participant.role} onChange={(event_) => patchParticipant(setParticipants, index, { role: event_.target.value as ParticipantRole })}>{Object.entries(form.definition.participantRoleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
                    <button type="button" onClick={() => setParticipants((current) => current.filter((_, participantIndex) => participantIndex !== index))} aria-label={`Remove ${participant.name || "participant"}`}>×</button>
                  </div>
                ))}
                {participants.length < form.definition.maximumParticipants ? <button className="cfp-add-participant" type="button" onClick={() => setParticipants((current) => [...current, { name: "", email: "", role: current.length === 0 ? "author" : "co_author" }])}>+ Add participant</button> : null}
              </fieldset>
              {message ? <div className={state === "error" ? "form-error" : "saved-notice"} role={state === "error" ? "alert" : "status"}>{message}</div> : null}
              <div className="cfp-submit-actions">
                {form.definition.allowDrafts && selected?.state !== "submitted" ? <button type="button" className="secondary-action" disabled={state === "saving" || title.trim().length < 3} onClick={() => void save(true)}>Save draft</button> : null}
                <button type="submit" className="primary-action" disabled={state === "saving"}>{state === "saving" ? "Saving…" : selected?.state === "submitted" ? "Save proposal changes" : "Submit proposal"}</button>
              </div>
            </form>
          )}
          {state === "submitted" ? <p className="cfp-dashboard-link"><Link to={`/speaker/events/${eventSlug}/submissions`}>View proposal status in your speaker dashboard →</Link></p> : null}
        </section>
      </div>
    </main>
  );
}

function PublicField({ field, value, event, onChange }: { field: FormField; value: unknown; event: PublicForm["event"]; onChange: (value: unknown) => void }) {
  const options = field.settings.catalog === "track" ? event.tracks : field.settings.catalog === "format" ? event.formats : field.settings.options ?? [];
  const help = typeof field.settings.helpText === "string" ? field.settings.helpText : null;
  return (
    <label>{field.label} {field.required ? <span aria-hidden="true">*</span> : null}{help ? <small>{help}</small> : null}
      {field.type === "long_text" ? <textarea rows={6} value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)} /> : null}
      {field.type === "short_text" ? <input value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)} /> : null}
      {field.type === "date" ? <input type="date" value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)} /> : null}
      {field.type === "checkbox" ? <span className="cfp-checkbox"><input type="checkbox" checked={value === true} onChange={(event_) => onChange(event_.target.checked)} /> Yes</span> : null}
      {field.type === "select" ? <select value={typeof value === "string" ? value : ""} required={field.required} onChange={(event_) => onChange(event_.target.value)}><option value="">Choose…</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
      {field.type === "multi_select" ? <select multiple value={Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []} required={field.required} onChange={(event_) => onChange(Array.from(event_.target.selectedOptions, (option) => option.value))}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
    </label>
  );
}

function patchParticipant(setParticipants: Dispatch<SetStateAction<ParticipantInput[]>>, index: number, patch: Partial<ParticipantInput>) {
  setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, ...patch } : participant));
}

function compactParticipants(participants: ParticipantInput[]) {
  return participants.filter((participant) => participant.name.trim() || participant.email.trim());
}

function formatDate(value: string | null) {
  if (!value) return "later";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
