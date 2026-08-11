import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "./forms-submissions.css";
import { readApi, type SubmissionRecord } from "./model";

export function SpeakerSubmissionsPage() {
  const { eventSlug = "" } = useParams();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/v1/speaker/events/${eventSlug}/submissions`)
      .then((response) => readApi<{ submissions: SubmissionRecord[] }>(response))
      .then((result) => setSubmissions(result.submissions))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Your proposals could not be loaded."));
  }, [eventSlug]);

  return (
    <main className="speaker-submissions">
      <div className="page-head cfp-page-head">
        <div><p className="eyebrow">Speaker portal</p><h1>Your proposals</h1><p>Resume drafts and track every submitted proposal from one private workspace.</p></div>
        <Link className="primary-action" to={`/cfp/${eventSlug}`}>Start a proposal</Link>
      </div>
      {message ? <div className="form-error" role="alert">{message}</div> : null}
      <div className="speaker-proposal-grid">
        {submissions.map((submission) => (
          <article className="cfp-panel" key={submission.id}>
            <div className="section-head"><span className={`submission-state ${submission.state}`}>{submission.state}</span><time dateTime={submission.updatedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(submission.updatedAt))}</time></div>
            <h2>{submission.title}</h2>
            <p>{submission.state === "draft" ? "Continue completing this proposal before the call closes." : "Your proposal is recorded and ready for the review workflow."}</p>
            <Link to={`/cfp/${eventSlug}?submission=${submission.id}`}>{submission.state === "draft" ? "Resume draft" : "View or edit proposal"} →</Link>
          </article>
        ))}
        {submissions.length === 0 && !message ? <div className="cfp-panel cfp-empty"><strong>No proposals yet.</strong><p>Start from the public call for speakers form.</p></div> : null}
      </div>
    </main>
  );
}
