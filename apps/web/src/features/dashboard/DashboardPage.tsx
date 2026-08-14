import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadDashboard } from "./api";
import styles from "./dashboard.module.css";
import type { DashboardSnapshot } from "./types";

type WorkItem = { tone: "danger" | "warning" | "violet" | "success"; code: string; title: string; detail: string; label: string; to: string };

export function DashboardPage() {
  const { eventSlug = "" } = useParams();
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadDashboard(eventSlug)
      .then((result) => {
        if (active) {
          setError(null);
          setDashboard(result);
        }
      })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "The dashboard could not be loaded."); });
    return () => { active = false; };
  }, [eventSlug]);

  const work = useMemo(() => dashboard ? buildWorkQueue(dashboard) : [], [dashboard]);
  if (!dashboard) return <section className={styles.loading} aria-live="polite">{error ?? "Loading your event dashboard…"}</section>;

  const base = `/organizer/events/${encodeURIComponent(eventSlug)}`;
  const maxTrend = Math.max(1, ...dashboard.cfp.submittedTrend.map((point) => point.count));
  const speakerRate = percent(dashboard.speakers.ready, dashboard.speakers.accepted);
  const contentRate = percent(dashboard.deliverables.approved, dashboard.deliverables.total);

  return <div className={styles.workspace}>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>Event operations</p><h1>{dashboard.event.name}</h1><p>Real work and readiness signals that need an organizer’s attention.</p></div>
      <div className={styles.freshness}><i /><span><strong>Live from event data</strong><small>Updated {relativeTime(dashboard.generatedAt)}</small></span></div>
    </header>

    <section className={styles.metrics} aria-label="Event lifecycle metrics">
      <Metric label="Submissions" value={dashboard.cfp.submitted} note={`${dashboard.cfp.drafts} drafts · CFP ${label(dashboard.cfp.status)}`} to={`${base}/submissions`} />
      <Metric label="Reviews complete" value={`${dashboard.reviews.percentComplete}%`} note={`${dashboard.reviews.outstanding} outstanding · ${dashboard.reviews.activeConflicts} conflicts`} to={`${base}/evaluations`} progress={dashboard.reviews.percentComplete} danger={dashboard.reviews.activeConflicts > 0} />
      <Metric label="Pending decisions" value={dashboard.decisions.undecided} note={`${dashboard.decisions.notificationPending} decided but not notified`} to={`${base}/submissions`} danger={dashboard.decisions.undecided > 0} />
      <Metric label="Accepted speakers" value={`${dashboard.speakers.ready}/${dashboard.speakers.accepted}`} note={`${dashboard.speakers.needingAttention} need onboarding attention`} to={`${base}/speakers`} progress={speakerRate} danger={dashboard.speakers.tasks.overdue > 0} />
      <Metric label="Deliverables approved" value={`${dashboard.deliverables.approved}/${dashboard.deliverables.total}`} note={`${dashboard.deliverables.overdue} overdue · ${dashboard.deliverables.awaitingReview} awaiting review`} to={`${base}/files`} progress={contentRate} danger={dashboard.deliverables.overdue > 0} />
      <Metric label="Undelivered communications" value={dashboard.communications.undelivered} note={`${dashboard.communications.inFlight} in flight · ${dashboard.communications.failed} failed`} to={`${base}/communications`} danger={dashboard.communications.undelivered > 0} />
      <Metric label="Agenda readiness" value={`${dashboard.agenda.percentReady}%`} note={`${dashboard.agenda.unscheduled} unscheduled · ${dashboard.agenda.conflicts} conflicts`} to={`${base}/agenda`} progress={dashboard.agenda.percentReady} danger={dashboard.agenda.conflicts > 0} />
      <Metric label="Integration failures" value={dashboard.integrations.failures} note={dashboard.integrations.providers.length ? dashboard.integrations.providers.map((item) => `${label(item.provider)} ${label(item.status)}`).join(" · ") : "Latest provider runs are clear"} to={`${base}/integrations/airtable`} danger={dashboard.integrations.failures > 0} good={dashboard.integrations.failures === 0} />
    </section>

    <div className={styles.primaryGrid}>
      <section className={styles.panel}>
        <div className={styles.sectionHead}><div><h2>Your work</h2><p>Prioritized by program impact</p></div><span>{work.length} action{work.length === 1 ? "" : "s"}</span></div>
        <div className={styles.workList}>
          {work.length ? work.map((item) => <Link className={styles.workItem} data-tone={item.tone} to={item.to} key={`${item.code}:${item.title}`}>
            <span className={styles.workCode}>{item.code}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><em>{item.label} →</em>
          </Link>) : <div className={styles.calm}><span>✓</span><div><strong>No blocking work</strong><small>Every current readiness check is clear.</small></div></div>}
        </div>
      </section>

      <aside className={styles.panel}>
        <div className={styles.sectionHead}><div><h2>Program lifecycle</h2><p>From call for speakers to public program</p></div><span className={dashboard.publication.state === "live" && work.length === 0 ? styles.good : undefined}>{work.length === 0 ? "Healthy" : "Needs attention"}</span></div>
        <Lifecycle label={`CFP ${label(dashboard.cfp.status)}`} value={dashboard.cfp.forms ? (dashboard.cfp.status === "closed" ? 100 : dashboard.cfp.status === "open" ? 70 : 30) : 0} note={`${dashboard.cfp.submitted} submissions`} />
        <Lifecycle label="Reviews" value={dashboard.reviews.percentComplete} note={`${dashboard.reviews.completed}/${Math.max(0, dashboard.reviews.assigned - dashboard.reviews.recused)} completed`} />
        <Lifecycle label="Speaker onboarding" value={speakerRate} note={`${dashboard.speakers.tasks.overdue} tasks overdue`} />
        <Lifecycle label="Program content" value={contentRate} note={`${dashboard.deliverables.outstanding} deliverables outstanding`} />
        <Lifecycle label="Agenda" value={dashboard.agenda.percentReady} note={`${dashboard.agenda.conflicts} conflicts`} />
        <div className={styles.publicationLine}><span>Public program</span><strong data-live={dashboard.publication.state === "live"}>{label(dashboard.publication.state)}</strong></div>
      </aside>
    </div>

    <div className={styles.secondaryGrid}>
      <section className={styles.panel}>
        <div className={styles.sectionHead}><div><h2>Submission momentum</h2><p>Proposals submitted in the last 14 UTC days</p></div><strong>{dashboard.cfp.submittedTrend.reduce((sum, point) => sum + point.count, 0)}</strong></div>
        <div className={styles.trend} role="img" aria-label={`Submission trend: ${dashboard.cfp.submittedTrend.map((point) => `${shortDate(point.day)} ${point.count}`).join(", ")}`}>
          {dashboard.cfp.submittedTrend.map((point) => <div className={styles.trendColumn} key={point.day} title={`${shortDate(point.day)} · ${point.count} submissions`}><span style={{ height: `${Math.max(point.count ? 8 : 2, (point.count / maxTrend) * 100)}%` }} /><small>{shortDay(point.day)}</small></div>)}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHead}><div><h2>Speaker onboarding</h2><p>Task progress from speaker portal completions</p></div><Link to={`${base}/speakers`}>Open roster</Link></div>
        <div className={styles.attentionList}>
          {dashboard.speakers.attention.length ? dashboard.speakers.attention.map((speaker) => <Link to={`${base}/speakers`} key={speaker.eventSpeakerId}><span className={styles.avatar}>{initials(speaker.displayName)}</span><span><strong>{speaker.displayName}</strong><small>{speaker.completed}/{speaker.total} tasks complete</small></span>{speaker.overdue ? <em>{speaker.overdue} overdue</em> : <em>{speaker.total - speaker.completed} left</em>}</Link>) : <div className={styles.empty}>No speaker has an incomplete assigned task.</div>}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHead}><div><h2>Communication outcomes</h2><p>Delivery status for every recipient</p></div><Link to={`${base}/communications`}>Open center</Link></div>
        <div className={styles.outcomes}>
          <Outcome label="Delivered" value={dashboard.communications.successful} tone="success" />
          <Outcome label="In flight" value={dashboard.communications.inFlight} tone="violet" />
          <Outcome label="Failed / bounced" value={dashboard.communications.failed} tone="danger" />
        </div>
      </section>
    </div>

    <section className={styles.activityPanel}>
      <div className={styles.sectionHead}><div><h2>Recent activity</h2><p>Latest changes across your event</p></div><span>{dashboard.activity.length} events</span></div>
      <div className={styles.activityList}>{dashboard.activity.length ? dashboard.activity.map((activity) => <article key={activity.id} data-kind={activity.kind}><i /><span><strong>{activity.title}</strong><small>{activity.detail}</small></span><time dateTime={activity.occurredAt}>{relativeTime(activity.occurredAt)}</time></article>) : <div className={styles.empty}>Activity will appear as your team works on the event.</div>}</div>
    </section>
  </div>;
}

function Metric(props: { label: string; value: string | number; note: string; to: string; progress?: number; danger?: boolean; good?: boolean }) {
  return <Link className={styles.metric} to={props.to}><span>{props.label}</span><strong className={props.danger ? styles.danger : props.good ? styles.good : undefined}>{props.value}</strong><small>{props.note}</small>{props.progress !== undefined ? <i className={styles.metricProgress}><b style={{ width: `${clamp(props.progress)}%` }} /></i> : null}</Link>;
}

function Lifecycle({ label: text, value, note }: { label: string; value: number; note: string }) {
  return <div className={styles.lifecycle}><div><strong>{text}</strong><em>{clamp(value)}%</em></div><i><b style={{ width: `${clamp(value)}%` }} /></i><small>{note}</small></div>;
}

function Outcome({ label: text, value, tone }: { label: string; value: number; tone: "success" | "violet" | "danger" }) {
  return <article data-tone={tone}><span>{text}</span><strong>{value}</strong></article>;
}

function buildWorkQueue(data: DashboardSnapshot): WorkItem[] {
  const base = `/organizer/events/${encodeURIComponent(data.event.slug)}`;
  const items: WorkItem[] = [];
  if (data.cfp.forms === 0) items.push({ tone: "warning", code: "CF", title: "Create your call for speakers", detail: "Add the questions, dates, tracks, and formats speakers need before sharing the call.", label: "Set up CFP", to: `${base}/cfp` });
  else if (data.cfp.status === "draft") items.push({ tone: "warning", code: "CF", title: "Publish your call for speakers", detail: "The form exists, but speakers cannot submit until you publish it.", label: "Review & publish", to: `${base}/cfp` });
  else if (data.cfp.status === "open" && data.cfp.submitted === 0) items.push({ tone: "success", code: "CF", title: "Your call for speakers is open", detail: "Share the public link to start collecting proposals.", label: "Open public form", to: `/cfp/${encodeURIComponent(data.event.slug)}` });
  if (data.agenda.conflicts > 0 || data.agenda.unscheduled > 0) items.push({ tone: "danger", code: "AG", title: data.agenda.conflicts ? `Resolve ${data.agenda.conflicts} agenda conflict${data.agenda.conflicts === 1 ? "" : "s"}` : `Place ${data.agenda.unscheduled} unscheduled session${data.agenda.unscheduled === 1 ? "" : "s"}`, detail: `Scheduling revision ${data.agenda.revisionVersion ?? "not created"} · ${data.agenda.scheduled}/${data.agenda.sessions} sessions placed`, label: "Open scheduler", to: `${base}/agenda` });
  if (data.speakers.tasks.overdue > 0 || data.deliverables.overdue > 0) items.push({ tone: "warning", code: "CT", title: `${data.speakers.tasks.overdue + data.deliverables.overdue} overdue onboarding item${data.speakers.tasks.overdue + data.deliverables.overdue === 1 ? "" : "s"}`, detail: `${data.speakers.tasks.overdue} general tasks · ${data.deliverables.overdue} deliverables`, label: "Review files", to: `${base}/files` });
  const incompleteTasks = data.speakers.tasks.total - data.speakers.tasks.completed;
  if (incompleteTasks > data.speakers.tasks.overdue) items.push({ tone: "warning", code: "TK", title: `${incompleteTasks} incomplete speaker task${incompleteTasks === 1 ? "" : "s"}`, detail: `${data.speakers.tasks.overdue} overdue · ${data.speakers.needingAttention} speakers need attention`, label: "Open tasks", to: `${base}/tasks` });
  if (data.deliverables.outstanding > data.deliverables.overdue) items.push({ tone: "warning", code: "FL", title: `${data.deliverables.outstanding} missing or unapproved deliverable${data.deliverables.outstanding === 1 ? "" : "s"}`, detail: `${data.deliverables.missing} not uploaded · ${data.deliverables.awaitingReview} awaiting review · ${data.deliverables.changesRequested} changes requested`, label: "Open files", to: `${base}/files` });
  if (data.reviews.outstanding > 0 || data.reviews.activeConflicts > 0) items.push({ tone: "violet", code: "RV", title: `${data.reviews.outstanding} review${data.reviews.outstanding === 1 ? "" : "s"} incomplete`, detail: `${data.reviews.activeConflicts} active conflict${data.reviews.activeConflicts === 1 ? "" : "s"} · ${data.reviews.percentComplete}% complete`, label: "Open review desk", to: `${base}/evaluations` });
  if (data.decisions.undecided > 0) items.push({ tone: "violet", code: "DC", title: `Decide ${data.decisions.undecided} submitted proposal${data.decisions.undecided === 1 ? "" : "s"}`, detail: `${data.decisions.accepted} accepted · ${data.decisions.rejected} rejected`, label: "Open decisions", to: `${base}/submissions` });
  if (data.decisions.notificationPending > 0) items.push({ tone: "warning", code: "DN", title: `Notify ${data.decisions.notificationPending} decided submitter${data.decisions.notificationPending === 1 ? "" : "s"}`, detail: "A recorded decision is not complete until its notification handoff is visible.", label: "Open decisions", to: `${base}/submissions` });
  if (data.communications.failed > 0) items.push({ tone: "danger", code: "CM", title: `Inspect ${data.communications.failed} failed communication${data.communications.failed === 1 ? "" : "s"}`, detail: `${data.communications.successful} delivered recipient outcomes`, label: "Open outcomes", to: `${base}/communications` });
  else if (data.communications.undelivered > 0) items.push({ tone: "violet", code: "CM", title: `${data.communications.undelivered} communication${data.communications.undelivered === 1 ? " is" : "s are"} not delivered`, detail: `${data.communications.inFlight} queued, sending, or provider accepted`, label: "Track delivery", to: `${base}/communications` });
  for (const integration of data.integrations.providers) items.push({ tone: "danger", code: "IN", title: `${label(integration.provider)} ${label(integration.status)}`, detail: `${integration.failedItems} failed item${integration.failedItems === 1 ? "" : "s"} in the latest run`, label: "Inspect evidence", to: `${base}/integrations/${integration.provider}` });
  if (data.publication.state !== "live" && data.agenda.conflicts === 0 && data.agenda.unscheduled === 0 && data.agenda.sessions > 0) items.push({ tone: "success", code: "PB", title: data.publication.state === "paused" ? "Resume the public program" : "Publish the program", detail: `${data.agenda.scheduled} scheduled sessions are ready for the publication gate`, label: "Preview & publish", to: `${base}/publish` });
  return items;
}

function percent(part: number, total: number) { return total === 0 ? 0 : Math.round((part / total) * 100); }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function label(value: string) { return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function shortDate(day: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)); }
function shortDay(day: string) { return new Intl.DateTimeFormat(undefined, { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)); }
function relativeTime(value: string) {
  const delta = Date.now() - Date.parse(value);
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
