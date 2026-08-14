import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadEvaluationEvidence } from "./api";
import styles from "./operations-evidence.module.css";
import type { EvidenceState, EvaluationEvidenceCenter } from "./types";

export function EvaluationEvidencePage() {
  const { eventSlug = "" } = useParams();
  const [center, setCenter] = useState<EvaluationEvidenceCenter | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadEvaluationEvidence(eventSlug).then((result) => { if (active) { setCenter(result); setError(null); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Evidence could not be loaded."); });
    return () => { active = false; };
  }, [eventSlug]);
  if (!center) return <section className={styles.loading} aria-live="polite">{error ?? "Loading evaluation evidence…"}</section>;
  const manifest = center.releaseManifest;
  const manifestUrl = `/api/v1/organizer/events/${encodeURIComponent(eventSlug)}/evaluation-evidence/manifest.json`;
  return <div className={styles.workspace}>
    <header className={styles.evidenceHero}>
      <div><p className={styles.eyebrow}>Organizer-only · Operations & evidence</p><h1>Evaluation Evidence Center</h1><p>Live evidence for {center.event.name}. Missing proof stays missing; implementation status never becomes a pass on its own.</p></div>
      <StateBadge state={center.readiness.state} label={center.readiness.state === "verified" ? "Evidence verified" : "Evidence incomplete"} />
    </header>

    <section className={styles.evidenceMetrics} aria-label="Live rubric evidence totals">
      <Metric label="Required rubric" value={`${center.readiness.requiredVerified}/${center.readiness.requiredTotal}`} detail="183 weighted points" />
      <Metric label="CRM extra credit" value={`${center.readiness.extraCreditVerified}/${center.readiness.extraCreditTotal}`} detail="Project-required extra credit" />
      <Metric label="Scenarios verified" value={`${center.readiness.scenarioVerified}/${center.readiness.scenarioTotal}`} detail="18 required + 2 CRM" />
      <Metric label="Missing evidence" value={center.readiness.missing} detail={`${center.readiness.recorded} recorded but unverified`} />
    </section>

    <section className={styles.panel}>
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Guided route map</p><h2>Golden thread</h2><small>Use these links in order. State is derived from the scenario evidence below.</small></div><Link to="/help">Evaluator help →</Link></div>
      <ol className={styles.goldenThread}>{center.goldenThread.map((step) => <li key={step.order}><span>{String(step.order).padStart(2, "0")}</span><div><strong>{step.label}</strong><small>{step.scenarioIds.join(" · ")}</small></div><StateBadge state={step.state} /><Link to={step.route}>Open →</Link></li>)}</ol>
    </section>

    <section className={styles.panel}>
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Inspectable provider receipts</p><h2>Real side-effect status</h2><small>Recorded means an attempt exists but no qualifying successful receipt has been found.</small></div></div>
      <div className={styles.providerGrid}>{center.providers.map((provider) => <article key={provider.provider}><div><strong>{provider.provider.replaceAll("_", " ")}</strong><StateBadge state={provider.state} /></div><p>{provider.detail}</p><small>{provider.receipts} persisted record{provider.receipts === 1 ? "" : "s"}</small></article>)}</div>
    </section>

    <section className={styles.panel}>
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>20 live scenarios · 98 V1 rubric items</p><h2>Scenario evidence map</h2><small>86 required items / 183 weighted points plus 12 Speaker CRM extra-credit items / 19 points.</small></div></div>
      <div className={styles.scenarioList}>{center.scenarios.map((scenario) => <details key={scenario.id} className={styles.scenario}>
        <summary><span>{scenario.id}</span><div><strong>{scenario.title}</strong><small>{scenario.area} · {scenario.persona} · {scenario.requirementIds.length} item{scenario.requirementIds.length === 1 ? "" : "s"}</small></div><StateBadge state={scenario.state} /></summary>
        <div className={styles.scenarioBody}>
          <section><h3>Route entry</h3><Link to={scenario.entryRoute}>{scenario.entryRoute}</Link><div className={styles.routeList}>{scenario.routes.map((route) => <code key={route}>{route}</code>)}</div></section>
          <section><h3>Persisted transition</h3><p>{scenario.persistedTransition}</p></section>
          <section><h3>Downstream handoff</h3><p>{scenario.downstreamHandoff}</p></section>
          <section className={styles.requirementMap}><h3>Requirement evidence</h3>{scenario.requirements.map((requirement) => <article key={requirement.requirementId}><strong>{requirement.requirementId}</strong><StateBadge state={requirement.state} /><span>{requirement.records.length} record{requirement.records.length === 1 ? "" : "s"}</span>{requirement.records.map((record) => <div key={record.id}><code>{record.operation}</code>{record.artifactUrl ? <a href={record.artifactUrl}>Artifact ↗</a> : null}<time>{new Date(record.createdAt).toLocaleString()}</time></div>)}</article>)}</section>
        </div>
      </details>)}</div>
    </section>

    <div className={styles.bottomGrid}>
      <section className={styles.panel}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Release evidence manifest</p><h2>Deployment identity</h2></div><a href={manifestUrl} download>Download JSON ↓</a></div>
        <dl className={styles.manifest}><ManifestRow label="Commit" value={manifest.commit} /><ManifestRow label="Migration" value={manifest.migration} /><ManifestRow label="Deployment ID" value={manifest.deploymentId} /><ManifestRow label="Source" value={manifest.sourceUrl} link /><ManifestRow label="Evaluation URL" value={manifest.evaluationUrl} link /></dl>
        <p className={styles.truthNote}>Unset release metadata is displayed as “Not supplied”; it is never inferred into a passing value.</p>
      </section>
      <section className={styles.panel} id="reset">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Authorized environments only</p><h2>Deterministic evaluation reset</h2></div><StateBadge state={center.reset.available ? "recorded" : "missing"} label={center.reset.available ? "Runbook available" : "Unavailable here"} /></div>
        <p className={styles.resetDetail}>{center.reset.detail}</p>
        {center.reset.instructions.length ? <ol className={styles.resetSteps}>{center.reset.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol> : null}
        {center.reset.runbookUrl ? <a className={styles.runbookLink} href={center.reset.runbookUrl}>Open operator runbook ↗</a> : null}
      </section>
    </div>
  </div>;
}

function StateBadge({ state, label }: { state: EvidenceState; label?: string }) { return <span className={styles.stateBadge} data-state={state}>{label ?? state}</span>; }
function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function ManifestRow({ label, value, link = false }: { label: string; value: string | null; link?: boolean }) { return <div><dt>{label}</dt><dd>{value ? link ? <a href={value}>{value}</a> : <code>{value}</code> : <em>Not supplied</em>}</dd></div>; }
