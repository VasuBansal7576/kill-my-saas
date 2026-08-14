import { Link } from "react-router-dom";
import {
  evaluationAreas,
  evaluationScorecard,
  evidenceCenterRoute,
} from "./evaluation-scorecard-data";
import styles from "./operations-evidence.module.css";

export function EvaluationScorecardPage() {
  const contract = evaluationScorecard;
  return (
    <main id="main-content" className={styles.scorecardPage}>
      <header className={styles.scorecardNav}>
        <Link className={styles.brand} to="/"><span>PF</span>ProgramFlow</Link>
        <nav aria-label="Scorecard shortcuts">
          <Link to="/help">How to evaluate</Link>
          <Link to={evidenceCenterRoute}>Evidence Center</Link>
        </nav>
      </header>

      <section className={styles.scorecardHero}>
        <div>
          <p className={styles.eyebrow}>Current evaluation contract · {contract.effectiveDate}</p>
          <h1>{contract.totalItems} items. {contract.totalPoints} points. Status without spin.</h1>
          <p className={styles.scorecardLead}>
            This is ProgramFlow&apos;s public build-status snapshot for the Kill My SaaS target.
            Implementation coverage is not a judge score, and no item is called verified until
            its linked evidence is complete in a fresh judge run.
          </p>
          <div className={styles.primaryEntryActions}>
            <a className={styles.primaryAction} href={contract.walkthrough.href}>
              Watch the {contract.walkthrough.durationLabel} walkthrough
            </a>
            <Link to={evidenceCenterRoute}>Inspect live evidence</Link>
          </div>
        </div>
        <aside className={styles.walkthroughCard} aria-labelledby="walkthrough-title">
          <span>Judge walkthrough</span>
          <strong id="walkthrough-title">One lifecycle in {contract.walkthrough.durationLabel}</strong>
          <p>Proposal, scoped review, acceptance handoff, speaker work, schedule controls, receipts, and public delivery.</p>
          <dl>
            <div><dt>Runtime</dt><dd>{contract.walkthrough.durationSeconds.toFixed(1)} seconds</dd></div>
            <div><dt>File</dt><dd>1080p H.264/AAC · {contract.walkthrough.sizeLabel}</dd></div>
          </dl>
          <a href={contract.walkthrough.href}>Open video →</a>
        </aside>
      </section>

      <section className={styles.contractMetrics} aria-label="Evaluation contract totals">
        <Metric label="Required contract" value={`${contract.requiredItems} items`} detail={`${contract.requiredPoints} weighted points`} />
        <Metric label="CRM extra credit" value={`${contract.crmItems} items`} detail={`${contract.crmPoints} weighted points`} />
        <Metric label="Implemented" value={`${contract.implementedItems}/${contract.totalItems}`} detail={`${contract.implementedPoints}/${contract.totalPoints} points represented · not a score`} tone="implemented" />
        <Metric label="Verified" value={`${contract.verifiedItems}/${contract.totalItems}`} detail={`${contract.verifiedPoints}/${contract.totalPoints} points with fresh release proof`} tone="verified" />
      </section>

      <section className={styles.scorecardPanel} aria-labelledby="area-status-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Seven evaluator areas · {contract.scenarios} scenarios</p>
            <h2 id="area-status-title">Current item status</h2>
            <small>Every implementation claim is backed by source-linked automated evidence. Release verification remains separate.</small>
          </div>
          <Link to={evidenceCenterRoute}>Open protected evidence →</Link>
        </div>
        <div className={styles.areaTable} role="table" aria-label="Rubric status by area">
          <div className={styles.areaHeader} role="row">
            <span role="columnheader">Area</span><span role="columnheader">Contract</span><span role="columnheader">Implemented</span><span role="columnheader">Verified</span><span role="columnheader">Evidence</span>
          </div>
          {evaluationAreas.map((area) => (
            <div className={styles.areaRow} role="row" key={area.prefix}>
              <span role="cell"><strong>{area.name}</strong><small>{area.prefix}-01–{String(area.items).padStart(2, "0")} · {area.required ? "required" : "extra credit"}</small></span>
              <span role="cell"><strong>{area.items}</strong><small>{area.points} points</small></span>
              <span role="cell"><strong>{area.items}/{area.items}</strong><small>Automated evidence linked</small></span>
              <span role="cell"><strong>0/{area.items}</strong><small>Fresh judge run</small></span>
              <span role="cell"><Link to={evidenceCenterRoute} aria-label={`Inspect ${area.name} evidence`}>Inspect →</Link></span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.verificationHandoff} aria-labelledby="verification-handoff-title">
        <div>
          <p className={styles.eyebrow}>Fresh verification handoff</p>
          <h2 id="verification-handoff-title">The public scorecard does not self-award passes.</h2>
          <p>Release verification begins at 0/98 here by design. Judges can run the current 20-scenario contract, then inspect live state transitions, receipts, artifacts, and deployment identity in the organizer-only Evidence Center.</p>
        </div>
        <div className={styles.verificationActions}>
          <Link to={evidenceCenterRoute}>Open Evidence Center →</Link>
          <Link to="/help">Read the evaluator guide →</Link>
        </div>
      </section>

      <footer className={styles.scorecardMethod}>
        <strong>Method.</strong> Counts come from the source-controlled V1 ledger and the 13 August 2026 live-contract delta: CFP-17, CFP-18, and EMB-15 at weight 3. “Implemented” requires an implementation record and automated evidence. “Verified” requires a fresh scenario run plus applicable artifact, receipt, and deployment proof. The organizer-only Evidence Center shows live records and keeps missing proof missing.
      </footer>
    </main>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "implemented" | "verified" }) {
  return <article data-tone={tone}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
