import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getAcceleventsWorkspace, runAccelevents, saveAcceleventsConfiguration } from "./api";
import styles from "./accelevents.module.css";
import type {
  AcceleventsFieldMapping,
  AcceleventsReferenceMapping,
  AcceleventsSyncRun,
  AcceleventsWorkspace,
} from "./types";

export function AcceleventsIntegrationPage() {
  const { eventSlug = "devflow-conf-2027" } = useParams();
  const [workspace, setWorkspace] = useState<AcceleventsWorkspace | null>(null);
  const [form, setForm] = useState<ConfigurationForm | null>(null);
  const [busy, setBusy] = useState<"save" | "preview" | "manual" | "retry" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const next = await getAcceleventsWorkspace(eventSlug);
    setWorkspace(next);
    setForm(fromWorkspace(next));
  }

  useEffect(() => {
    let active = true;
    getAcceleventsWorkspace(eventSlug).then((next) => {
      if (!active) return;
      setWorkspace(next);
      setForm(fromWorkspace(next));
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [eventSlug]);

  const issues = useMemo(() => workspace?.recentRuns.flatMap((run) => run.records
    .filter((record) => record.status === "failed" || record.status === "blocked_external")
    .map((record) => ({ run, record }))).slice(0, 40) ?? [], [workspace]);

  async function save() {
    if (!form) return;
    setBusy("save"); setError(null); setNotice(null);
    try {
      const next = await saveAcceleventsConfiguration(eventSlug, {
        externalEventUrl: clean(form.externalEventUrl),
        apiBaseUrl: "https://api.accelevents.com",
        credentialBinding: "ACCELEVENTS_API_TOKEN",
        authorizationHeader: form.authorizationHeader,
        enabled: form.enabled,
        mappings: form.mappings,
        referenceMappings: form.referenceMappings.filter((mapping) => mapping.externalValue.trim()),
      });
      setWorkspace(next); setForm(fromWorkspace(next));
      setNotice("Event scope and mappings were saved. No Accelevents success has been claimed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the Accelevents configuration."); }
    finally { setBusy(null); }
  }

  async function run(mode: "preview" | "manual" | "retry", sourceRunId?: string) {
    if (!workspace) return;
    setBusy(mode); setError(null); setNotice(null);
    try {
      const result = await runAccelevents(workspace, mode, sourceRunId);
      await load();
      if (result.mode === "preview") setNotice(`Dry-run persisted: ${result.planned} canonical records inspected, ${result.failed} mapping failure(s), and no provider call made.`);
      else if (result.status === "blocked_external") setNotice("Run persisted as blocked_external. No Accelevents response is claimed; configure the Worker token and retry.");
      else if (!result.providerResponded) setNotice("The run ended without an Accelevents response and is not presented as a live sync.");
      else setNotice(`Accelevents responded: ${result.synced} synced, ${result.skipped} unchanged, ${result.failed} failed. Inspect record attempts below.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not run Accelevents synchronization."); }
    finally { setBusy(null); }
  }

  if (!workspace || !form) return <p className={styles.loading}>Loading Accelevents integration…</p>;
  const last = workspace.lastRun;
  const retryable = last?.records.some((record) => record.status === "failed" || record.status === "blocked_external") ?? false;

  return <div className={styles.workspace}>
    <header className={styles.pageHead}>
      <div><p className={styles.eyebrow}>Integration · HUM-15</p><h1>Accelevents</h1><p>One-way delivery of approved, scheduled canonical sessions and their speakers. Preview first; provider responses and failures remain inspectable.</p></div>
      <div className={`${styles.health} ${workspace.readiness.ready ? styles.ready : styles.blocked}`}><i /><span><strong>{workspace.readiness.ready ? "Ready for live attempts" : "Externally blocked"}</strong><small>{workspace.readiness.tokenAvailable ? "Worker secret detected" : "ACCELEVENTS_API_TOKEN unavailable"}</small></span></div>
    </header>

    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}

    <section className={styles.metrics} aria-label="Latest Accelevents run">
      <Metric label="Canonical scope" value={`${workspace.canonicalCounts.sessions} / ${workspace.canonicalCounts.speakers}`} note="approved sessions / linked speakers" />
      <Metric label="Last run" value={last ? last.status.replaceAll("_", " ") : "Never"} note={last ? `${last.mode} · ${formatDate(last.createdAt)}` : "No attempt recorded"} />
      <Metric label="Synced" value={String(last?.syncedCount ?? 0)} note={last?.providerResponded ? `${last.providerRequestCount} HTTP request(s)` : "No provider response claimed"} />
      <Metric label="Failures" value={String(last?.failedCount ?? 0)} note={last?.failureCode ?? "No recorded failures"} danger={Boolean(last?.failedCount)} />
    </section>

    <section className={styles.console}>
      <div className={styles.configuration}>
        <SectionHead eyebrow="Organizer-scoped connection" title="Event configuration"><button type="button" disabled={Boolean(busy)} onClick={() => void save()}>{busy === "save" ? "Saving…" : "Save configuration"}</button></SectionHead>
        <div className={styles.formGrid}>
          <label>Accelevents event URL slug<input placeholder="devflow-conf-2027" value={form.externalEventUrl} onChange={(event) => setForm({ ...form, externalEventUrl: event.target.value })} /><small>The unique value after <code>/events/</code> in Accelevents.</small></label>
          <label>Official API origin<input value="https://api.accelevents.com" readOnly /><small>Outbound requests are restricted to the documented HTTPS origin.</small></label>
          <label>Token secret binding<input value="ACCELEVENTS_API_TOKEN" readOnly /><small>The browser never receives or stores this token.</small></label>
          <label>Documented auth header<select value={form.authorizationHeader} onChange={(event) => setForm({ ...form, authorizationHeader: event.target.value as "Authorization" | "Key" })}><option>Authorization</option><option>Key</option></select></label>
          <label className={styles.toggle}><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span>Enable outbound synchronization attempts</span></label>
        </div>
        <div className={styles.readiness}>{workspace.readiness.missing.length ? workspace.readiness.missing.map((item) => <code key={item}>{item.replaceAll("_", " ")}</code>) : <Status value="configuration ready" good />}</div>
      </div>

      <aside className={styles.operations}>
        <SectionHead eyebrow="Explicit operations" title="Preview, sync, retry" />
        <p>Preview persists the exact create/update/skip plan without calling Accelevents. Manual sync resolves the Worker token server-side.</p>
        <button type="button" disabled={Boolean(busy)} onClick={() => void run("preview")}>{busy === "preview" ? "Previewing…" : "Preview / dry-run"}</button>
        <button className={styles.primary} type="button" disabled={Boolean(busy)} onClick={() => void run("manual")}>{busy === "manual" ? "Syncing…" : "Sync approved records"}</button>
        <button type="button" disabled={Boolean(busy) || !last || !retryable} onClick={() => last && void run("retry", last.id)}>{busy === "retry" ? "Retrying…" : "Retry failed records"}</button>
        <small>A completion state requires an Accelevents HTTP response. Missing credentials persist as <code>blocked_external</code>.</small>
      </aside>
    </section>

    <section className={styles.panel}>
      <SectionHead eyebrow="Canonical → provider" title="Field mappings"><em>{form.mappings.filter((mapping) => mapping.enabled).length} enabled</em></SectionHead>
      <div className={styles.mappingHeader}><span>Canonical field</span><span>Direction</span><span>Accelevents field</span><span>Rule</span></div>
      {form.mappings.map((mapping, index) => <div className={styles.mappingRow} key={`${mapping.entityType}:${mapping.canonicalField}`}>
        <span><strong>{mapping.entityType}</strong><code>{mapping.canonicalField}</code></span><span className={styles.direction}>→</span>
        <input aria-label={`${mapping.entityType} ${mapping.canonicalField} Accelevents field`} value={mapping.externalField} onChange={(event) => setForm({ ...form, mappings: replaceAt(form.mappings, index, { ...mapping, externalField: event.target.value }) })} />
        <label className={styles.inlineToggle}><input type="checkbox" checked={mapping.enabled} onChange={(event) => setForm({ ...form, mappings: replaceAt(form.mappings, index, { ...mapping, enabled: event.target.checked }) })} /><span>{mapping.required ? "required" : "optional"}</span></label>
      </div>)}
    </section>

    <section className={styles.panel}>
      <SectionHead eyebrow="Catalog references" title="Track and format mappings"><em>Required before session sync</em></SectionHead>
      {form.referenceMappings.length ? form.referenceMappings.map((mapping, index) => <div className={styles.referenceRow} key={`${mapping.referenceType}:${mapping.canonicalId}`}>
        <Status value={mapping.referenceType} good /><strong>{mapping.canonicalLabel}</strong><span>→</span>
        <input aria-label={`${mapping.referenceType} ${mapping.canonicalLabel} Accelevents value`} placeholder={mapping.referenceType === "track" ? "Accelevents track ID" : "MAIN_STAGE"} value={mapping.externalValue} onChange={(event) => setForm({ ...form, referenceMappings: replaceAt(form.referenceMappings, index, { ...mapping, externalValue: event.target.value }) })} />
      </div>) : <p className={styles.empty}>No approved scheduled session references are available yet.</p>}
    </section>

    <section className={styles.panel}>
      <SectionHead eyebrow="Inspectable run log" title="Record outcomes and attempts"><em>{issues.length} recent issue(s)</em></SectionHead>
      {workspace.recentRuns.length ? workspace.recentRuns.map((runRecord) => <RunLog key={runRecord.id} run={runRecord} />) : <p className={styles.empty}>No preview or synchronization run has been recorded.</p>}
    </section>
  </div>;
}

interface ConfigurationForm {
  externalEventUrl: string;
  authorizationHeader: "Authorization" | "Key";
  enabled: boolean;
  mappings: AcceleventsFieldMapping[];
  referenceMappings: AcceleventsReferenceMapping[];
}

function fromWorkspace(workspace: AcceleventsWorkspace): ConfigurationForm {
  const saved = new Map(workspace.configuration.referenceMappings.map((mapping) => [`${mapping.referenceType}:${mapping.canonicalId}`, mapping]));
  return {
    externalEventUrl: workspace.configuration.externalEventUrl ?? "",
    authorizationHeader: workspace.configuration.authorizationHeader === "Key" ? "Key" : "Authorization",
    enabled: workspace.configuration.enabled,
    mappings: workspace.configuration.mappings.map((mapping) => ({ ...mapping })),
    referenceMappings: workspace.availableReferences.map((reference) => ({ ...reference, externalValue: saved.get(`${reference.referenceType}:${reference.canonicalId}`)?.externalValue ?? "" })),
  };
}

function RunLog({ run }: { run: AcceleventsSyncRun }) {
  return <details className={styles.run} open={run.status === "failed" || run.status === "partial" || run.status === "blocked_external"}>
    <summary><Status value={run.status} good={run.status === "succeeded"} /><strong>{run.mode} · {formatDate(run.createdAt)}</strong><span>{run.syncedCount} synced · {run.skippedCount} skipped · {run.failedCount} failed</span><small>{run.providerResponded ? `${run.providerRequestCount} provider request(s)` : "No provider response"}</small></summary>
    <div className={styles.records}>{run.records.map((record) => <article key={record.id} className={styles.record}>
      <Status value={record.status} good={record.status === "synced" || record.status === "skipped" || record.status === "previewed"} />
      <div><strong>{record.entityType} · {record.canonicalId}</strong><p>{record.errorMessage ?? `${record.operation} ${record.externalId ? `· external ${record.externalId}` : ""}`}</p></div>
      <div className={styles.attempts}>{record.attempts.map((attempt) => <small key={attempt.id}>#{attempt.attemptNumber} {attempt.status.replaceAll("_", " ")} · {attempt.httpStatus ?? "no HTTP"}{attempt.providerRequestId ? ` · ${attempt.providerRequestId}` : ""}</small>)}</div>
    </article>)}</div>
  </details>;
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) { return <div className={styles.sectionHead}><div><span>{eyebrow}</span><h2>{title}</h2></div>{children}</div>; }
function Metric({ label, value, note, danger = false }: { label: string; value: string; note: string; danger?: boolean }) { return <div className={styles.metric}><span>{label}</span><strong className={danger ? styles.danger : ""}>{value}</strong><small>{note}</small></div>; }
function Status({ value, good }: { value: string; good: boolean }) { return <i className={`${styles.status} ${good ? styles.good : styles.warn}`}>{value.replaceAll("_", " ")}</i>; }
function replaceAt<T>(values: T[], index: number, value: T) { return values.map((candidate, candidateIndex) => candidateIndex === index ? value : candidate); }
function clean(value: string) { return value.trim() || null; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
