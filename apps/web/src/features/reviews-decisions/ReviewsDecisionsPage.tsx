import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AccessibleDialog } from "../../app/AccessibleDialog";
import {
  eventDateTimeInputValue,
  eventLocalDateTimeToIso,
  formatEventDateTime,
} from "../../app/event-time";
import { jsonRequest, reviewsRequest } from "./api";
import { reviewCriterionSummary } from "./presentation";
import type { ReviewCriterion, ReviewsWorkspace } from "./types";
import "./reviews-decisions.css";
import "./scorecard-editor.css";

type Tab = "rounds" | "assignments" | "results" | "ai";
type ResultSort = "none" | "desc" | "asc";
type DraftRound = {
  key: string;
  name: string;
  opensAt: string;
  closesAt: string;
  blindPolicy: "none" | "single_blind" | "double_blind";
  routingKeys: string[];
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
  const [draftRounds, setDraftRounds] = useState<DraftRound[]>(() =>
    defaultRounds("UTC"),
  );
  const [assignmentRoundId, setAssignmentRoundId] = useState("");
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [specificSubmissionId, setSpecificSubmissionId] = useState("");
  const [specificReviewerId, setSpecificReviewerId] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [resultSort, setResultSort] = useState<ResultSort>("none");

  const reload = useCallback(async () => {
    try {
      setError(null);
      setWorkspace(
        await reviewsRequest<ReviewsWorkspace>(
          `/api/v1/organizer/events/${eventSlug}/evaluations`,
        ),
      );
    } catch (caught) {
      setError(message(caught));
    }
  }, [eventSlug]);

  useEffect(() => {
    let active = true;
    void reviewsRequest<ReviewsWorkspace>(
      `/api/v1/organizer/events/${eventSlug}/evaluations`,
    )
      .then((next) => {
        if (!active) return;
        setWorkspace(next);
        setDraftRounds((current) =>
          current.every((round) => round.reviewerIds.length === 0)
            ? defaultRounds(next.event.timezone)
            : current,
        );
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(message(caught));
      });
    return () => {
      active = false;
    };
  }, [eventSlug]);

  const rounds = useMemo(
    () => workspace?.plans.flatMap((plan) => plan.rounds) ?? [],
    [workspace],
  );
  const activeAssignmentRoundId = assignmentRoundId || rounds[0]?.id || "";
  const activeRound = rounds.find(
    (round) => round.id === activeAssignmentRoundId,
  );
  const assignmentSubmissions =
    workspace?.submissions.filter(
      (submission) =>
        !activeRound?.routingKeys.length ||
        (submission.routingKey !== null &&
          activeRound.routingKeys.includes(submission.routingKey)),
    ) ?? [];
  const sortedResults = useMemo(() => {
    const results = [...(workspace?.results ?? [])];
    if (resultSort === "none") return results;
    return results.sort((left, right) => {
      const leftScore = left.aggregateScore ?? Number.NEGATIVE_INFINITY;
      const rightScore = right.aggregateScore ?? Number.NEGATIVE_INFINITY;
      return resultSort === "desc"
        ? rightScore - leftScore
        : leftScore - rightScore;
    });
  }, [resultSort, workspace]);

  async function createPlan() {
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(
        `/api/v1/organizer/events/${eventSlug}/evaluations/plans`,
        jsonRequest("POST", {
          name: planName,
          rounds: draftRounds.map((round) => ({
            name: round.name,
            opensAt: eventLocalDateTimeToIso(
              round.opensAt,
              workspace?.event.timezone ?? "UTC",
            ),
            closesAt: eventLocalDateTimeToIso(
              round.closesAt,
              workspace?.event.timezone ?? "UTC",
            ),
            blindPolicy: round.blindPolicy,
            routingKeys: round.routingKeys,
            scorecard: round.scorecard,
            reviewers: round.reviewerIds.map((personId) => ({
              personId,
              assignmentCap: round.assignmentCap || null,
            })),
          })),
        }),
      );
      setShowPlan(false);
      setNotice(
        "Review plan saved with separate reviewers and questions for each round.",
      );
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function distribute() {
    if (!activeAssignmentRoundId || selectedSubmissions.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await reviewsRequest<{ created: number }>(
        `/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${activeAssignmentRoundId}/distribute`,
        jsonRequest("POST", { submissionIds: selectedSubmissions }),
      );
      setSelectedSubmissions([]);
      setNotice(
        `${result.created} review assignment${result.created === 1 ? "" : "s"} created.`,
      );
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function assignSpecificReviewer() {
    if (
      !activeAssignmentRoundId ||
      !specificSubmissionId ||
      !specificReviewerId
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(
        `/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${activeAssignmentRoundId}/assignments`,
        jsonRequest("POST", {
          submissionId: specificSubmissionId,
          reviewerPersonId: specificReviewerId,
        }),
      );
      setNotice("Proposal assigned to the selected reviewer.");
      setSpecificSubmissionId("");
      setSpecificReviewerId("");
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    submissionId: string,
    outcome: "accepted" | "rejected",
  ) {
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(
        `/api/v1/organizer/events/${eventSlug}/evaluations/decisions`,
        jsonRequest("POST", {
          submissionId,
          outcome,
          reason: decisionReason,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      setDecisionTarget(null);
      setDecisionReason("");
      setNotice(
        outcome === "accepted"
          ? "Proposal accepted privately. Its linked Session is ready; review the staged message in Submissions before release."
          : "Proposal rejected privately. Review the staged message in Submissions before release.",
      );
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
      await reviewsRequest(
        `/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${roundId}/submissions/${submissionId}/ai-assessments`,
        { method: "POST" },
      );
      setNotice("AI advice saved with its score and explanation.");
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function overrideAi(
    assessmentId: string,
    score: number,
    reason: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      await reviewsRequest(
        `/api/v1/organizer/events/${eventSlug}/evaluations/ai-assessments/${assessmentId}/override`,
        jsonRequest("POST", { score, reason }),
      );
      setNotice(
        "Organizer score and reason saved separately from the AI advice.",
      );
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
      const result = await reviewsRequest<{ recipientCount: number }>(
        `/api/v1/organizer/events/${eventSlug}/evaluations/rounds/${roundId}/reminders`,
        jsonRequest("POST", { idempotencyKey: crypto.randomUUID() }),
      );
      setNotice(
        `Reviewer reminder queued for ${result.recipientCount} people with outstanding assignments.`,
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!workspace)
    return <p className="rd-loading">{error ?? "Loading evaluations…"}</p>;
  const outstanding = rounds.reduce(
    (sum, round) =>
      sum +
      Math.max(
        0,
        round.progress.assigned -
          round.progress.submitted -
          round.progress.recused,
      ),
    0,
  );

  return (
    <div className="rd-workspace">
      <div className="page-head rd-head">
        <div>
          <p className="eyebrow">Evaluations</p>
          <h1>Review plans</h1>
          <p>
            Independent rounds, private reviewer queues, weighted results, and
            final program decisions.
          </p>
        </div>
        <div className="rd-actions">
          <a
            className="rd-secondary"
            href={`/api/v1/organizer/events/${eventSlug}/evaluations/results.csv`}
          >
            Export scores
          </a>
          <button className="primary-action" onClick={() => setShowPlan(true)}>
            New review plan
          </button>
        </div>
      </div>
      {error ? (
        <div className="rd-alert error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rd-alert success" role="status">
          {notice}
        </div>
      ) : null}
      <div className="rd-summary">
        <Metric
          label="Review rounds"
          value={rounds.length}
          note={`${workspace.reviewers.length} eligible reviewers`}
        />
        <Metric
          label="Assigned reviews"
          value={rounds.reduce(
            (sum, round) => sum + round.progress.assigned,
            0,
          )}
          note={`${outstanding} outstanding`}
        />
        <Metric
          label="Reviewed proposals"
          value={workspace.results.filter((row) => row.submitted > 0).length}
          note="Aggregates update on finalization"
        />
        <Metric
          label="Decisions"
          value={workspace.results.filter((row) => row.decision).length}
          note="Current program outcomes"
        />
      </div>
      <div className="rd-tabs" role="tablist" aria-label="Evaluation workspace" onKeyDown={(event) => {
        if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
        event.preventDefault();
        const tabs: Tab[] = ["rounds", "assignments", "results", "ai"];
        const current = tabs.indexOf(tab);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (current + 1) % tabs.length : (current - 1 + tabs.length) % tabs.length;
        const nextTab = tabs[next]!;
        setTab(nextTab);
        requestAnimationFrame(() => document.getElementById(`evaluation-tab-${nextTab}`)?.focus());
      }}>
        {(["rounds", "assignments", "results", "ai"] as const).map((value) => (
          <button
            key={value}
            id={`evaluation-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`evaluation-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {value === "ai" ? "AI advice" : capitalize(value)}
          </button>
        ))}
      </div>

      {tab === "rounds" ? (
        <div id="evaluation-panel-rounds" role="tabpanel" aria-labelledby="evaluation-tab-rounds">
          <RoundsPanel
            eventSlug={eventSlug}
            timezone={workspace.event.timezone}
            plans={workspace.plans}
            busy={busy}
            remind={(roundId) => void remindOutstanding(roundId)}
          />
        </div>
      ) : null}
      {tab === "assignments" ? (
        <section id="evaluation-panel-assignments" role="tabpanel" aria-labelledby="evaluation-tab-assignments" className="rd-panel">
          <div className="rd-panel-head">
            <div>
              <h2>Conflict-aware distribution</h2>
              <p>
                Every proposal is assigned only to a reviewer in this round’s
                pool with capacity and no declared conflict.
              </p>
            </div>
            <button
              className="primary-action"
              disabled={
                busy ||
                !activeAssignmentRoundId ||
                selectedSubmissions.length === 0
              }
              onClick={() => void distribute()}
            >
              Assign selected
            </button>
          </div>
          <label className="rd-field">
            Review round
            <select
              value={activeAssignmentRoundId}
              onChange={(event) => {
                setAssignmentRoundId(event.target.value);
                setSelectedSubmissions([]);
                setSpecificSubmissionId("");
              }}
            >
              {rounds.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.name} · {round.reviewers.length} reviewers
                </option>
              ))}
            </select>
          </label>
          <div className="rd-specific-assignment">
            <label className="rd-field">
              Proposal
              <select
                value={specificSubmissionId}
                onChange={(event) =>
                  setSpecificSubmissionId(event.target.value)
                }
              >
                <option value="">Choose proposal…</option>
                {assignmentSubmissions.map((submission) => (
                  <option
                    key={submission.submissionId}
                    value={submission.submissionId}
                  >
                    {submission.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="rd-field">
              Specific reviewer
              <select
                value={specificReviewerId}
                onChange={(event) => setSpecificReviewerId(event.target.value)}
              >
                <option value="">Choose reviewer…</option>
                {activeRound?.reviewers.map((reviewer) => (
                  <option key={reviewer.personId} value={reviewer.personId}>
                    {reviewer.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rd-secondary"
              disabled={busy || !specificSubmissionId || !specificReviewerId}
              onClick={() => void assignSpecificReviewer()}
            >
              Assign reviewer
            </button>
          </div>
          <p className="rd-routing-note">
            {activeRound?.routingKeys.length
              ? `Pool routes: ${activeRound.routingKeys.join(", ")}`
              : "Pool accepts every submission route."}
          </p>
          <div className="rd-check-list">
            {assignmentSubmissions.map((submission) => (
              <label key={submission.submissionId}>
                <input
                  type="checkbox"
                  checked={selectedSubmissions.includes(
                    submission.submissionId,
                  )}
                  onChange={() =>
                    setSelectedSubmissions(
                      toggle(selectedSubmissions, submission.submissionId),
                    )
                  }
                />
                <span>
                  <strong>{submission.title}</strong>
                  <small>
                    {submission.routingKey ??
                      submission.track ??
                      "General queue"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}
      {tab === "results" ? (
        <section id="evaluation-panel-results" role="tabpanel" aria-labelledby="evaluation-tab-results" className="rd-panel">
          <div className="rd-panel-head">
            <div>
              <h2>Aggregate results</h2>
              <p>
                Finalized responses only. Author/co-presenter attribution
                remains visible to organizers.
              </p>
            </div>
            <span className="rd-badge">
              {resultSort === "none"
                ? "Original order"
                : `${resultSort === "desc" ? "Highest" : "Lowest"} score first`}
            </span>
          </div>
          <div className="rd-table-wrap">
            <table className="rd-table">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Progress</th>
                  <th>
                    <button
                      className="rd-link"
                      type="button"
                      onClick={() =>
                        setResultSort(resultSort === "desc" ? "asc" : "desc")
                      }
                      aria-label={`Sort aggregate score ${resultSort === "desc" ? "ascending" : "descending"}`}
                    >
                      Aggregate{" "}
                      {resultSort === "desc"
                        ? "↓"
                        : resultSort === "asc"
                          ? "↑"
                          : "↕"}
                    </button>
                  </th>
                  <th>Decision</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row) => (
                  <tr key={row.submissionId}>
                    <td>
                      <strong>{row.title}</strong>
                      <small>
                        {row.participants
                          .map(
                            (participant) =>
                              `${participant.name} · ${participant.role.replace("_", "-")}`,
                          )
                          .join("; ")}
                      </small>
                    </td>
                    <td>
                      {row.submitted}/{row.assigned}
                      {row.recused ? (
                        <small>{row.recused} recused</small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{row.aggregateScore?.toFixed(2) ?? "—"}</strong>
                    </td>
                    <td>
                      <span className={`rd-badge ${row.decision ?? "pending"}`}>
                        {row.decision ?? "Undecided"}
                      </span>
                      {row.decision ? <small>{row.decisionReleasedAt ? "Released" : "Private"}</small> : null}
                      {row.acceptedSession ? <small><a className="rd-link" href={`/organizer/events/${eventSlug}/agenda#session-${row.acceptedSession.id}`}>Session: {row.acceptedSession.title}</a></small> : null}
                    </td>
                    <td>
                      {row.decision ? <a className="rd-link" href={`/organizer/events/${eventSlug}/submissions`}>Review release / change</a> : <button
                        className="rd-link"
                        onClick={() => setDecisionTarget(row.submissionId)}
                      >
                        Record decision
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {tab === "ai" ? (
        <section id="evaluation-panel-ai" role="tabpanel" aria-labelledby="evaluation-tab-ai" className="rd-panel">
          <div className="rd-panel-head">
            <div>
              <h2>First-pass AI advice</h2>
              <p>
                First-pass advice is separate from human reviews and decisions.
                If the service is unavailable, the problem is shown here and
                human review continues normally.
              </p>
            </div>
            <span className="rd-badge">Advisory only</span>
          </div>
          {workspace.results.map((result) => {
            const assessment = workspace.aiAssessments.find(
              (candidate) => candidate.submissionId === result.submissionId,
            );
            return (
              <AiAssessmentRow
                key={result.submissionId}
                title={result.title}
                assessment={assessment}
                busy={busy}
                run={() =>
                  rounds[0] && void runAi(rounds[0].id, result.submissionId)
                }
                override={(score, reason) =>
                  assessment && void overrideAi(assessment.id, score, reason)
                }
              />
            );
          })}
        </section>
      ) : null}

      {showPlan ? (
        <PlanDialog
          timezone={workspace.event.timezone}
          reviewers={workspace.reviewers}
          planName={planName}
          setPlanName={setPlanName}
          rounds={draftRounds}
          setRounds={setDraftRounds}
          busy={busy}
          close={() => setShowPlan(false)}
          save={() => void createPlan()}
        />
      ) : null}
      {decisionTarget ? (
        <DecisionDialog
          title={
            workspace.results.find((row) => row.submissionId === decisionTarget)
              ?.title ?? "Proposal"
          }
          currentDecision={
            workspace.results.find((row) => row.submissionId === decisionTarget)
              ?.decision ?? null
          }
          reason={decisionReason}
          setReason={setDecisionReason}
          busy={busy}
          close={() => setDecisionTarget(null)}
          decide={(outcome) => void decide(decisionTarget, outcome)}
        />
      ) : null}
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
  return (
    <article className="rd-ai-row">
      <div>
        <strong>{props.title}</strong>
        {props.assessment ? (
          <>
            <p>
              {props.assessment.reasoning ??
                props.assessment.failureCode ??
                "Provider assessment failed."}
            </p>
            <small>
              {props.assessment.model} · score{" "}
              {props.assessment.score?.toFixed(1) ?? "failed"}
              {props.assessment.humanOverrideScore !== null
                ? ` · human override ${props.assessment.humanOverrideScore.toFixed(1)}`
                : ""}
            </small>
            <div className="rd-ai-override">
              <input
                aria-label="Human override score"
                type="number"
                min="0"
                max="100"
                placeholder="Override score"
                value={score}
                onChange={(event) => setScore(event.target.value)}
              />
              <input
                aria-label="Human override reason"
                placeholder="Reason for override"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button
                className="rd-link"
                disabled={props.busy || !score || reason.trim().length < 3}
                onClick={() => props.override(Number(score), reason)}
              >
                Save override
              </button>
            </div>
          </>
        ) : (
          <small>No AI advice has been requested yet.</small>
        )}
      </div>
      <button
        className="rd-secondary"
        disabled={props.busy}
        onClick={props.run}
      >
        {props.assessment ? "Run again" : "Run Workers AI"}
      </button>
    </article>
  );
}

function RoundsPanel({
  eventSlug,
  timezone,
  plans,
  busy,
  remind,
}: {
  eventSlug: string;
  timezone: string;
  plans: ReviewsWorkspace["plans"];
  busy: boolean;
  remind(roundId: string): void;
}) {
  if (plans.length === 0)
    return (
      <section className="rd-panel rd-empty">
        <h2>No review plan yet</h2>
        <p>
          Create at least two rounds with independent reviewer pools and
          scorecards.
        </p>
      </section>
    );
  const reviewerNext = `/reviewer/events/${eventSlug}/reviews`;
  const reviewerSignup = `/login?mode=signup&event=${encodeURIComponent(eventSlug)}&next=${encodeURIComponent(reviewerNext)}`;
  return (
    <div className="rd-round-grid">
      {plans.flatMap((plan) =>
        plan.rounds.map((round, index) => (
          <article className="rd-round-card" key={round.id}>
            <div className="rd-panel-head">
              <div>
                <span className="rd-kicker">
                  {plan.name} · round {index + 1}
                </span>
                <h2>{round.name}</h2>
              </div>
              <span className="rd-badge">
                {round.blindPolicy.replace("_", " ")}
              </span>
            </div>
            <p>
              {formatEventDateTime(round.opensAt, timezone)} →{" "}
              {formatEventDateTime(round.closesAt, timezone)}
            </p>
            <p className="rd-routing-note">
              {round.routingKeys.length
                ? `Proposal groups: ${round.routingKeys.join(", ")}`
                : "All proposals are included"}
            </p>
            <div className="rd-progress">
              <i style={{ width: `${round.progress.percentComplete}%` }} />
            </div>
            <div className="rd-progress-copy">
              <strong>
                {round.progress.submitted}/{round.progress.assigned} complete
              </strong>
              <span>{round.progress.percentComplete}%</span>
            </div>
            <div className="rd-criteria">
              {round.scorecard.map((criterion) => (
                <div key={criterion.key}>
                  <span>{criterion.label}</span>
                  <small>{reviewCriterionSummary(criterion)}</small>
                </div>
              ))}
            </div>
            <footer>
              {round.reviewers.map((reviewer) => (
                <span className="rd-chip" key={reviewer.personId}>
                  {reviewer.name} · {reviewer.submitted}/{reviewer.assigned} (
                  {reviewer.percentComplete}%)
                  {reviewer.assignmentCap
                    ? ` · limit ${reviewer.assignmentCap}`
                    : ""}
                </span>
              ))}
              <a className="rd-link" href={reviewerSignup}>
                Reviewer sign-in link
              </a>
              <button
                className="rd-link"
                disabled={
                  busy ||
                  round.progress.assigned -
                    round.progress.submitted -
                    round.progress.recused <=
                    0
                }
                onClick={() => remind(round.id)}
              >
                Remind reviewers
              </button>
            </footer>
          </article>
        )),
      )}
    </div>
  );
}

function PlanDialog(props: {
  timezone: string;
  reviewers: ReviewsWorkspace["reviewers"];
  planName: string;
  setPlanName(value: string): void;
  rounds: DraftRound[];
  setRounds(value: DraftRound[]): void;
  busy: boolean;
  close(): void;
  save(): void;
}) {
  function updateRound(index: number, patch: Partial<DraftRound>) {
    props.setRounds(
      props.rounds.map((round, candidate) =>
        candidate === index ? { ...round, ...patch } : round,
      ),
    );
  }
  function updateCriterion(
    roundIndex: number,
    criterionIndex: number,
    criterion: ReviewCriterion,
  ) {
    const round = props.rounds[roundIndex];
    if (!round) return;
    updateRound(roundIndex, {
      scorecard: round.scorecard.map((current, index) =>
        index === criterionIndex ? criterion : current,
      ),
    });
  }
  function addCriterion(roundIndex: number, type: ReviewCriterion["type"]) {
    const round = props.rounds[roundIndex];
    if (!round) return;
    updateRound(roundIndex, {
      scorecard: [...round.scorecard, criterionFor(type)],
    });
  }
  function removeCriterion(roundIndex: number, criterionIndex: number) {
    const round = props.rounds[roundIndex];
    if (!round) return;
    const remaining = round.scorecard.filter((_, index) => index !== criterionIndex);
    updateRound(roundIndex, { scorecard: remaining });
    requestAnimationFrame(() => {
      const roundEditor = document.querySelector<HTMLElement>(`[data-scorecard-round="${roundIndex}"]`);
      const nextRemoves = roundEditor?.querySelectorAll<HTMLElement>("[data-remove-criterion]") ?? [];
      nextRemoves[Math.min(criterionIndex, nextRemoves.length - 1)]?.focus();
      if (!nextRemoves.length) roundEditor?.querySelector<HTMLElement>("[data-add-criterion]")?.focus();
    });
  }
  return (
    <AccessibleDialog close={props.close} titleId="plan-title" backdropClassName="rd-modal-backdrop" dialogClassName="rd-modal" initialFocus="#review-plan-name">
        <div className="rd-panel-head">
          <div>
            <span className="rd-kicker">Review setup</span>
            <h2 id="plan-title">New review plan</h2>
          </div>
          <button
            className="rd-close"
            type="button"
            aria-label="Close review plan"
            onClick={props.close}
          >
            ×
          </button>
        </div>
        <label className="rd-field">
          Plan name
          <input
            id="review-plan-name"
            value={props.planName}
            onChange={(event) => props.setPlanName(event.target.value)}
          />
        </label>
        <div className="rd-round-editor">
          {props.rounds.map((round, roundIndex) => (
            <fieldset key={round.key}>
              <legend>Round {roundIndex + 1}</legend>
              <div className="rd-form-grid">
                <label className="rd-field wide">
                  Name
                  <input
                    value={round.name}
                    onChange={(event) =>
                      updateRound(roundIndex, { name: event.target.value })
                    }
                  />
                </label>
                <label className="rd-field">
                  Opens <small>{props.timezone}</small>
                  <input
                    type="datetime-local"
                    value={round.opensAt}
                    onChange={(event) =>
                      updateRound(roundIndex, { opensAt: event.target.value })
                    }
                  />
                </label>
                <label className="rd-field">
                  Closes <small>{props.timezone}</small>
                  <input
                    type="datetime-local"
                    value={round.closesAt}
                    onChange={(event) =>
                      updateRound(roundIndex, { closesAt: event.target.value })
                    }
                  />
                </label>
                <label className="rd-field">
                  Anonymization
                  <select
                    value={round.blindPolicy}
                    onChange={(event) =>
                      updateRound(roundIndex, {
                        blindPolicy: event.target
                          .value as DraftRound["blindPolicy"],
                      })
                    }
                  >
                    <option value="double_blind">Blind review</option>
                    <option value="single_blind">Author hidden</option>
                    <option value="none">Author visible</option>
                  </select>
                </label>
                <label className="rd-field">
                  Per-reviewer cap
                  <input
                    type="number"
                    min="1"
                    value={round.assignmentCap}
                    onChange={(event) =>
                      updateRound(roundIndex, {
                        assignmentCap: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="rd-field wide">
                  Proposal groups{" "}
                  <small>
                    Comma-separated group names from the call for speakers;
                    blank accepts all.
                  </small>
                  <input
                    value={round.routingKeys.join(", ")}
                    onChange={(event) =>
                      updateRound(roundIndex, {
                        routingKeys: event.target.value
                          .split(",")
                          .map((key) => key.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
              <div className="rd-pool">
                <strong>Reviewer pool</strong>
                {props.reviewers.map((reviewer) => (
                  <label key={reviewer.personId}>
                    <input
                      type="checkbox"
                      checked={round.reviewerIds.includes(reviewer.personId)}
                      onChange={() =>
                        updateRound(roundIndex, {
                          reviewerIds: toggle(
                            round.reviewerIds,
                            reviewer.personId,
                          ),
                        })
                      }
                    />
                    {reviewer.name}
                  </label>
                ))}
              </div>
              <div className="rd-scorecard-editor" data-scorecard-round={roundIndex}>
                <strong>Scorecard</strong>
                {round.scorecard.map((criterion, criterionIndex) => (
                  <div key={criterion.key}>
                    <label className="rd-field">
                      Label
                      <input
                        value={criterion.label}
                        onChange={(event) =>
                          updateCriterion(roundIndex, criterionIndex, {
                            ...criterion,
                            label: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="rd-field">
                      Type
                      <select
                        value={criterion.type}
                        onChange={(event) =>
                          updateCriterion(
                            roundIndex,
                            criterionIndex,
                            criterionFor(
                              event.target.value as ReviewCriterion["type"],
                              criterion.key,
                              criterion.label,
                            ),
                          )
                        }
                      >
                        <option value="numeric">Numeric rating</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="free_text">Free text</option>
                      </select>
                    </label>
                    <label className="rd-field">
                      Weight{" "}
                      <small>
                        Relative influence; for example, Weight 2 counts twice
                        as much as Weight 1.
                      </small>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={criterion.type === "free_text"}
                        value={criterion.weight}
                        onChange={(event) =>
                          updateCriterion(roundIndex, criterionIndex, {
                            ...criterion,
                            weight: Number(event.target.value),
                          } as ReviewCriterion)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="rd-link danger"
                      data-remove-criterion
                      aria-label={`Remove ${criterion.label || `criterion ${criterionIndex + 1}`} from Round ${roundIndex + 1}`}
                      onClick={() => removeCriterion(roundIndex, criterionIndex)}
                    >
                      Remove
                    </button>
                    {criterion.type === "numeric" ? (
                      <div className="rd-criterion-details">
                        <label className="rd-field">
                          Minimum
                          <input
                            type="number"
                            value={criterion.min}
                            onChange={(event) =>
                              updateCriterion(roundIndex, criterionIndex, {
                                ...criterion,
                                min: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label className="rd-field">
                          Maximum
                          <input
                            type="number"
                            value={criterion.max}
                            onChange={(event) =>
                              updateCriterion(roundIndex, criterionIndex, {
                                ...criterion,
                                max: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                    {criterion.type === "dropdown" ? (
                      <div className="rd-criterion-details rd-option-editor">
                        <strong>Dropdown options</strong>
                        {criterion.options.map((option, optionIndex) => (
                          <div key={`${criterion.key}-${optionIndex}`}>
                            <input
                              aria-label={`Option ${optionIndex + 1} label`}
                              value={option.label}
                              onChange={(event) =>
                                updateCriterion(roundIndex, criterionIndex, {
                                  ...criterion,
                                  options: criterion.options.map(
                                    (candidate, index) =>
                                      index === optionIndex
                                        ? {
                                            ...candidate,
                                            label: event.target.value,
                                          }
                                        : candidate,
                                  ),
                                })
                              }
                            />
                            <input
                              aria-label={`Option ${optionIndex + 1} score`}
                              type="number"
                              min="0"
                              max="100"
                              value={option.score}
                              onChange={(event) =>
                                updateCriterion(roundIndex, criterionIndex, {
                                  ...criterion,
                                  options: criterion.options.map(
                                    (candidate, index) =>
                                      index === optionIndex
                                        ? {
                                            ...candidate,
                                            score: Number(event.target.value),
                                          }
                                        : candidate,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                <footer>
                  <button
                    type="button"
                    className="rd-link"
                    data-add-criterion
                    onClick={() => addCriterion(roundIndex, "numeric")}
                  >
                    + Numeric
                  </button>
                  <button
                    type="button"
                    className="rd-link"
                    onClick={() => addCriterion(roundIndex, "dropdown")}
                  >
                    + Dropdown
                  </button>
                  <button
                    type="button"
                    className="rd-link"
                    onClick={() => addCriterion(roundIndex, "free_text")}
                  >
                    + Free text
                  </button>
                </footer>
              </div>
            </fieldset>
          ))}
        </div>
        <button
          type="button"
          className="rd-link"
          onClick={() =>
            props.setRounds([
              ...props.rounds,
              newRound(
                `Round ${props.rounds.length + 1}`,
                props.rounds.length + 1,
                props.timezone,
              ),
            ])
          }
        >
          + Add round
        </button>
        <footer className="rd-modal-actions">
          <button className="rd-secondary" onClick={props.close}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-action"
            disabled={
              props.busy ||
              props.rounds.some(
                (round) =>
                  round.reviewerIds.length === 0 ||
                  round.scorecard.length === 0,
              )
            }
            onClick={props.save}
          >
            {props.busy ? "Saving…" : "Save review plan"}
          </button>
        </footer>
    </AccessibleDialog>
  );
}

function DecisionDialog(props: {
  title: string;
  currentDecision: "accepted" | "rejected" | null;
  reason: string;
  setReason(value: string): void;
  busy: boolean;
  close(): void;
  decide(outcome: "accepted" | "rejected"): void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const changing = props.currentDecision !== null;
  const blockedAcceptedChange = props.currentDecision === "accepted";
  return (
    <AccessibleDialog close={props.close} titleId="decision-dialog-title" backdropClassName="rd-modal-backdrop" dialogClassName="rd-modal rd-decision" initialFocus={blockedAcceptedChange ? "[data-dialog-initial-focus]" : "#decision-private-note"}>
        <div className="rd-panel-head">
          <div>
            <span className="rd-kicker">
              {changing ? "Change program decision" : "Final program decision"}
            </span>
            <h2 id="decision-dialog-title">{props.title}</h2>
          </div>
          <button
            className="rd-close"
            onClick={props.close}
            aria-label="Close decision dialog"
          >
            ×
          </button>
        </div>
        {props.currentDecision ? (
          <p>
            <strong>
              Current decision: {capitalize(props.currentDecision)}.
            </strong>
          </p>
        ) : null}
        <p>
          {blockedAcceptedChange
            ? "This acceptance already created a linked session and speaker onboarding work. Changing it to rejected also requires withdrawing that work, so it cannot be reversed from this screen."
            : props.currentDecision === "rejected"
              ? "Use Submissions for the audited change-decision path, downstream guards, and a fresh staged notification."
              : "Accept creates a linked Session privately. Either outcome remains hidden until its staged communication is reviewed and explicitly released."}
        </p>
        {blockedAcceptedChange ? (
          <footer className="rd-modal-actions">
            <button className="rd-secondary" onClick={props.close}>
              Close
            </button>
          </footer>
        ) : (
          <>
            <label className="rd-field">
              Private decision note
              <textarea
                id="decision-private-note"
                rows={5}
                value={props.reason}
                onChange={(event) => props.setReason(event.target.value)}
              />
            </label>
            {changing ? (
              <label className="rd-decision-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I understand the current result and the changes listed above.
              </label>
            ) : null}
            <footer className="rd-modal-actions">
              <button className="rd-secondary" onClick={props.close}>
                Cancel
              </button>
              {props.currentDecision !== "rejected" ? (
                <button
                  className="rd-secondary danger"
                  disabled={
                    props.busy ||
                    props.reason.trim().length < 3 ||
                    (changing && !confirmed)
                  }
                  onClick={() => props.decide("rejected")}
                >
                  Reject
                </button>
              ) : null}
              <button
                className="primary-action"
                disabled={
                  props.busy ||
                  props.reason.trim().length < 3 ||
                  (changing && !confirmed)
                }
                onClick={() => props.decide("accepted")}
              >
                {props.currentDecision === "rejected"
                  ? "Change to accepted"
                  : "Accept privately and create Session"}
              </button>
            </footer>
          </>
        )}
    </AccessibleDialog>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}
function capitalize(value: string) {
  return value[0]?.toUpperCase() + value.slice(1);
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The evaluation operation failed.";
}

function defaultRounds(timezone: string): DraftRound[] {
  return [
    newRound("Eligibility & fit", 1, timezone),
    newRound("Program committee", 2, timezone),
  ];
}
function newRound(name: string, offset: number, timezone: string): DraftRound {
  const opens = new Date(Date.now() + offset * 86_400_000);
  const closes = new Date(opens.valueOf() + 7 * 86_400_000);
  return {
    key: crypto.randomUUID(),
    name,
    opensAt: eventDateTimeInputValue(opens.toISOString(), timezone),
    closesAt: eventDateTimeInputValue(closes.toISOString(), timezone),
    blindPolicy: "double_blind",
    routingKeys: [],
    reviewerIds: [],
    assignmentCap: 12,
    scorecard: [
      {
        key: `technical_depth_${offset}`,
        label: "Technical depth",
        type: "numeric",
        required: true,
        weight: 50,
        min: 1,
        max: 10,
      },
      {
        key: `audience_value_${offset}`,
        label: "Audience value",
        type: "dropdown",
        required: true,
        weight: 50,
        options: [
          { label: "Limited", score: 20 },
          { label: "Good", score: 70 },
          { label: "Excellent", score: 100 },
        ],
      },
      {
        key: `reviewer_note_${offset}`,
        label: "Reviewer note",
        type: "free_text",
        required: true,
        weight: 0,
      },
    ],
  };
}
function criterionFor(
  type: ReviewCriterion["type"],
  key = `criterion_${crypto.randomUUID()}`,
  label = "New criterion",
): ReviewCriterion {
  if (type === "numeric")
    return { key, label, type, required: true, weight: 50, min: 1, max: 10 };
  if (type === "dropdown")
    return {
      key,
      label,
      type,
      required: true,
      weight: 50,
      options: [
        { label: "Limited", score: 20 },
        { label: "Good", score: 70 },
        { label: "Excellent", score: 100 },
      ],
    };
  return { key, label, type, required: true, weight: 0 };
}
