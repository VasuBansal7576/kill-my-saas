import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { jsonRequest, reviewsRequest } from "./api";
import type { ReviewCriterion, ReviewsWorkspace } from "./types";
import "./reviews-decisions.css";
import "./scorecard-editor.css";

type Tab = "rounds" | "assignments" | "results" | "ai";
type DraftRound = {
  key: string;
  name: string;
  opensAt: string;
  closesAt: string;
  blindPolicy: "none" | "single_blind" | "double_blind";
  reviewerIds: string[];
  assignmentCap: number;
  scorecard: ReviewCriterion[];
};

export function ReviewsDecisionsPage() {
  const { eventSlug = "" } = useParams();
  const [workspace, setWorkspace] = useState<ReviewsWorkspace | null>(null);
  const [tab, setTab] = useState<Tab>("rounds");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [planName, setPlanName] = useState("Conference review plan");
  const [draftRounds, setDraftRounds] = useState<DraftRound[]>(() => defaultRounds());
  const [assignmentRoundId, setAssignmentRoundId] = useState("");
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [specificSubmissionId, setSpecificSubmissionId] = useState("");
  const [specificReviewerId, setSpecificReviewerId] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setWorkspace(await reviewsRequest<ReviewsWorkspace>(`/api/v1/organizer/events/${eventSlug}/evaluations`));
    } catch (caught) {
      setError(message(caught));
    }
  }, [eventSlug]);

  useEffect(() => { void reload(); }, [reload]);

  const rounds = useMemo(() => workspace?.plans.flatMap((plan) => plan.rounds) ?? [], [workspace]);
  useEffect(() => {
    if (!assignmentRoundId && rounds[0]) setAssignmentRoundId(rounds[0].id);
  }, [assignmentRoundId, rounds]);

  async function createPlan() {
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(`/api/v1/organizer/events/${eventSlug}/evaluations/plans`, jsonRequest("POST", {
        name: planName,
        rounds: draftRounds.map((round) => ({
          name: round.name,
          opensAt: new Date(round.opensAt).toISOString(),
          closesAt: new Date(round.closesAt).toISOString(),
          blindPolicy: round.blindPolicy,
          scorecard: round.scorecard,
          reviewers: round.reviewerIds.map((personId) => ({ personId, assignmentCap: round.assignmentCap || null })),
        })),
      }));
      setShowPlan(false);
      setNotice("Review plan persisted with independent round pools and scorecards.");
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function distribute() {
    if (!assignmentRoundId || selectedSubmissions.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await reviewsRequest<{ created: number }>(
        `/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${assignmentRoundId}/distribute`,
        jsonRequest("POST", { submissionIds: selectedSubmissions }),
      );
      setSelectedSubmissions([]);
      setNotice(`${result.created} conflict-aware assignments persisted.`);
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function assignSpecificReviewer() {
    if (!assignmentRoundId || !specificSubmissionId || !specificReviewerId) return;
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(`/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${assignmentRoundId}/assignments`, jsonRequest("POST", {
        submissionId: specificSubmissionId,
        reviewerPersonId: specificReviewerId,
      }));
      setNotice("Specific reviewer assignment persisted after pool, cap, and conflict checks.");
      setSpecificSubmissionId("");
      setSpecificReviewerId("");
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function decide(submissionId: string, outcome: "accepted" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(`/api/v1/organizer/events/${eventSlug}/evaluations/decisions`, jsonRequest("POST", {
        submissionId,
        outcome,
        reason: decisionReason,
        idempotencyKey: crypto.randomUUID(),
      }));
      setDecisionTarget(null);
      setDecisionReason("");
      setNotice(outcome === "accepted"
        ? "Accepted decision and canonical Program handoff completed atomically."
        : "Rejected decision recorded in the audit trail.");
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function runAi(roundId: string, submissionId: string) {
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(`/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${roundId}/submissions/${submissionId}/ai-assessments`, { method: "POST" });
      setNotice("Workers AI assessment persisted with score and written reasoning.");
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function overrideAi(assessmentId: string, score: number, reason: string) {
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(`/api/v1/organizer/events/${eventSlug}/evaluations/ai-assessments/${assessmentId}/override`, jsonRequest("POST", { score, reason }));
      setNotice("Human override persisted separately from the provider assessment.");
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remindOutstanding(roundId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await reviewsRequest<{ recipientCount: number }>(`/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${roundId}/reminders`, jsonRequest("POST", { idempotencyKey: crypto.randomUUID() }));
      setNotice(`Reviewer reminder queued for ${result.recipientCount} people with outstanding assignments.`);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) return <p className="rd-loading">{error ?? "Loading evaluations…"}</p>;
  const outstanding = rounds.reduce((sum, round) => sum + Math.max(0, round.progress.assigned - round.progress.submitted - round.progress.recused), 0);

  return (
    <div className="rd-workspace">
      <div className="page-head rd-head">
        <div><p className="eyebrow">Evaluations</p><h1>Review plans</h1><p>Independent rounds, isolated reviewer queues, weighted results, and authoritative decisions.</p></div>
        <div className="rd-actions"><a className="rd-secondary" href={`/api/v1/organizer/events/${eventSlug}/evaluations/results.csv`}>Export scores</a><button className="primary-action" onClick={() => setShowPlan(true)}>New review plan</button></div>
      </div>
      {error ? <div className="rd-alert error" role="alert">{error}</div> : null}
      {notice ? <div className="rd-alert success" role="status">{notice}</div> : null}
      <div className="rd-summary">
        <Metric label="Review rounds" value={rounds.length} note={`${workspace.reviewers.length} eligible reviewers`} />
        <Metric label="Assigned reviews" value={rounds.reduce((sum, round) => sum + round.progress.assigned, 0)} note={`${outstanding} outstanding`} />
        <Metric label="Reviewed proposals" value={workspace.results.filter((row) => row.submitted > 0).length} note="Aggregates update on finalization" />
        <Metric label="Decisions" value={workspace.results.filter((row) => row.decision).length} note="Decision is the sole authority" />
      </div>
      <div className="rd-tabs" role="tablist">
        {(["rounds", "assignments", "results", "ai"] as const).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value === "ai" ? "AI advice" : capitalize(value)}</button>)}
      </div>

      {tab === "rounds" ? <RoundsPanel plans={workspace.plans} busy={busy} remind={(roundId) => void remindOutstanding(roundId)} /> : null}
      {tab === "assignments" ? (
        <section className="rd-panel">
          <div className="rd-panel-head"><div><h2>Conflict-aware distribution</h2><p>Every proposal is assigned only to a reviewer in this round’s pool with capacity and no declared conflict.</p></div><button className="primary-action" disabled={busy || !assignmentRoundId || selectedSubmissions.length === 0} onClick={() => void distribute()}>Assign selected</button></div>
          <label className="rd-field">Review round<select value={assignmentRoundId} onChange={(event) => setAssignmentRoundId(event.target.value)}>{rounds.map((round) => <option key={round.id} value={round.id}>{round.name} · {round.reviewers.length} reviewers</option>)}</select></label>
          <div className="rd-specific-assignment"><label className="rd-field">Proposal<select value={specificSubmissionId} onChange={(event) => setSpecificSubmissionId(event.target.value)}><option value="">Choose proposal…</option>{workspace.submissions.map((submission) => <option key={submission.submissionId} value={submission.submissionId}>{submission.title}</option>)}</select></label><label className="rd-field">Specific reviewer<select value={specificReviewerId} onChange={(event) => setSpecificReviewerId(event.target.value)}><option value="">Choose reviewer…</option>{rounds.find((round) => round.id === assignmentRoundId)?.reviewers.map((reviewer) => <option key={reviewer.personId} value={reviewer.personId}>{reviewer.name}</option>)}</select></label><button className="rd-secondary" disabled={busy || !specificSubmissionId || !specificReviewerId} onClick={() => void assignSpecificReviewer()}>Assign reviewer</button></div>
          <div className="rd-check-list">{workspace.submissions.map((submission) => <label key={submission.submissionId}><input type="checkbox" checked={selectedSubmissions.includes(submission.submissionId)} onChange={() => setSelectedSubmissions(toggle(selectedSubmissions, submission.submissionId))} /><span><strong>{submission.title}</strong><small>{submission.track ?? "No track"}</small></span></label>)}</div>
        </section>
      ) : null}
      {tab === "results" ? (
        <section className="rd-panel">
          <div className="rd-panel-head"><div><h2>Aggregate results</h2><p>Finalized responses only. Author/co-presenter attribution remains visible to organizers.</p></div><span className="rd-badge">Sorted by score</span></div>
          <div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>Proposal</th><th>Progress</th><th>Aggregate</th><th>Decision</th><th /></tr></thead><tbody>{workspace.results.map((row) => <tr key={row.submissionId}><td><strong>{row.title}</strong><small>{row.participants.map((participant) => `${participant.name} · ${participant.role.replace("_", "-")}`).join("; ")}</small></td><td>{row.submitted}/{row.assigned}{row.recused ? <small>{row.recused} recused</small> : null}</td><td><strong>{row.aggregateScore?.toFixed(2) ?? "—"}</strong></td><td><span className={`rd-badge ${row.decision ?? "pending"}`}>{row.decision ?? "Undecided"}</span></td><td><button className="rd-link" onClick={() => setDecisionTarget(row.submissionId)}>Record decision</button></td></tr>)}</tbody></table></div>
        </section>
      ) : null}
      {tab === "ai" ? (
        <section className="rd-panel">
          <div className="rd-panel-head"><div><h2>First-pass AI advice</h2><p>Workers AI advice is separate from human reviews and decisions. Provider failures are visible and never replaced with generated demo data.</p></div><span className="rd-badge">Advisory only</span></div>
          {workspace.results.map((result) => {
            const assessment = workspace.aiAssessments.find((candidate) => candidate.submissionId === result.submissionId);
            return <AiAssessmentRow key={result.submissionId} title={result.title} assessment={assessment} busy={busy} run={() => rounds[0] && void runAi(rounds[0].id, result.submissionId)} override={(score, reason) => assessment && void overrideAi(assessment.id, score, reason)} />;
          })}
        </section>
      ) : null}

      {showPlan ? <PlanDialog reviewers={workspace.reviewers} planName={planName} setPlanName={setPlanName} rounds={draftRounds} setRounds={setDraftRounds} busy={busy} close={() => setShowPlan(false)} save={() => void createPlan()} /> : null}
      {decisionTarget ? <DecisionDialog title={workspace.results.find((row) => row.submissionId === decisionTarget)?.title ?? "Proposal"} reason={decisionReason} setReason={setDecisionReason} busy={busy} close={() => setDecisionTarget(null)} decide={(outcome) => void decide(decisionTarget, outcome)} /> : null}
    </div>
  );
}

function AiAssessmentRow(props: {
  title: string;
  assessment: ReviewsWorkspace["aiAssessments"][number] | undefined;
  busy: boolean;
  run(): void;
  override(score: number, reason: string): void;
}) {
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  return <article className="rd-ai-row"><div><strong>{props.title}</strong>{props.assessment ? <><p>{props.assessment.reasoning ?? props.assessment.failureCode ?? "Provider assessment failed."}</p><small>{props.assessment.model} · score {props.assessment.score?.toFixed(1) ?? "failed"}{props.assessment.humanOverrideScore !== null ? ` · human override ${props.assessment.humanOverrideScore.toFixed(1)}` : ""}</small><div className="rd-ai-override"><input aria-label="Human override score" type="number" min="0" max="100" placeholder="Override score" value={score} onChange={(event) => setScore(event.target.value)} /><input aria-label="Human override reason" placeholder="Reason for override" value={reason} onChange={(event) => setReason(event.target.value)} /><button className="rd-link" disabled={props.busy || !score || reason.trim().length < 3} onClick={() => props.override(Number(score), reason)}>Save override</button></div></> : <small>No provider assessment has been run.</small>}</div><button className="rd-secondary" disabled={props.busy} onClick={props.run}>{props.assessment ? "Run again" : "Run Workers AI"}</button></article>;
}

function RoundsPanel({ plans, busy, remind }: { plans: ReviewsWorkspace["plans"]; busy: boolean; remind(roundId: string): void }) {
  if (plans.length === 0) return <section className="rd-panel rd-empty"><h2>No review plan yet</h2><p>Create at least two rounds with independent reviewer pools and scorecards.</p></section>;
  return <div className="rd-round-grid">{plans.flatMap((plan) => plan.rounds.map((round, index) => <article className="rd-round-card" key={round.id}><div className="rd-panel-head"><div><span className="rd-kicker">{plan.name} · round {index + 1}</span><h2>{round.name}</h2></div><span className="rd-badge">{round.blindPolicy.replace("_", " ")}</span></div><p>{formatDate(round.opensAt)} → {formatDate(round.closesAt)}</p><div className="rd-progress"><i style={{ width: `${round.progress.percentComplete}%` }} /></div><div className="rd-progress-copy"><strong>{round.progress.submitted}/{round.progress.assigned} complete</strong><span>{round.progress.percentComplete}%</span></div><div className="rd-criteria">{round.scorecard.map((criterion) => <div key={criterion.key}><span>{criterion.label}</span><small>{criterion.type.replace("_", " ")} · {criterion.weight}%</small></div>)}</div><footer>{round.reviewers.map((reviewer) => <span className="rd-chip" key={reviewer.personId}>{reviewer.name} · {reviewer.submitted}/{reviewer.assigned} ({reviewer.percentComplete}%){reviewer.assignmentCap ? ` · cap ${reviewer.assignmentCap}` : ""}</span>)}<button className="rd-link" disabled={busy || round.progress.assigned - round.progress.submitted - round.progress.recused <= 0} onClick={() => remind(round.id)}>Remind outstanding</button></footer></article>))}</div>;
}

function PlanDialog(props: { reviewers: ReviewsWorkspace["reviewers"]; planName: string; setPlanName(value: string): void; rounds: DraftRound[]; setRounds(value: DraftRound[]): void; busy: boolean; close(): void; save(): void }) {
  function updateRound(index: number, patch: Partial<DraftRound>) { props.setRounds(props.rounds.map((round, candidate) => candidate === index ? { ...round, ...patch } : round)); }
  function updateCriterion(roundIndex: number, criterionIndex: number, criterion: ReviewCriterion) {
    const round = props.rounds[roundIndex];
    if (!round) return;
    updateRound(roundIndex, { scorecard: round.scorecard.map((current, index) => index === criterionIndex ? criterion : current) });
  }
  function addCriterion(roundIndex: number, type: ReviewCriterion["type"]) {
    const round = props.rounds[roundIndex];
    if (!round) return;
    updateRound(roundIndex, { scorecard: [...round.scorecard, criterionFor(type)] });
  }
  return <div className="rd-modal-backdrop"><section className="rd-modal" role="dialog" aria-modal="true" aria-labelledby="plan-title">
    <div className="rd-panel-head"><div><span className="rd-kicker">Evaluation configuration</span><h2 id="plan-title">New review plan</h2></div><button className="rd-close" onClick={props.close}>×</button></div>
    <label className="rd-field">Plan name<input value={props.planName} onChange={(event) => props.setPlanName(event.target.value)} /></label>
    <div className="rd-round-editor">{props.rounds.map((round, roundIndex) => <fieldset key={round.key}>
      <legend>Round {roundIndex + 1}</legend>
      <div className="rd-form-grid">
        <label className="rd-field wide">Name<input value={round.name} onChange={(event) => updateRound(roundIndex, { name: event.target.value })} /></label>
        <label className="rd-field">Opens<input type="datetime-local" value={round.opensAt} onChange={(event) => updateRound(roundIndex, { opensAt: event.target.value })} /></label>
        <label className="rd-field">Closes<input type="datetime-local" value={round.closesAt} onChange={(event) => updateRound(roundIndex, { closesAt: event.target.value })} /></label>
        <label className="rd-field">Anonymization<select value={round.blindPolicy} onChange={(event) => updateRound(roundIndex, { blindPolicy: event.target.value as DraftRound["blindPolicy"] })}><option value="double_blind">Blind review</option><option value="single_blind">Author hidden</option><option value="none">Author visible</option></select></label>
        <label className="rd-field">Per-reviewer cap<input type="number" min="1" value={round.assignmentCap} onChange={(event) => updateRound(roundIndex, { assignmentCap: Number(event.target.value) })} /></label>
      </div>
      <div className="rd-pool"><strong>Reviewer pool</strong>{props.reviewers.map((reviewer) => <label key={reviewer.personId}><input type="checkbox" checked={round.reviewerIds.includes(reviewer.personId)} onChange={() => updateRound(roundIndex, { reviewerIds: toggle(round.reviewerIds, reviewer.personId) })} />{reviewer.name}</label>)}</div>
      <div className="rd-scorecard-editor"><strong>Scorecard</strong>{round.scorecard.map((criterion, criterionIndex) => <div key={criterion.key}>
        <label className="rd-field">Label<input value={criterion.label} onChange={(event) => updateCriterion(roundIndex, criterionIndex, { ...criterion, label: event.target.value })} /></label>
        <label className="rd-field">Type<select value={criterion.type} onChange={(event) => updateCriterion(roundIndex, criterionIndex, criterionFor(event.target.value as ReviewCriterion["type"], criterion.key, criterion.label))}><option value="numeric">Numeric rating</option><option value="dropdown">Dropdown</option><option value="free_text">Free text</option></select></label>
        <label className="rd-field">Weight<input type="number" min="0" max="100" disabled={criterion.type === "free_text"} value={criterion.weight} onChange={(event) => updateCriterion(roundIndex, criterionIndex, { ...criterion, weight: Number(event.target.value) } as ReviewCriterion)} /></label>
        <button className="rd-link danger" onClick={() => updateRound(roundIndex, { scorecard: round.scorecard.filter((_, index) => index !== criterionIndex) })}>Remove</button>
      </div>)}<footer><button className="rd-link" onClick={() => addCriterion(roundIndex, "numeric")}>+ Numeric</button><button className="rd-link" onClick={() => addCriterion(roundIndex, "dropdown")}>+ Dropdown</button><button className="rd-link" onClick={() => addCriterion(roundIndex, "free_text")}>+ Free text</button></footer></div>
    </fieldset>)}</div>
    <button className="rd-link" onClick={() => props.setRounds([...props.rounds, newRound(`Round ${props.rounds.length + 1}`, props.rounds.length + 1)])}>+ Add round</button>
    <footer className="rd-modal-actions"><button className="rd-secondary" onClick={props.close}>Cancel</button><button className="primary-action" disabled={props.busy || props.rounds.some((round) => round.reviewerIds.length === 0 || round.scorecard.length === 0)} onClick={props.save}>{props.busy ? "Saving…" : "Save review plan"}</button></footer>
  </section></div>;
}

function DecisionDialog(props: { title: string; reason: string; setReason(value: string): void; busy: boolean; close(): void; decide(outcome: "accepted" | "rejected"): void }) {
  return <div className="rd-modal-backdrop"><section className="rd-modal rd-decision" role="dialog" aria-modal="true"><div className="rd-panel-head"><div><span className="rd-kicker">Authoritative outcome</span><h2>{props.title}</h2></div><button className="rd-close" onClick={props.close}>×</button></div><p>Acceptance runs through the atomic Program handoff. Rejection is recorded locally with an audit event.</p><label className="rd-field">Decision reasoning<textarea rows={5} value={props.reason} onChange={(event) => props.setReason(event.target.value)} /></label><footer className="rd-modal-actions"><button className="rd-secondary danger" disabled={props.busy || props.reason.trim().length < 3} onClick={() => props.decide("rejected")}>Reject</button><button className="primary-action" disabled={props.busy || props.reason.trim().length < 3} onClick={() => props.decide("accepted")}>Accept & hand off</button></footer></section></div>;
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value]; }
function capitalize(value: string) { return value[0]?.toUpperCase() + value.slice(1); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function message(error: unknown) { return error instanceof Error ? error.message : "The evaluation operation failed."; }

function defaultRounds(): DraftRound[] { return [newRound("Eligibility & fit", 1), newRound("Program committee", 2)]; }
function newRound(name: string, offset: number): DraftRound {
  const opens = new Date(Date.now() + offset * 86_400_000);
  const closes = new Date(opens.valueOf() + 7 * 86_400_000);
  return {
    key: crypto.randomUUID(), name, opensAt: localDateTime(opens), closesAt: localDateTime(closes), blindPolicy: "double_blind", reviewerIds: [], assignmentCap: 12,
    scorecard: [
      { key: `technical_depth_${offset}`, label: "Technical depth", type: "numeric", required: true, weight: 50, min: 1, max: 10 },
      { key: `audience_value_${offset}`, label: "Audience value", type: "dropdown", required: true, weight: 50, options: [{ label: "Limited", score: 20 }, { label: "Good", score: 70 }, { label: "Excellent", score: 100 }] },
      { key: `reviewer_note_${offset}`, label: "Reviewer note", type: "free_text", required: true, weight: 0 },
    ],
  };
}
function localDateTime(value: Date) { const local = new Date(value.valueOf() - value.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function criterionFor(type: ReviewCriterion["type"], key = `criterion_${crypto.randomUUID()}`, label = "New criterion"): ReviewCriterion {
  if (type === "numeric") return { key, label, type, required: true, weight: 50, min: 1, max: 10 };
  if (type === "dropdown") return { key, label, type, required: true, weight: 50, options: [{ label: "Limited", score: 20 }, { label: "Good", score: 70 }, { label: "Excellent", score: 100 }] };
  return { key, label, type, required: true, weight: 0 };
}
