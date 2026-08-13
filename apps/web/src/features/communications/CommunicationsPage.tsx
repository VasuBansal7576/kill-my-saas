import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getAudienceSpeakers,
  getCommunicationDetail,
  getCommunicationHistory,
  getCommunicationsSummary,
  pollRecipient,
  queueCampaign,
  retryRecipient,
  saveCommunicationTemplate,
} from "./api";
import styles from "./communications.module.css";
import type {
  AudienceSpeaker,
  CommunicationCampaignSummary,
  CommunicationDetail,
  CommunicationsSummary,
  CommunicationTemplate,
  DeliveryStatus,
} from "./types";

const starter = {
  name: "Speaker update",
  subjectTemplate: "An update for {{ event_name }}",
  htmlTemplate: "<p>Hello {{first_name}},</p><p>We have an update for you.</p>",
  textTemplate: "Hello {{first_name}}, we have an update for you.",
};

type LoadState = "loading" | "ready" | "error";

export function CommunicationsPage() {
  const { eventSlug = "devflow-conf-2027" } = useParams();
  const [summary, setSummary] = useState<CommunicationsSummary | null>(null);
  const [summaryState, setSummaryState] = useState<LoadState>("loading");
  const [speakers, setSpeakers] = useState<AudienceSpeaker[]>([]);
  const [audienceState, setAudienceState] = useState<LoadState>("loading");
  const [campaigns, setCampaigns] = useState<CommunicationCampaignSummary[]>([]);
  const [historyState, setHistoryState] = useState<LoadState>("loading");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommunicationDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({ search: "", status: "", taskStatus: "all" });
  const [compose, setCompose] = useState({ ...starter, kind: "campaign" as "transactional" | "campaign" | "reminder" });
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  const refreshSummary = useCallback(async () => {
    setSummaryState("loading");
    setErrors((current) => ({ ...current, summary: null }));
    try {
      setSummary(await getCommunicationsSummary(eventSlug));
      setSummaryState("ready");
    } catch (reason) {
      setSummaryState("error");
      setErrors((current) => ({ ...current, summary: message(reason, "Could not load communication tools.") }));
    }
  }, [eventSlug]);

  const refreshAudience = useCallback(async (nextFilters = { search: "", status: "", taskStatus: "all" }) => {
    setAudienceState("loading");
    setErrors((current) => ({ ...current, audience: null }));
    try {
      const rows = await getAudienceSpeakers(eventSlug, nextFilters);
      setSpeakers(rows);
      setSelected((current) => new Set([...current].filter((personId) => rows.some((speaker) => speaker.personId === personId))));
      setAudienceState("ready");
    } catch (reason) {
      setAudienceState("error");
      setErrors((current) => ({ ...current, audience: message(reason, "Could not load the speaker audience.") }));
    }
  }, [eventSlug]);

  const refreshHistory = useCallback(async () => {
    setHistoryState("loading");
    setErrors((current) => ({ ...current, history: null }));
    try {
      const page = await getCommunicationHistory(eventSlug);
      setCampaigns(page.campaigns);
      setNextCursor(page.pagination.nextCursor);
      setHistoryHasMore(page.pagination.hasMore);
      setHistoryState("ready");
    } catch (reason) {
      setHistoryState("error");
      setErrors((current) => ({ ...current, history: message(reason, "Could not load send history.") }));
    }
  }, [eventSlug]);

  useEffect(() => {
    void refreshSummary();
    void refreshAudience();
    void refreshHistory();
  }, [refreshAudience, refreshHistory, refreshSummary]);

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
    await refreshAudience(next);
  }

  async function saveTemplate() {
    if (!summary) return;
    setBusy(true); setErrors((current) => ({ ...current, action: null })); setNotice(null);
    try {
      const current = summary.templates.find((template) => template.id === templateId);
      await saveCommunicationTemplate(eventSlug, { ...compose, revision: current?.revision });
      await refreshSummary();
      setNotice("Template saved.");
    } catch (reason) { setErrors((current) => ({ ...current, action: message(reason, "Could not save the template.") })); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!selectedSpeakers.length || !summary) { setErrors((current) => ({ ...current, action: "Select at least one visible speaker recipient." })); return; }
    setBusy(true); setErrors((current) => ({ ...current, action: null })); setNotice(null);
    try {
      const result = await queueCampaign(eventSlug, {
        eventId: summary.event.id,
        kind: compose.kind,
        name: compose.name,
        templateId,
        recipientPersonIds: selectedSpeakers.map((speaker) => speaker.personId),
        subjectTemplate: compose.subjectTemplate,
        htmlTemplate: compose.htmlTemplate,
        textTemplate: compose.textTemplate,
        mergeDataByPersonId: {},
        audienceSnapshot: { type: compose.kind === "reminder" ? "outstanding_tasks" : "speaker_bulk", filters, selectedPersonIds: selectedSpeakers.map((speaker) => speaker.personId) },
        idempotencyKey: `organizer-communication:${crypto.randomUUID()}`,
      });
      setNotice(`${result.recipientCount} message${result.recipientCount === 1 ? " is" : "s are"} queued. This is not a delivery claim; provider outcomes will appear in evidence.`);
      setSelected(new Set());
      await refreshHistory();
    } catch (reason) { setErrors((current) => ({ ...current, action: message(reason, "Could not queue the communication.") })); }
    finally { setBusy(false); }
  }

  async function openCampaign(campaignId: string) {
    if (campaignId === selectedCampaignId && detailState !== "error") { setSelectedCampaignId(null); setDetail(null); return; }
    setSelectedCampaignId(campaignId);
    setDetail(null);
    setDetailState("loading");
    setErrors((current) => ({ ...current, detail: null }));
    try {
      setDetail(await getCommunicationDetail(eventSlug, campaignId));
      setDetailState("ready");
    } catch (reason) {
      setDetailState("error");
      setErrors((current) => ({ ...current, detail: message(reason, "Could not load provider evidence.") }));
    }
  }

  async function deliveryAction(action: "retry" | "poll", recipientId: string) {
    setBusy(true); setErrors((current) => ({ ...current, action: null })); setNotice(null);
    try {
      if (action === "retry") {
        await retryRecipient(eventSlug, recipientId);
        setNotice("Retry queued. The previous attempt and outbox evidence remain visible.");
      } else {
        const receipt = await pollRecipient(eventSlug, recipientId);
        setNotice(receipt.pending
          ? `No delivered receipt yet. ${receipt.proof.explanation}`
          : `${humanStatus(receipt.status)} recorded from provider evidence.`);
      }
      if (selectedCampaignId) setDetail(await getCommunicationDetail(eventSlug, selectedCampaignId));
      await refreshHistory();
    } catch (reason) { setErrors((current) => ({ ...current, action: message(reason, "Delivery action failed.") })); }
    finally { setBusy(false); }
  }

  async function loadMoreHistory() {
    if (!nextCursor || !historyHasMore) return;
    setHistoryState("loading");
    try {
      const page = await getCommunicationHistory(eventSlug, nextCursor);
      setCampaigns((current) => [...current, ...page.campaigns]);
      setNextCursor(page.pagination.nextCursor);
      setHistoryHasMore(page.pagination.hasMore);
      setHistoryState("ready");
    } catch (reason) {
      setHistoryState("error");
      setErrors((current) => ({ ...current, history: message(reason, "Could not load more send history.") }));
    }
  }

  return <div className={styles.workspace}>
    <header className={styles.pageHead}>
      <div><p className={styles.eyebrow}>Engage</p><h1>Communications</h1><p>Reusable templates, precise audiences, and inspectable provider evidence.</p></div>
      <div className={styles.health}><i /><span><strong>Truthful delivery tracking</strong><small>{summary ? `${pendingOutbox(summary)} outbox pending · ${summary.operations.outboxCounts.dispatched ?? 0} dispatched` : "Queued · provider accepted · delivered · failed"}</small></span></div>
    </header>
    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
    {errors.action ? <div className={styles.error} role="alert">{errors.action}</div> : null}

    <section className={styles.nextAction}>
      <i /><div><strong>{audienceState === "ready" ? `${speakers.filter((speaker) => speaker.taskProgress.overdue > 0).length} speakers have overdue tasks` : "Overdue audience loads independently"}</strong><p>Review the exact audience, then queue a targeted reminder. Queue acceptance never appears as delivery.</p></div>
      <button type="button" disabled={audienceState === "loading"} onClick={() => { const next = { ...filters, taskStatus: "overdue" }; setCompose((current) => ({ ...current, kind: "reminder", name: "Outstanding task reminder", subjectTemplate: "Outstanding tasks for {{ event_name }}", htmlTemplate: "<p>Hello {{first_name}},</p><p>You have outstanding speaker tasks. Please open your portal to complete them.</p>", textTemplate: "Hello {{first_name}}, you have outstanding speaker tasks. Please open your portal to complete them." })); void applyFilters(next); }}>Review audience</button>
    </section>

    {summaryState === "error" || !summary ? <LoadPanel state={summaryState} error={errors.summary} label="communication tools" onRetry={refreshSummary} /> : <div className={styles.composeGrid}>
      <aside className={styles.templates}>
        <div className={styles.sectionHead}><div><span>Reusable content</span><h2>Templates</h2></div><button type="button" onClick={() => { setTemplateId(undefined); setCompose({ ...starter, kind: "campaign" }); }}>New</button></div>
        {summary.templates.length ? summary.templates.map((template) => <button className={template.id === templateId ? styles.activeTemplate : ""} type="button" key={template.id} onClick={() => chooseTemplate(template)}><strong>{template.name}</strong><small>{template.mergeFields.length ? template.mergeFields.map((field) => `{{${field}}}`).join(" · ") : "No merge fields"}</small><em>v{template.revision}</em></button>) : <p className={styles.empty}>Create the first event template.</p>}
      </aside>

      <section className={styles.composer}>
        <div className={styles.sectionHead}><div><span>New message</span><h2>Message and audience</h2></div><div className={styles.actions}><button type="button" disabled={busy} onClick={() => void saveTemplate()}>Save template</button><button className={styles.primary} type="button" disabled={busy || !selected.size} onClick={() => void send()}>{busy ? "Working…" : `Queue ${selected.size || 0}`}</button></div></div>
        <div className={styles.messageFields}>
          <label>Message name<input value={compose.name} onChange={(event) => setCompose({ ...compose, name: event.target.value })} /></label>
          <label>Message type<select value={compose.kind} onChange={(event) => setCompose({ ...compose, kind: event.target.value as typeof compose.kind })}><option value="campaign">General update</option><option value="reminder">Reminder</option><option value="transactional">Portal invitation</option></select></label>
          <label className={styles.wide}>Subject<input value={compose.subjectTemplate} onChange={(event) => setCompose({ ...compose, subjectTemplate: event.target.value })} /></label>
          <label className={styles.wide}>Message<textarea rows={10} value={compose.textTemplate} onChange={(event) => setCompose({ ...compose, textTemplate: event.target.value, htmlTemplate: textToSafeHtml(event.target.value) })} /><small>Write plain text here. Paragraphs and line breaks are formatted safely for email.</small></label>
          <details className={`${styles.wide} ${styles.advancedComposer}`}><summary>Advanced HTML</summary><label>HTML source<textarea rows={8} value={compose.htmlTemplate} onChange={(event) => setCompose({ ...compose, htmlTemplate: event.target.value })} /></label><p>Use only for custom email markup. The plain-text snapshot remains retained.</p></details>
        </div>
        <div className={styles.mergeHelp}><strong>Merge fields</strong><code>{"{{first_name}}"}</code><code>{"{{recipient_name}}"}</code><code>{"{{event_name}}"}</code><code>{"{{email}}"}</code><span>Missing values block queueing.</span></div>
        <section className={styles.audience}>
          <div className={styles.sectionHead}><div><span>Selected / filtered speakers</span><h2>Audience</h2></div><button type="button" disabled={audienceState !== "ready"} onClick={() => setSelected(selected.size === speakers.length ? new Set() : new Set(speakers.map((speaker) => speaker.personId)))}>{selected.size === speakers.length && speakers.length ? "Clear visible" : "Select visible"}</button></div>
          <div className={styles.filters}>
            <input aria-label="Search speakers" placeholder="Search name, company or email" value={filters.search} onChange={(event) => void applyFilters({ ...filters, search: event.target.value })} />
            <select aria-label="Speaker status" value={filters.status} onChange={(event) => void applyFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="invited">Invited</option><option value="onboarding">Onboarding</option><option value="ready">Ready</option><option value="withdrawn">Withdrawn</option></select>
            <select aria-label="Task completion" value={filters.taskStatus} onChange={(event) => void applyFilters({ ...filters, taskStatus: event.target.value })}><option value="all">All task states</option><option value="incomplete">Incomplete tasks</option><option value="overdue">Overdue tasks</option><option value="complete">Complete</option></select>
          </div>
          {audienceState === "error" ? <InlineFailure message={errors.audience} onRetry={() => refreshAudience(filters)} /> : audienceState === "loading" ? <p className={styles.loading}>Loading this audience…</p> : <div className={styles.audienceRows}>{speakers.length ? speakers.map((speaker) => <label key={speaker.personId}><input type="checkbox" checked={selected.has(speaker.personId)} disabled={!speaker.email} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(speaker.personId)) next.delete(speaker.personId); else next.add(speaker.personId); return next; })} /><span><strong>{speaker.displayName}</strong><small>{speaker.email ?? "Missing email address"} · {speaker.company || "No company"}</small></span><em>{speaker.taskProgress.overdue ? `${speaker.taskProgress.overdue} overdue` : speaker.status}</em></label>) : <p className={styles.empty}>No speakers match this audience.</p>}</div>}
        </section>
      </section>

      <aside className={styles.preview}>
        <div className={styles.sectionHead}><div><span>Recipient preview</span><h2>Preview</h2></div><em>{previewSpeaker?.displayName ?? "No audience"}</em></div>
        {previewSpeaker ? <><h3>{preview(compose.subjectTemplate, previewSpeaker, summary.event.name)}</h3><iframe title="Rendered email preview" sandbox="" srcDoc={preview(compose.htmlTemplate, previewSpeaker, summary.event.name)} /><footer>This preview is rendered again and retained per recipient when queued.</footer></> : <p className={styles.empty}>Choose a visible recipient to preview personalization.</p>}
      </aside>
    </div>}

    <DeliveryHistory
      campaigns={campaigns}
      state={historyState}
      error={errors.history}
      hasMore={historyHasMore}
      busy={busy}
      selectedCampaignId={selectedCampaignId}
      detail={detail}
      detailState={detailState}
      detailError={errors.detail}
      onOpen={openCampaign}
      onRetryHistory={refreshHistory}
      onLoadMore={loadMoreHistory}
      onDeliveryAction={deliveryAction}
    />

    <section className={styles.calendarPanel}><div className={styles.sectionHead}><div><span>Speaker calendars</span><h2>Versioned iCalendar artifacts</h2></div><em>{summary?.calendarArtifacts.length ?? "—"} artifacts</em></div>{summaryState === "loading" ? <p className={styles.loading}>Loading calendar evidence…</p> : summary?.calendarArtifacts.length ? summary.calendarArtifacts.map((artifact) => <div className={styles.calendarRow} key={artifact.id}><span className={styles.method}>{artifact.method}</span><strong>{artifact.filename}</strong><small>Sequence {artifact.sequence} · immutable revision {artifact.revision}</small></div>) : summaryState === "ready" ? <p className={styles.empty}>No calendar artifacts have been persisted.</p> : <InlineFailure message={errors.summary} onRetry={refreshSummary} />}</section>
  </div>;
}

function DeliveryHistory(props: {
  campaigns: CommunicationCampaignSummary[];
  state: LoadState;
  error?: string | null;
  hasMore: boolean;
  busy: boolean;
  selectedCampaignId: string | null;
  detail: CommunicationDetail | null;
  detailState: LoadState;
  detailError?: string | null;
  onOpen: (campaignId: string) => Promise<void>;
  onRetryHistory: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  onDeliveryAction: (action: "retry" | "poll", recipientId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const visible = props.campaigns.filter((campaign) => {
    const matchesQuery = !query.trim() || `${campaign.name} ${campaign.source.label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesQuery && (sourceFilter === "all" || campaign.source.type === sourceFilter);
  });
  const groups = groupCampaigns(visible);
  const sourceOptions = [...new Map(props.campaigns.map((campaign) => [campaign.source.type, campaign.source.label])).entries()];
  return <section className={styles.logPanel}>
    <div className={styles.sectionHead}><div><span>Provider evidence</span><h2>Messages, workflows, and recipient outcomes</h2></div><em>{visible.length} loaded · paginated history</em></div>
    <p className={styles.truthNote}>Open a campaign, then a recipient, to inspect the rendered snapshot, workflow handoff, provider ID, attempts, webhook outcomes, outbox state, and exact remediation.</p>
    <div className={styles.logFilters}><input type="search" aria-label="Search send history" placeholder="Search loaded message history" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Group send history by workflow" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All workflows</option>{sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {!props.campaigns.length && props.state === "loading" ? <p className={styles.loading}>Loading the first bounded history page…</p> : null}
    {!props.campaigns.length && props.state === "error" ? <InlineFailure message={props.error} onRetry={props.onRetryHistory} /> : null}
    {!props.campaigns.length && props.state === "ready" ? <p className={styles.empty}>No communications have been queued for this event.</p> : null}
    {groups.map(([label, campaigns]) => <section className={styles.historyGroup} key={label}><header><strong>{label}</strong><small>{campaigns.length} loaded record{campaigns.length === 1 ? "" : "s"}</small></header>{campaigns.map((campaign) => <div className={styles.campaignCard} key={campaign.id}>
      <button type="button" className={styles.campaignButton} aria-expanded={props.selectedCampaignId === campaign.id} onClick={() => void props.onOpen(campaign.id)}><Status value={campaign.status} /><span><strong>{campaign.name}</strong><small>{humanKind(campaign.kind)} · {formatDate(campaign.createdAt)}</small></span><em>{recipientCount(campaign)} recipients · {campaign.recipientCounts.delivered ?? 0} delivered · {attentionCount(campaign)} need attention</em></button>
      {props.selectedCampaignId === campaign.id ? props.detailState === "loading" ? <p className={styles.loading}>Loading provider evidence only for this campaign…</p> : props.detailState === "error" ? <InlineFailure message={props.detailError} onRetry={() => props.onOpen(campaign.id)} /> : props.detail ? <CampaignEvidence detail={props.detail} busy={props.busy} onAction={props.onDeliveryAction} /> : null : null}
    </div>)}</section>)}
    {props.campaigns.length ? <div className={styles.pagination}><span>{props.hasMore ? "Older history is available." : "End of retained history."}</span>{props.hasMore ? <button type="button" disabled={props.state === "loading"} onClick={() => void props.onLoadMore()}>{props.state === "loading" ? "Loading…" : "Load older messages"}</button> : null}{props.state === "error" ? <button type="button" onClick={() => void props.onLoadMore()}>Retry older page</button> : null}</div> : null}
  </section>;
}

function CampaignEvidence({ detail, busy, onAction }: { detail: CommunicationDetail; busy: boolean; onAction: (action: "retry" | "poll", recipientId: string) => Promise<void> }) {
  const [recipientId, setRecipientId] = useState(detail.recipients[0]?.id ?? "");
  const recipient = detail.recipients.find((candidate) => candidate.id === recipientId) ?? detail.recipients[0];
  return <div className={styles.evidencePanel}>
    <div className={styles.workflowContext}><div><span>Workflow context</span><strong>{detail.source.label}</strong></div><Link to={detail.source.workflowHref}>Open responsible workflow</Link>{contextEntries(detail.source.context).map(([key, value]) => <small key={key}><b>{humanKey(key)}</b>{value}</small>)}</div>
    <div className={styles.recipientTabs}>{detail.recipients.map((candidate) => <button type="button" className={candidate.id === recipient?.id ? styles.activeRecipient : ""} key={candidate.id} onClick={() => setRecipientId(candidate.id)}><Status value={candidate.status} /><span>{candidate.toName}<small>{candidate.toEmail ?? "No email"}</small></span></button>)}</div>
    {recipient ? <RecipientEvidence recipient={recipient} busy={busy} onAction={onAction} /> : <p className={styles.empty}>This campaign has no recipient records.</p>}
  </div>;
}

function RecipientEvidence({ recipient, busy, onAction }: { recipient: CommunicationDetail["recipients"][number]; busy: boolean; onAction: (action: "retry" | "poll", recipientId: string) => Promise<void> }) {
  return <article className={styles.recipientEvidence}>
    <header><div><span>Truthful provider status</span><Status value={recipient.status} /></div><strong>{recipient.proof.explanation}</strong><small>{recipient.providerMessageId ? `Brevo message ID · ${recipient.providerMessageId}` : "No provider message ID recorded"}</small></header>
    <div className={styles.snapshot}><div><span>Rendered snapshot</span><h3>{recipient.renderedSubject}</h3><pre>{recipient.renderedText}</pre></div><iframe title={`Rendered message for ${recipient.toName}`} sandbox="" srcDoc={recipient.renderedHtml} /></div>
    <div className={styles.evidenceColumns}>
      <section><h4>Outbox and cron handoff</h4>{recipient.outbox.length ? recipient.outbox.map((event) => <div key={event.id}><Status value={event.status} /><span>Dispatch attempts {event.attempts}<small>{event.dispatchedAt ? `Dispatched ${formatDate(event.dispatchedAt)}` : `Available ${formatDate(event.availableAt)}`}{event.lastError ? ` · ${event.lastError}` : ""}</small></span></div>) : <p>No outbox row was found for this retained delivery.</p>}</section>
      <section><h4>Provider attempts</h4>{recipient.attempts.length ? recipient.attempts.map((attempt) => <div key={attempt.id}><Status value={attempt.status} /><span>Attempt {attempt.attemptNumber}<small>{attempt.providerMessageId ?? attempt.failureMessage ?? "In progress"}</small></span></div>) : <p>Awaiting the first provider attempt.</p>}</section>
      <section><h4>Receipts / webhook outcomes</h4>{recipient.providerEvents.length ? recipient.providerEvents.map((event) => <div key={event.id}><Status value={event.eventType} /><span>{event.eventType}<small>{formatDate(event.occurredAt)} · {event.providerEventId}</small></span></div>) : <p>No provider outcome receipt has been recorded.</p>}</section>
    </div>
    <footer><div><strong>{recipient.retry.eligible ? `Eligible for bounded retry attempt ${recipient.retry.nextAttempt}` : "Retry not eligible"}</strong><p>{recipient.retry.remediation}</p></div><div className={styles.rowActions}>{recipient.status === "accepted" ? <button disabled={busy} type="button" onClick={() => void onAction("poll", recipient.id)}>Check provider outcome</button> : null}{recipient.retry.eligible ? <button disabled={busy} type="button" onClick={() => void onAction("retry", recipient.id)}>Retry retained delivery</button> : null}</div></footer>
  </article>;
}

function LoadPanel({ state, error, label, onRetry }: { state: LoadState; error?: string | null; label: string; onRetry: () => Promise<void> }) {
  return <section className={styles.loadPanel}>{state === "loading" ? <p className={styles.loading}>Loading {label}…</p> : <InlineFailure message={error} onRetry={onRetry} />}</section>;
}

function InlineFailure({ message: failure, onRetry }: { message?: string | null; onRetry: () => Promise<void> }) {
  return <div className={styles.inlineFailure} role="alert"><span><strong>Could not load this section.</strong><small>{failure ?? "The request failed without changing delivery state."}</small></span><button type="button" onClick={() => void onRetry()}>Retry</button></div>;
}

function Status({ value }: { value: string }) { return <i className={`${styles.status} ${styles[value] ?? ""}`}>{humanStatus(value)}</i>; }
function humanStatus(value: string) {
  const labels: Record<string, string> = { blocked_external: "Needs email setup", partial_failure: "Partially sent", accepted: "Provider accepted", dispatched: "Dispatched", claimed: "Claimed", pending: "Pending" };
  return labels[value] ?? value.replaceAll("_", " ");
}
function recipientCount(campaign: CommunicationCampaignSummary) { return Object.values(campaign.recipientCounts).reduce((total, count) => total + (count ?? 0), 0); }
function attentionCount(campaign: CommunicationCampaignSummary) { return (["failed", "bounced", "blocked_external"] as DeliveryStatus[]).reduce((total, status) => total + (campaign.recipientCounts[status] ?? 0), 0); }
function humanKind(value: string) { return value === "campaign" ? "General update" : value === "transactional" ? "Transactional" : value === "calendar" ? "Calendar invitation" : "Reminder"; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function preview(template: string, speaker: AudienceSpeaker, eventName: string) { return template.replace(/{{\s*first_name\s*}}/g, speaker.displayName.split(/\s+/)[0] ?? speaker.displayName).replace(/{{\s*recipient_name\s*}}/g, speaker.displayName).replace(/{{\s*event_name\s*}}/g, eventName).replace(/{{\s*email\s*}}/g, speaker.email ?? ""); }
function textToSafeHtml(value: string) { return value.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join(""); }
function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
function groupCampaigns(campaigns: CommunicationCampaignSummary[]) { const grouped = new Map<string, CommunicationCampaignSummary[]>(); for (const campaign of campaigns) grouped.set(campaign.source.label, [...(grouped.get(campaign.source.label) ?? []), campaign]); return [...grouped.entries()]; }
function contextEntries(context: Record<string, unknown>): Array<[string, string]> { return Object.entries(context).flatMap(([key, value]) => value === undefined || value === null || ["selectedPersonIds", "recipients"].includes(key) ? [] : [[key, Array.isArray(value) ? `${value.length} linked record(s)` : typeof value === "object" ? JSON.stringify(value) : String(value)]]); }
function humanKey(value: string) { return `${value.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}: `; }
function pendingOutbox(summary: CommunicationsSummary) { return (summary.operations.outboxCounts.pending ?? 0) + (summary.operations.outboxCounts.claimed ?? 0) + (summary.operations.outboxCounts.failed ?? 0); }
