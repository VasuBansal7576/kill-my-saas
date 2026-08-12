import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getAudienceSpeakers,
  getCommunications,
  pollRecipient,
  queueCampaign,
  retryRecipient,
  saveCommunicationTemplate,
} from "./api";
import styles from "./communications.module.css";
import type { AudienceSpeaker, CommunicationCampaign, CommunicationRecipient, CommunicationTemplate, CommunicationsWorkspace } from "./types";

const starter = {
  name: "Speaker update",
  subjectTemplate: "An update for {{ event_name }}",
  htmlTemplate: "<p>Hello {{first_name}},</p><p>We have an update for you.</p>",
  textTemplate: "Hello {{first_name}}, we have an update for you.",
};

export function CommunicationsPage() {
  const { eventSlug = "devflow-conf-2027" } = useParams();
  const [workspace, setWorkspace] = useState<CommunicationsWorkspace | null>(null);
  const [speakers, setSpeakers] = useState<AudienceSpeaker[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({ search: "", status: "", taskStatus: "all" });
  const [compose, setCompose] = useState({ ...starter, kind: "campaign" as "transactional" | "campaign" | "reminder" });
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadWorkspace() {
    setWorkspace(await getCommunications(eventSlug));
  }

  async function loadAudience(nextFilters = filters) {
    const rows = await getAudienceSpeakers(eventSlug, nextFilters);
    setSpeakers(rows);
    setSelected((current) => new Set([...current].filter((personId) => rows.some((speaker) => speaker.personId === personId))));
  }

  useEffect(() => {
    Promise.all([
      getCommunications(eventSlug),
      getAudienceSpeakers(eventSlug, { search: "", status: "", taskStatus: "all" }),
    ]).then(([nextWorkspace, nextSpeakers]) => {
      setWorkspace(nextWorkspace);
      setSpeakers(nextSpeakers);
    }).catch((reason: Error) => setError(reason.message));
  }, [eventSlug]);

  const selectedSpeakers = useMemo(() => speakers.filter((speaker) => selected.has(speaker.personId)), [selected, speakers]);
  const previewSpeaker = selectedSpeakers[0] ?? speakers[0];

  function chooseTemplate(template: CommunicationTemplate) {
    setTemplateId(template.id);
    setCompose((current) => ({
      ...current,
      name: template.name,
      subjectTemplate: template.subjectTemplate,
      htmlTemplate: template.htmlTemplate,
      textTemplate: template.textTemplate,
    }));
  }

  async function applyFilters(next: typeof filters) {
    setFilters(next);
    setError(null);
    try { await loadAudience(next); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not filter the audience."); }
  }

  async function saveTemplate() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const current = workspace?.templates.find((template) => template.id === templateId);
      await saveCommunicationTemplate(eventSlug, { ...compose, revision: current?.revision });
      await loadWorkspace();
      setNotice("Template saved as a durable event template.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the template."); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!selectedSpeakers.length) { setError("Select at least one visible speaker recipient."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await queueCampaign(eventSlug, {
        eventId: workspace?.event.id,
        kind: compose.kind,
        name: compose.name,
        templateId,
        recipientPersonIds: selectedSpeakers.map((speaker) => speaker.personId),
        subjectTemplate: compose.subjectTemplate,
        htmlTemplate: compose.htmlTemplate,
        textTemplate: compose.textTemplate,
        mergeDataByPersonId: {},
        audienceSnapshot: { filters, selectedPersonIds: selectedSpeakers.map((speaker) => speaker.personId) },
        idempotencyKey: `organizer-communication:${crypto.randomUUID()}`,
      });
      setNotice(`Queued ${result.recipientCount} recipient deliver${result.recipientCount === 1 ? "y" : "ies"}. Delivery is not claimed until Brevo accepts each attempt.`);
      setSelected(new Set());
      await loadWorkspace();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not queue the communication."); }
    finally { setBusy(false); }
  }

  async function deliveryAction(action: "retry" | "poll", recipientId: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      if (action === "retry") await retryRecipient(eventSlug, recipientId);
      else await pollRecipient(eventSlug, recipientId);
      await loadWorkspace();
      setNotice(action === "retry" ? "Retry queued. The previous attempt remains in history." : "Provider outcomes reconciled.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Delivery action failed."); }
    finally { setBusy(false); }
  }

  if (!workspace) return <p className={styles.loading}>Loading communications…</p>;
  return <div className={styles.workspace}>
    <header className={styles.pageHead}>
      <div><p className={styles.eyebrow}>Engage</p><h1>Communications</h1><p>Reusable templates, precise audiences, and provider-truthful delivery evidence.</p></div>
      <div className={styles.health}><i /><span><strong>Durable delivery</strong><small>Recipient snapshots · attempts · outcomes</small></span></div>
    </header>
    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}

    <section className={styles.nextAction}>
      <i /><div><strong>{speakers.filter((speaker) => speaker.taskProgress.overdue > 0).length} speakers have overdue tasks</strong><p>Filter to overdue, review the exact audience, then queue a targeted reminder.</p></div>
      <button type="button" onClick={() => { const next = { ...filters, taskStatus: "overdue" }; setCompose((current) => ({ ...current, kind: "reminder", name: "Outstanding task reminder", subjectTemplate: "Outstanding tasks for {{ event_name }}", htmlTemplate: "<p>Hello {{first_name}},</p><p>You have outstanding speaker tasks. Please open your portal to complete them.</p>", textTemplate: "Hello {{first_name}}, you have outstanding speaker tasks. Please open your portal to complete them." })); void applyFilters(next); }}>Review audience</button>
    </section>

    <div className={styles.composeGrid}>
      <aside className={styles.templates}>
        <div className={styles.sectionHead}><div><span>Reusable content</span><h2>Templates</h2></div><button type="button" onClick={() => { setTemplateId(undefined); setCompose({ ...starter, kind: "campaign" }); }}>New</button></div>
        {workspace.templates.length ? workspace.templates.map((template) => <button className={template.id === templateId ? styles.activeTemplate : ""} type="button" key={template.id} onClick={() => chooseTemplate(template)}><strong>{template.name}</strong><small>{template.mergeFields.length ? template.mergeFields.map((field) => `{{${field}}}`).join(" · ") : "No merge fields"}</small><em>v{template.revision}</em></button>) : <p className={styles.empty}>Create the first event template.</p>}
      </aside>

      <main className={styles.composer}>
        <div className={styles.sectionHead}><div><span>Campaign composer</span><h2>Message and audience</h2></div><div className={styles.actions}><button type="button" disabled={busy} onClick={() => void saveTemplate()}>Save template</button><button className={styles.primary} type="button" disabled={busy || !selected.size} onClick={() => void send()}>{busy ? "Working…" : `Queue ${selected.size || ""} recipient${selected.size === 1 ? "" : "s"}`}</button></div></div>
        <div className={styles.messageFields}>
          <label>Message name<input value={compose.name} onChange={(event) => setCompose({ ...compose, name: event.target.value })} /></label>
          <label>Kind<select value={compose.kind} onChange={(event) => setCompose({ ...compose, kind: event.target.value as typeof compose.kind })}><option value="campaign">General campaign</option><option value="reminder">Reminder</option><option value="transactional">Portal invitation</option></select></label>
          <label className={styles.wide}>Subject<input value={compose.subjectTemplate} onChange={(event) => setCompose({ ...compose, subjectTemplate: event.target.value })} /></label>
          <label>HTML body<textarea rows={8} value={compose.htmlTemplate} onChange={(event) => setCompose({ ...compose, htmlTemplate: event.target.value })} /></label>
          <label>Plain-text body<textarea rows={8} value={compose.textTemplate} onChange={(event) => setCompose({ ...compose, textTemplate: event.target.value })} /></label>
        </div>
        <div className={styles.mergeHelp}><strong>Merge fields</strong><code>{"{{first_name}}"}</code><code>{"{{recipient_name}}"}</code><code>{"{{event_name}}"}</code><code>{"{{email}}"}</code><span>Unknown or missing values block queueing.</span></div>
        <section className={styles.audience}>
          <div className={styles.sectionHead}><div><span>Selected / filtered speakers</span><h2>Audience</h2></div><button type="button" onClick={() => setSelected(selected.size === speakers.length ? new Set() : new Set(speakers.map((speaker) => speaker.personId)))}>{selected.size === speakers.length && speakers.length ? "Clear visible" : "Select visible"}</button></div>
          <div className={styles.filters}>
            <input aria-label="Search speakers" placeholder="Search name, company or email" value={filters.search} onChange={(event) => void applyFilters({ ...filters, search: event.target.value })} />
            <select aria-label="Speaker status" value={filters.status} onChange={(event) => void applyFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="invited">Invited</option><option value="onboarding">Onboarding</option><option value="ready">Ready</option><option value="withdrawn">Withdrawn</option></select>
            <select aria-label="Task completion" value={filters.taskStatus} onChange={(event) => void applyFilters({ ...filters, taskStatus: event.target.value })}><option value="all">All task states</option><option value="incomplete">Incomplete tasks</option><option value="overdue">Overdue tasks</option><option value="complete">Complete</option></select>
          </div>
          <div className={styles.audienceRows}>{speakers.map((speaker) => <label key={speaker.personId}><input type="checkbox" checked={selected.has(speaker.personId)} disabled={!speaker.email} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(speaker.personId)) next.delete(speaker.personId); else next.add(speaker.personId); return next; })} /><span><strong>{speaker.displayName}</strong><small>{speaker.email ?? "Missing canonical email"} · {speaker.company || "No company"}</small></span><em>{speaker.taskProgress.overdue ? `${speaker.taskProgress.overdue} overdue` : speaker.status}</em></label>)}</div>
        </section>
      </main>

      <aside className={styles.preview}>
        <div className={styles.sectionHead}><div><span>Per-recipient snapshot</span><h2>Preview</h2></div><em>{previewSpeaker?.displayName ?? "No audience"}</em></div>
        {previewSpeaker ? <><h3>{preview(compose.subjectTemplate, previewSpeaker, workspace.event.name)}</h3><iframe title="Rendered email preview" sandbox="" srcDoc={preview(compose.htmlTemplate, previewSpeaker, workspace.event.name)} /><footer>Stored exactly as rendered when queued. Later profile edits do not rewrite delivery evidence.</footer></> : <p className={styles.empty}>Choose a visible recipient to preview personalization.</p>}
      </aside>
    </div>

    <DeliveryLog campaigns={workspace.campaigns} busy={busy} onAction={deliveryAction} />
    <section className={styles.calendarPanel}><div className={styles.sectionHead}><div><span>Speaker calendars</span><h2>Versioned iCalendar artifacts</h2></div><em>{workspace.calendarArtifacts.length} artifacts</em></div>{workspace.calendarArtifacts.length ? workspace.calendarArtifacts.map((artifact) => <div className={styles.calendarRow} key={artifact.id}><span className={styles.method}>{artifact.method}</span><strong>{artifact.filename}</strong><small>Sequence {artifact.sequence} · immutable revision {artifact.revision}</small></div>) : <p className={styles.empty}>Calendar artifacts appear when a placement handoff is consumed.</p>}</section>
  </div>;
}

function DeliveryLog({ campaigns, busy, onAction }: { campaigns: CommunicationCampaign[]; busy: boolean; onAction: (action: "retry" | "poll", recipientId: string) => Promise<void> }) {
  return <section className={styles.logPanel}><div className={styles.sectionHead}><div><span>Provider evidence</span><h2>Campaigns and recipient outcomes</h2></div><em>{campaigns.length} campaigns</em></div>{campaigns.length ? campaigns.map((campaign) => {
    const counts = countStatuses(campaign.recipients);
    return <details className={styles.campaign} key={campaign.id}><summary><Status value={campaign.status} /><span><strong>{campaign.name}</strong><small>{campaign.kind} · {formatDate(campaign.createdAt)}</small></span><em>{campaign.recipients.length} recipients · {counts.delivered} delivered · {counts.failed} failed</em></summary><div className={styles.recipientRows}>{campaign.recipients.map((recipient) => <div key={recipient.id}><Status value={recipient.status} /><span><strong>{recipient.toName}</strong><small>{recipient.toEmail ?? "No email"} · {recipient.renderedSubject}</small><small>{recipient.attempts.length ? recipient.attempts.map((attempt) => `#${attempt.attemptNumber} ${attempt.status}${attempt.providerMessageId ? ` · ${attempt.providerMessageId}` : ""}`).join(" · ") : "Awaiting first attempt"}</small><small>{recipient.providerEvents.length ? `Outcomes: ${recipient.providerEvents.map((event) => event.eventType).join(" → ")}` : "No provider outcome yet"}</small>{recipient.lastErrorMessage ? <b>{recipient.lastErrorMessage}</b> : null}</span><em>{recipient.providerMessageId ?? "No provider ID"}<small>{recipient.attemptCount} attempt{recipient.attemptCount === 1 ? "" : "s"}</small></em><div className={styles.rowActions}>{recipient.status === "accepted" ? <button disabled={busy} type="button" onClick={() => void onAction("poll", recipient.id)}>Poll Brevo</button> : null}{["failed", "bounced", "blocked_external"].includes(recipient.status) ? <button disabled={busy || !recipient.toEmail} type="button" onClick={() => void onAction("retry", recipient.id)}>Retry</button> : null}</div></div>)}</div></details>;
  }) : <p className={styles.empty}>No communications have been queued yet.</p>}</section>;
}

function Status({ value }: { value: string }) { return <i className={`${styles.status} ${styles[value] ?? ""}`}>{humanStatus(value)}</i>; }
function humanStatus(value: string) {
  const labels: Record<string, string> = {
    blocked_external: "Needs email setup",
    partial_failure: "Partially sent",
    accepted: "Sent to provider",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}
function countStatuses(recipients: CommunicationRecipient[]) { return { delivered: recipients.filter((recipient) => recipient.status === "delivered").length, failed: recipients.filter((recipient) => ["failed", "bounced", "blocked_external"].includes(recipient.status)).length }; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function preview(template: string, speaker: AudienceSpeaker, eventName: string) { return template.replace(/{{\s*first_name\s*}}/g, speaker.displayName.split(/\s+/)[0] ?? speaker.displayName).replace(/{{\s*recipient_name\s*}}/g, speaker.displayName).replace(/{{\s*event_name\s*}}/g, eventName).replace(/{{\s*email\s*}}/g, speaker.email ?? ""); }
