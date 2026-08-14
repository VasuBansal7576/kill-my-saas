import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import "./forms-submissions.css";
import { readApi, type SubmissionRecord } from "./model";
import { decisionLabel, speakerSubmissionWorkspace, submissionsForWorkspace } from "./presentation";

type LoadState = "loading" | "ready" | "error";

export function SpeakerSubmissionsPage() {
  const { eventSlug = "" } = useParams();
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const workspace = speakerSubmissionWorkspace(location.pathname);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [changeTarget, setChangeTarget] = useState<SubmissionRecord | null>(null);
  const [proposedTitle, setProposedTitle] = useState("");
  const [proposedAbstract, setProposedAbstract] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSubmissions = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const result = await readApi<{ submissions: SubmissionRecord[] }>(await fetch(`/api/v1/speaker/events/${eventSlug}/submissions`, { signal: controller.signal }));
      setSubmissions(result.submissions);
      setLoadState("ready");
    } catch (error) {
      setLoadError(controller.signal.aborted ? "The request took too long. Try again." : error instanceof Error ? error.message : "Your speaker submissions could not be loaded.");
      setLoadState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }, [eventSlug]);

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
    const frame = requestAnimationFrame(() => void loadSubmissions());
    return () => cancelAnimationFrame(frame);
  }, [loadSubmissions]);
  useEffect(() => {
    if (loadState === "loading") return;
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }, [loadState, location.pathname]);

  function retrySubmissions() {
    setLoadState("loading");
    setLoadError(null);
    void loadSubmissions();
  }

  const visibleSubmissions = submissionsForWorkspace(submissions, workspace.decisions);

  return (
    <section className="speaker-submissions">
      <div className="page-head cfp-page-head">
        <div><p className="eyebrow">Speaker portal</p><h1 ref={headingRef} tabIndex={-1}>{workspace.title}</h1><p>{workspace.description}</p></div>
        {workspace.decisions ? <Link className="secondary-action" to={`/speaker/events/${eventSlug}/proposals`}>View proposals</Link> : <Link className="primary-action" to={`/cfp/${eventSlug}`}>Start a proposal</Link>}
      </div>
      {message ? <div className="form-error" role="alert">{message}</div> : null}
      {loadState === "loading" ? <div className="speaker-proposal-loading" aria-label={`Loading ${workspace.decisions ? "decisions" : "proposals"}`} aria-busy="true"><span /><span /><span /></div> : null}
      {loadState === "error" ? <div className="cfp-panel cfp-load-error" role="alert"><strong>{workspace.decisions ? "Decisions are unavailable." : "Proposals are unavailable."}</strong><p>{loadError}</p><button className="primary-action" type="button" onClick={retrySubmissions}>Retry</button></div> : null}
      {loadState === "ready" ?
      <div className="speaker-proposal-grid">
        {visibleSubmissions.map((submission) => (
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
              ? <div className="speaker-proposal-actions"><Link to={`/speaker/events/${eventSlug}/sessions#session-${submission.acceptedSession.id}`}>Open released Session: {submission.acceptedSession.title} →</Link><button type="button" className="secondary-action" onClick={() => openChangeRequest(submission)}>Request Session change</button></div>
              : submission.decision
                ? <small>Final proposal snapshot locked after Decision release.</small>
                : <Link to={`/cfp/${eventSlug}?submission=${submission.id}`}>{submission.state === "draft" ? "Resume draft" : "View or edit proposal"} →</Link>}
            {submission.changeRequests.length ? <p><small>{submission.changeRequests.filter((request) => request.status === "pending").length} pending · Latest request {submission.changeRequests[0]?.status}</small></p> : null}
          </article>
        ))}
        {visibleSubmissions.length === 0 ? <div className="cfp-panel cfp-empty"><strong>{workspace.emptyTitle}</strong><p>{workspace.emptyDescription}</p>{workspace.decisions && submissions.length ? <Link to={`/speaker/events/${eventSlug}/proposals`}>Return to proposals →</Link> : null}</div> : null}
      </div> : null}
      {changeTarget?.acceptedSession ? <div className="submission-decision-backdrop"><form className="submission-decision-dialog" onSubmit={(event) => void requestChange(event)}><p className="eyebrow">Audited Session change</p><h2>{changeTarget.acceptedSession.title}</h2><p>The accepted proposal remains an immutable snapshot. Approved changes create a new Session version and return approved content to review.</p><label>Session title<input required minLength={3} value={proposedTitle} onChange={(event) => setProposedTitle(event.target.value)} /></label><label>Session abstract<textarea required rows={6} value={proposedAbstract} onChange={(event) => setProposedAbstract(event.target.value)} /></label><label>Why should this change?<textarea required minLength={3} rows={3} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></label><footer><button type="button" className="secondary-action" onClick={() => setChangeTarget(null)}>Cancel</button><button type="submit" className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send change request"}</button></footer></form></div> : null}
    </section>
  );
}
