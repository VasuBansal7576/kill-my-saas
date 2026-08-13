import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "./forms-submissions.css";
import { readApi, type SubmissionRecord } from "./model";
import { decisionLabel } from "./presentation";

export function SpeakerSubmissionsPage() {
  const { eventSlug = "" } = useParams();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [changeTarget, setChangeTarget] = useState<SubmissionRecord | null>(null);
  const [proposedTitle, setProposedTitle] = useState("");
  const [proposedAbstract, setProposedAbstract] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false);

  function openChangeRequest(submission: SubmissionRecord) {
    if (!submission.acceptedSession) return;
    setChangeTarget(submission);
    setProposedTitle(submission.acceptedSession.title);
    setProposedAbstract(submission.acceptedSession.abstract);
    setChangeReason("");
  }

  async function requestChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changeTarget?.acceptedSession) return;
    setBusy(true);
    try {
      await readApi(await fetch(`/api/v1/speaker/events/${eventSlug}/sessions/${changeTarget.acceptedSession.id}/change-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: proposedTitle, abstract: proposedAbstract, reason: changeReason, idempotencyKey: crypto.randomUUID() }),
      }));
      const result = await readApi<{ submissions: SubmissionRecord[] }>(await fetch(`/api/v1/speaker/events/${eventSlug}/submissions`));
      setSubmissions(result.submissions);
      setChangeTarget(null);
      setMessage("Session change request sent. The proposal snapshot stays locked while organizers review the audited request.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Session change request could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void fetch(`/api/v1/speaker/events/${eventSlug}/submissions`)
      .then((response) => readApi<{ submissions: SubmissionRecord[] }>(response))
      .then((result) => setSubmissions(result.submissions))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Your proposals could not be loaded."));
  }, [eventSlug]);

  return (
    <section className="speaker-submissions">
      <div className="page-head cfp-page-head">
        <div><p className="eyebrow">Speaker portal</p><h1>Your proposals</h1><p>Resume drafts and track every submitted proposal from one private workspace.</p></div>
        <Link className="primary-action" to={`/cfp/${eventSlug}`}>Start a proposal</Link>
      </div>
      {message ? <div className="form-error" role="alert">{message}</div> : null}
      <div className="speaker-proposal-grid">
        {submissions.map((submission) => (
          <article className="cfp-panel" key={submission.id}>
            <div className="section-head"><span className={`submission-state ${submission.decision ?? submission.state}`}>{decisionLabel(submission)}</span><time dateTime={submission.updatedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(submission.updatedAt))}</time></div>
            <h2>{submission.title}</h2>
            <p>{submission.decision === "accepted"
              ? "Your proposal was accepted. Continue to speaker onboarding and session preparation."
              : submission.decision === "rejected"
                ? "Your proposal was not selected for this program. The recorded decision remains visible here."
                : submission.state === "draft"
                  ? "Continue completing this proposal before the call closes."
                  : "Your proposal is recorded and ready for the review workflow."}</p>
            {submission.decision === "accepted" && submission.acceptedSession
              ? <div className="speaker-proposal-actions"><Link to={`/speaker/events/${eventSlug}#session-${submission.acceptedSession.id}`}>Open accepted Session: {submission.acceptedSession.title} →</Link><button type="button" className="secondary-action" onClick={() => openChangeRequest(submission)}>Request Session change</button></div>
              : submission.decision
                ? <small>Final proposal snapshot locked after Decision release.</small>
                : <Link to={`/cfp/${eventSlug}?submission=${submission.id}`}>{submission.state === "draft" ? "Resume draft" : "View or edit proposal"} →</Link>}
            {submission.changeRequests.length ? <p><small>{submission.changeRequests.filter((request) => request.status === "pending").length} pending · Latest request {submission.changeRequests[0]?.status}</small></p> : null}
          </article>
        ))}
        {submissions.length === 0 && !message ? <div className="cfp-panel cfp-empty"><strong>No proposals yet.</strong><p>Start from the public call for speakers form.</p></div> : null}
      </div>
      {changeTarget?.acceptedSession ? <div className="submission-decision-backdrop"><form className="submission-decision-dialog" onSubmit={(event) => void requestChange(event)}><p className="eyebrow">Audited Session change</p><h2>{changeTarget.acceptedSession.title}</h2><p>The accepted proposal remains an immutable snapshot. Approved changes create a new Session version and return approved content to review.</p><label>Session title<input required minLength={3} value={proposedTitle} onChange={(event) => setProposedTitle(event.target.value)} /></label><label>Session abstract<textarea required rows={6} value={proposedAbstract} onChange={(event) => setProposedAbstract(event.target.value)} /></label><label>Why should this change?<textarea required minLength={3} rows={3} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></label><footer><button type="button" className="secondary-action" onClick={() => setChangeTarget(null)}>Cancel</button><button type="submit" className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send change request"}</button></footer></form></div> : null}
    </section>
  );
}
