import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { jsonRequest, reviewsRequest } from "./api";
import { reviewerCriterionHelp } from "./presentation";
import type { ReviewerQueue } from "./types";
import "./reviews-decisions.css";

export function ReviewerQueuePage() {
  const { eventSlug = "" } = useParams();
  const [queue, setQueue] = useState<ReviewerQueue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recusalReason, setRecusalReason] = useState("");

  const reload = useCallback(async () => {
    try {
      const next = await reviewsRequest<ReviewerQueue>(`/api/v1/reviewer/events/${eventSlug}/reviews`);
      const nextSelectedId = selectedId ?? next.assignments.find((assignment) => assignment.status !== "submitted" && assignment.status !== "recused")?.assignmentId ?? next.assignments[0]?.assignmentId ?? null;
      const nextSelected = next.assignments.find((assignment) => assignment.assignmentId === nextSelectedId);
      setQueue(next);
      setSelectedId(nextSelectedId);
      setAnswers(nextSelected?.ownResponse?.answers ?? {});
      setNotes(nextSelected?.ownResponse?.notes ?? "");
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Reviewer queue could not be loaded."); }
  }, [eventSlug, selectedId]);
  useEffect(() => {
    let active = true;
    void reviewsRequest<ReviewerQueue>(`/api/v1/reviewer/events/${eventSlug}/reviews`).then((next) => {
      if (!active) return;
      const nextSelectedId = next.assignments.find((assignment) => assignment.status !== "submitted" && assignment.status !== "recused")?.assignmentId ?? next.assignments[0]?.assignmentId ?? null;
      const nextSelected = next.assignments.find((assignment) => assignment.assignmentId === nextSelectedId);
      setQueue(next);
      setSelectedId(nextSelectedId);
      setAnswers(nextSelected?.ownResponse?.answers ?? {});
      setNotes(nextSelected?.ownResponse?.notes ?? "");
      setError(null);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Reviewer queue could not be loaded.");
    });
    return () => { active = false; };
  }, [eventSlug]);
  const selected = useMemo(() => queue?.assignments.find((assignment) => assignment.assignmentId === selectedId) ?? null, [queue, selectedId]);

  function selectAssignment(assignmentId: string) {
    const assignment = queue?.assignments.find((candidate) => candidate.assignmentId === assignmentId);
    setSelectedId(assignmentId);
    setAnswers(assignment?.ownResponse?.answers ?? {});
    setNotes(assignment?.ownResponse?.notes ?? "");
    setRecusalReason("");
  }

  async function save(finalize: boolean) {
    if (!selected) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await reviewsRequest(`/api/v1/reviewer/events/${eventSlug}/reviews/${selected.assignmentId}`, jsonRequest("PUT", { answers, notes, finalize }));
      setNotice(finalize ? "Review finalized. Ask an organizer to reopen it if a correction is needed." : "Draft saved. You can continue it later.");
      await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Review could not be saved."); }
    finally { setBusy(false); }
  }

  async function recuse() {
    if (!selected) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await reviewsRequest(`/api/v1/reviewer/events/${eventSlug}/reviews/${selected.assignmentId}/recuse`, jsonRequest("POST", { reason: recusalReason }));
      setNotice("Conflict recorded and the assignment marked recused.");
      await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Recusal could not be recorded."); }
    finally { setBusy(false); }
  }

  if (!queue) return <p className="rd-loading">{error ?? "Loading reviewer queue…"}</p>;
  const complete = queue.assignments.filter((assignment) => assignment.status === "submitted").length;
  return <div className="rd-reviewer-shell"><header className="rd-reviewer-head"><div><span className="rd-kicker">Reviewer portal · {queue.event.name}</span><h1>Your assigned reviews</h1><p>Only your assigned proposals and your own response are available here.</p></div><div className="rd-reviewer-count"><strong>{complete}/{queue.assignments.length}</strong><small>finalized</small></div></header>{error ? <div className="rd-alert error" role="alert">{error}</div> : null}{notice ? <div className="rd-alert success" role="status">{notice}</div> : null}<div className="rd-reviewer-layout"><aside className="rd-queue"><div className="rd-panel-head"><h2>Your queue</h2><span className="rd-badge">Your assignments</span></div>{queue.assignments.map((assignment) => <button key={assignment.assignmentId} className={assignment.assignmentId === selectedId ? "active" : ""} onClick={() => selectAssignment(assignment.assignmentId)}><i className={assignment.status} /><span><strong>{assignment.title}</strong><small>{assignment.roundName} · {assignment.status.replace("_", " ")}</small></span>{assignment.ownResponse?.weightedScore !== null && assignment.ownResponse?.weightedScore !== undefined ? <b>{assignment.ownResponse.weightedScore.toFixed(1)}</b> : null}</button>)}</aside>{selected ? <main className="rd-review-form"><div className="rd-panel-head"><div><span className="rd-kicker">{selected.roundName}{selected.track ? ` · ${selected.track}` : ""}</span><h2>{selected.title}</h2></div><span className="rd-badge">{selected.blind ? "Blind review" : "Author visible"}</span></div>{selected.blind ? <div className="rd-blind-note">Participant identity is hidden. Other reviewers’ scores and comments are never shown.</div> : <p className="rd-participants">{selected.participants?.map((participant) => `${participant.name} · ${participant.role.replace("_", "-")}`).join("; ")}</p>}<article className="rd-abstract"><h3>Proposal abstract</h3><p>{selected.abstract}</p></article><div className="rd-scorecard">{selected.scorecard.map((criterion) => <label className="rd-field" key={criterion.key}>{criterion.label}<small>{reviewerCriterionHelp(criterion)}</small>{criterion.type === "numeric" ? <input aria-label={`${criterion.label}, rating from ${criterion.min} to ${criterion.max}`} type="number" min={criterion.min} max={criterion.max} step="1" disabled={selected.status === "submitted" || selected.status === "recused"} value={typeof answers[criterion.key] === "number" ? String(answers[criterion.key]) : ""} onChange={(event) => setAnswers({ ...answers, [criterion.key]: event.target.value === "" ? undefined : Number(event.target.value) })} /> : criterion.type === "dropdown" ? <select disabled={selected.status === "submitted" || selected.status === "recused"} value={typeof answers[criterion.key] === "string" ? String(answers[criterion.key]) : ""} onChange={(event) => setAnswers({ ...answers, [criterion.key]: event.target.value })}><option value="">Choose…</option>{criterion.options.map((option) => <option key={option.label}>{option.label}</option>)}</select> : <textarea rows={4} disabled={selected.status === "submitted" || selected.status === "recused"} value={typeof answers[criterion.key] === "string" ? String(answers[criterion.key]) : ""} onChange={(event) => setAnswers({ ...answers, [criterion.key]: event.target.value })} />}</label>)}<label className="rd-field">Private review notes<small>Visible to organizers, never to other reviewers.</small><textarea rows={4} disabled={selected.status === "submitted" || selected.status === "recused"} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>{selected.status === "submitted" ? <div className="rd-finalized">Finalized {selected.ownResponse?.submittedAt ? new Date(selected.ownResponse.submittedAt).toLocaleString() : ""}. Ask an organizer to reopen this response if you need to make a correction.</div> : selected.status === "recused" ? <div className="rd-finalized">You recused from this proposal.</div> : <><div className="rd-review-actions"><button className="rd-secondary" disabled={busy} onClick={() => void save(false)}>Save draft</button><button className="primary-action" disabled={busy} onClick={() => void save(true)}>Finalize review</button></div><div className="rd-recusal"><label className="rd-field">Conflict or recusal reason<input value={recusalReason} onChange={(event) => setRecusalReason(event.target.value)} placeholder="Describe the conflict" /></label><button className="rd-link danger" disabled={busy || recusalReason.trim().length < 3} onClick={() => void recuse()}>Declare conflict and recuse</button></div></>}</main> : <main className="rd-review-form rd-empty"><h2>No assignment selected</h2></main>}</div></div>;
}
