import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./forms-submissions.css";
import { readApi, type SubmissionRecord } from "./model";

export function SubmissionsPage() {
  const { eventSlug = "" } = useParams();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/v1/organizer/events/${eventSlug}/submissions`)
      .then((response) => readApi<{ submissions: SubmissionRecord[] }>(response))
      .then((result) => setSubmissions(result.submissions))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Submissions could not be loaded."));
  }, [eventSlug]);

  return (
    <div className="cfp-workspace">
      <div className="page-head cfp-page-head">
        <div><p className="eyebrow">Program</p><h1>Submissions</h1><p>Submitted proposals are ready for Reviews; drafts remain private to their submitters.</p></div>
        <span className="cfp-handoff-badge">{submissions.filter((submission) => submission.state === "submitted").length} ready for review</span>
      </div>
      {message ? <div className="form-error" role="alert">{message}</div> : null}
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

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayAnswer(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
