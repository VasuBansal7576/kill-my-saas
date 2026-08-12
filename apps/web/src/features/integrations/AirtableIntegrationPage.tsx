import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getAirtableWorkspace, runAirtableSync, saveAirtableConfiguration } from "./api";
import styles from "./integrations.module.css";
import type { AirtableFieldMapping, AirtableSyncRun, AirtableWorkspace } from "./types";

export function AirtableIntegrationPage() {
  const { eventSlug = "devflow-conf-2027" } = useParams();
  const [workspace, setWorkspace] = useState<AirtableWorkspace | null>(null);
  const [form, setForm] = useState<ConfigurationForm | null>(null);
  const [busy, setBusy] = useState<"save" | "export" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const next = await getAirtableWorkspace(eventSlug);
    setWorkspace(next);
    setForm(fromWorkspace(next));
  }

  useEffect(() => {
    let active = true;
    getAirtableWorkspace(eventSlug).then((next) => {
      if (!active) return;
      setWorkspace(next);
      setForm(fromWorkspace(next));
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [eventSlug]);

  const failures = useMemo(() => workspace?.recentRuns.flatMap((run) =>
    run.items.filter((item) => item.status === "failed" || item.status === "conflict" || item.status === "blocked_external")
      .map((item) => ({ run, item })),
  ).slice(0, 30) ?? [], [workspace]);

  async function save() {
    if (!form) return;
    setBusy("save"); setError(null); setNotice(null);
    try {
      const next = await saveAirtableConfiguration(eventSlug, {
        baseId: clean(form.baseId),
        tableId: clean(form.tableId),
        credentialBinding: "AIRTABLE_TOKEN",
        modifiedTimeField: clean(form.modifiedTimeField),
        enabled: form.enabled,
        pageSize: form.pageSize,
        mappings: form.mappings,
      });
      setWorkspace(next); setForm(fromWorkspace(next));
      setNotice("Configuration metadata and field ownership mappings were saved. No sync has been claimed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save Airtable configuration."); }
    finally { setBusy(null); }
  }

  async function sync(direction: "export" | "import") {
    if (!workspace) return;
    setBusy(direction); setError(null); setNotice(null);
    try {
      const receipt = await runAirtableSync(workspace, direction);
      await load();
      if (receipt.status === "blocked_external") {
        setNotice("Airtable is not connected yet. No records were changed; add the connection details and token, then retry.");
      } else if (!receipt.providerResponded) {
        setNotice("The attempt ended without an Airtable response and is not presented as a live sync.");
      } else if (receipt.status === "complete") {
        setNotice(`Airtable responded. ${receipt.exported} exported, ${receipt.imported} imported, ${receipt.failed} failed.`);
      } else {
        setNotice(`Airtable responded with a partial result. Inspect ${receipt.failed} row failure${receipt.failed === 1 ? "" : "s"} below.`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not run Airtable synchronization."); }
    finally { setBusy(null); }
  }

  if (!workspace || !form) return <p className={styles.loading}>Loading Airtable integration…</p>;
  const last = workspace.lastRun;
  return <div className={styles.workspace}>
    <header className={styles.pageHead}>
      <div><p className={styles.eyebrow}>Integration · bonus</p><h1>Airtable augmentation</h1><p>PostgreSQL remains canonical. Airtable receives stable IDs and may return only explicitly Airtable-owned attributes.</p></div>
      <div className={`${styles.health} ${workspace.readiness.exportReady ? styles.ready : styles.blocked}`}><i /><span><strong>{workspace.readiness.exportReady ? "Export ready" : "Configuration incomplete"}</strong><small>{workspace.readiness.tokenAvailable ? "Secret binding detected" : "AIRTABLE_TOKEN unavailable"}</small></span></div>
    </header>
    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}

    <section className={styles.metrics} aria-label="Latest Airtable attempt">
      <Metric label="Last attempt" value={last ? formatDate(last.createdAt) : "Never"} note={last ? `${last.direction} · ${humanStatus(last)}` : "No provider call recorded"} />
      <Metric label="Exported" value={String(last?.exportedCount ?? 0)} note="Provider-returned record IDs retained" />
      <Metric label="Imported" value={String(last?.importedCount ?? 0)} note="Namespaced augmentation only" />
      <Metric label="Failures" value={String(last?.failedCount ?? 0)} note={last?.providerResponded ? `${last.providerRequestCount} provider request attempt(s)` : "No provider response claimed"} danger={Boolean(last?.failedCount)} />
    </section>

    <section className={styles.console}>
      <div className={styles.configuration}>
        <div className={styles.sectionHead}><div><span>Persisted metadata</span><h2>Connection and readiness</h2></div><button type="button" disabled={Boolean(busy)} onClick={() => void save()}>{busy === "save" ? "Saving…" : "Save configuration"}</button></div>
        <div className={styles.formGrid}>
          <label>Base ID<input placeholder="app…" value={form.baseId} onChange={(event) => setForm({ ...form, baseId: event.target.value })} /></label>
          <label>Table ID or name<input placeholder="Program augmentation" value={form.tableId} onChange={(event) => setForm({ ...form, tableId: event.target.value })} /></label>
          <label>Token secret binding<input value="AIRTABLE_TOKEN" readOnly /><small>The token is resolved at runtime and never displayed or stored here.</small></label>
          <label>Last modified time field<input placeholder="Last modified" value={form.modifiedTimeField} onChange={(event) => setForm({ ...form, modifiedTimeField: event.target.value })} /><small>Required for conflict-safe import.</small></label>
          <label>Provider page size<input type="number" min={1} max={100} value={form.pageSize} onChange={(event) => setForm({ ...form, pageSize: Number(event.target.value) })} /></label>
          <label className={styles.toggle}><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span>Enable synchronization attempts</span></label>
        </div>
        <div className={styles.readiness}>
          <Status value={workspace.readiness.exportReady ? "export ready" : "export blocked"} good={workspace.readiness.exportReady} />
          <Status value={workspace.readiness.importReady ? "import ready" : "import blocked"} good={workspace.readiness.importReady} />
          {workspace.readiness.missing.map((item) => <code key={item}>{item.replaceAll("_", " ")}</code>)}
        </div>
      </div>

      <aside className={styles.operations}>
        <div className={styles.sectionHead}><div><span>Explicit operations</span><h2>Run synchronization</h2></div></div>
        <p>Export reconciles existing <code>_programflow_id</code> values before create/update. Import validates those IDs and rejects newer-local conflicts.</p>
        <button className={styles.primary} type="button" disabled={Boolean(busy)} onClick={() => void sync("export")}>{busy === "export" ? "Exporting…" : "Export canonical records"}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void sync("import")}>{busy === "import" ? "Importing…" : "Import Airtable attributes"}</button>
        <small>A run is marked complete only after Airtable responds. Missing connection details are shown as “Needs setup.”</small>
      </aside>
    </section>

    <section className={styles.mappingPanel}>
      <div className={styles.sectionHead}><div><span>Field ownership</span><h2>Mappings</h2></div><em>{form.mappings.length} mappings</em></div>
      <div className={styles.mappingHeader}><span>Entity / local field</span><span>Direction</span><span>Airtable field</span><span>Owner</span></div>
      {form.mappings.map((mapping, index) => <div className={styles.mappingRow} key={`${mapping.entityType}:${mapping.localField}`}>
        <span><strong>{mapping.entityType}</strong><code>{mapping.localField}</code></span>
        <span className={styles.direction}>{mapping.direction === "export" ? "→" : mapping.direction === "import" ? "←" : "↔"}</span>
        <input aria-label={`${mapping.entityType} ${mapping.localField} Airtable field`} value={mapping.externalField} onChange={(event) => setForm({ ...form, mappings: form.mappings.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, externalField: event.target.value } : candidate) })} />
        <Status value={mapping.owner} good={mapping.owner === "programflow"} />
      </div>)}
    </section>

    <section className={styles.failurePanel}>
      <div className={styles.sectionHead}><div><span>Inspectable evidence</span><h2>Row receipts and failures</h2></div><em>{failures.length} recent issues</em></div>
      {failures.length ? failures.map(({ run, item }) => <article className={styles.failure} key={item.id}>
        <Status value={item.status} good={false} />
        <div><strong>{item.entityType ?? "configuration"} · {item.canonicalId ?? item.airtableRecordId ?? "run"}</strong><p>{item.errorMessage ?? "Synchronization item needs attention."}</p><small>{item.errorCode ?? "unknown_error"} · {run.direction} · {formatDate(item.createdAt)}</small></div>
        <span>{item.airtableRecordId ?? "No Airtable record ID"}<small>{item.providerResponded ? "Provider responded" : "No provider response"}</small></span>
      </article>) : <p className={styles.empty}>No row-level failures have been recorded.</p>}
    </section>
  </div>;
}

interface ConfigurationForm {
  baseId: string;
  tableId: string;
  modifiedTimeField: string;
  enabled: boolean;
  pageSize: number;
  mappings: AirtableFieldMapping[];
}

function fromWorkspace(workspace: AirtableWorkspace): ConfigurationForm {
  return {
    baseId: workspace.configuration.baseId ?? "",
    tableId: workspace.configuration.tableId ?? "",
    modifiedTimeField: workspace.configuration.modifiedTimeField ?? "",
    enabled: workspace.configuration.enabled,
    pageSize: workspace.configuration.pageSize,
    mappings: workspace.configuration.mappings.map((mapping) => ({ ...mapping })),
  };
}

function Metric({ label, value, note, danger = false }: { label: string; value: string; note: string; danger?: boolean }) {
  return <div className={styles.metric}><span>{label}</span><strong className={danger ? styles.danger : ""}>{value}</strong><small>{note}</small></div>;
}

function Status({ value, good }: { value: string; good: boolean }) {
  return <i className={`${styles.status} ${good ? styles.good : styles.warn}`}>{value.replaceAll("_", " ")}</i>;
}

function clean(value: string): string | null { return value.trim() || null; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function humanStatus(run: AirtableSyncRun) { return run.providerResponded ? run.status.replaceAll("_", " ") : `${run.status.replaceAll("_", " ")} · no provider response`; }
