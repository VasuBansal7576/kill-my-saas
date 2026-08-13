import { useCallback, useEffect, useState } from "react";
import {
  addCrmContact,
  addCrmNote,
  createCrmOutreach,
  enrollCrmContact,
  getCrmContact,
  getCrmDirectory,
  getCrmDuplicates,
  getCrmEvents,
  getCrmMetrics,
  getCrmPipeline,
  getCrmSegments,
  importCrmCsv,
  mergeCrmContacts,
  moveCrmContact,
  openCrmSegment,
  pushCrmContact,
  saveCrmSegment,
  updateCrmContact,
} from "./api";
import styles from "./speaker-crm.module.css";
import type { CrmContact, CrmContactDetail, CrmDuplicateGroup, CrmEvent, CrmFilters, CrmMetrics, CrmPipeline, CrmSegment } from "./types";

type Tab = "pipeline" | "directory" | "segments" | "analytics";
type CrmResource = "directory" | "pipeline" | "segments" | "duplicates" | "metrics" | "events";
type LoadStatus = "loading" | "ready" | "error";
const initialResourceStatus: Record<CrmResource, LoadStatus> = { directory: "loading", pipeline: "loading", segments: "loading", duplicates: "loading", metrics: "loading", events: "loading" };
const emptyFilters: CrmFilters = { search: "", companies: [], jobTitles: [], tags: [], metadata: {} };

export function SpeakerCrmPage({ organizationId }: { organizationId: string }) {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [pipeline, setPipeline] = useState<CrmPipeline | null>(null);
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [duplicates, setDuplicates] = useState<CrmDuplicateGroup[]>([]);
  const [metrics, setMetrics] = useState<CrmMetrics | null>(null);
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [filters, setFilters] = useState<CrmFilters>(emptyFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<CrmContactDetail | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showOutreach, setShowOutreach] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resourceStatus, setResourceStatus] = useState(initialResourceStatus);
  const [resourceErrors, setResourceErrors] = useState<Partial<Record<CrmResource, string>>>({});

  const loadCrmResource = useCallback(async <T,>(resource: CrmResource, request: () => Promise<T>, apply: (value: T) => void) => {
    setResourceStatus((current) => ({ ...current, [resource]: "loading" }));
    setResourceErrors((current) => { const next = { ...current }; delete next[resource]; return next; });
    try {
      const value = await request();
      apply(value);
      setResourceStatus((current) => ({ ...current, [resource]: "ready" }));
    } catch (reason) {
      setResourceErrors((current) => ({ ...current, [resource]: reason instanceof Error ? reason.message : "This Speaker CRM section could not be loaded." }));
      setResourceStatus((current) => ({ ...current, [resource]: "error" }));
    }
  }, []);

  const loadDirectory = useCallback(() => loadCrmResource("directory", () => getCrmDirectory(organizationId, filters), (nextContacts) => {
    setContacts(nextContacts);
    setSelectedIds((current) => new Set([...current].filter((id) => nextContacts.some((contact) => contact.contactId === id))));
  }), [filters, loadCrmResource, organizationId]);
  const loadPipeline = useCallback(() => loadCrmResource("pipeline", () => getCrmPipeline(organizationId), setPipeline), [loadCrmResource, organizationId]);
  const loadSegments = useCallback(() => loadCrmResource("segments", () => getCrmSegments(organizationId), setSegments), [loadCrmResource, organizationId]);
  const loadDuplicates = useCallback(() => loadCrmResource("duplicates", () => getCrmDuplicates(organizationId), setDuplicates), [loadCrmResource, organizationId]);
  const loadMetrics = useCallback(() => loadCrmResource("metrics", () => getCrmMetrics(organizationId), setMetrics), [loadCrmResource, organizationId]);
  const loadEvents = useCallback(() => loadCrmResource("events", () => getCrmEvents(organizationId), setEvents), [loadCrmResource, organizationId]);
  const loadSupportingResources = useCallback(async () => {
    await Promise.all([loadPipeline(), loadSegments(), loadDuplicates(), loadMetrics(), loadEvents()]);
  }, [loadDuplicates, loadEvents, loadMetrics, loadPipeline, loadSegments]);
  const loadAll = useCallback(async () => { await Promise.all([loadDirectory(), loadSupportingResources()]); }, [loadDirectory, loadSupportingResources]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadDirectory());
    return () => cancelAnimationFrame(frame);
  }, [loadDirectory]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadSupportingResources());
    return () => cancelAnimationFrame(frame);
  }, [loadSupportingResources]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : fallback); }
    finally { setBusy(false); }
  }
  async function openContact(contactId: string) { await run(async () => setDetail(await getCrmContact(organizationId, contactId)), "Could not open the contact."); }
  async function importFile(file: File) { await run(async () => { const result = await importCrmCsv(organizationId, await file.text()); setNotice(`${result.imported} contacts imported; ${result.reused} existing people matched.`); await loadAll(); }, "Could not import the CSV."); }
  async function createContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run(async () => { const created = await addCrmContact(organizationId, { displayName: form.get("displayName"), email: form.get("email"), company: form.get("company"), jobTitle: form.get("jobTitle"), biography: form.get("biography"), internalNotes: form.get("internalNotes"), tags: splitList(form.get("tags")), customMetadata: parseMetadata(form.get("metadata")) }); setShowAdd(false); setDetail(created); setNotice("Contact added to the organization speaker directory."); await loadAll(); }, "Could not add the contact.");
  }
  async function saveSegment() {
    const name = window.prompt("Name this reusable segment"); if (!name) return;
    await run(async () => { await saveCrmSegment(organizationId, name, filters); setNotice(`Saved “${name}” as a live reusable segment.`); await loadAll(); }, "Could not save the segment.");
  }
  async function chooseSegment(segmentId: string) { await run(async () => { const opened = await openCrmSegment(organizationId, segmentId); setFilters({ ...emptyFilters, ...opened.segment.filterDefinition }); setContacts(opened.members); setTab("directory"); setNotice(`Opened ${opened.segment.name} with ${opened.members.length} current members.`); }, "Could not open the segment."); }
  async function merge(primaryContactId: string, duplicateContactId: string) { await run(async () => { setDetail(await mergeCrmContacts(organizationId, primaryContactId, duplicateContactId)); setNotice("Contacts merged into the chosen primary profile; alternate emails and history were kept."); await loadAll(); }, "Could not merge the contacts."); }

  const selected = contacts.filter((contact) => selectedIds.has(contact.contactId));
  const supportingIssues = (["duplicates", "events"] as const).filter((resource) => resourceStatus[resource] === "error");
  return <div className={styles.workspace}>
    <header className={styles.pageHead}>
      <div><p className={styles.eyebrow}>Optional extra credit · Organization level</p><h1>Speaker CRM</h1><p>A focused cross-event speaker database—not a generic sales CRM.</p></div>
      <div className={styles.actions}><label className={styles.secondary}>Import CSV<input aria-label="Import organization speaker contacts from a CSV file" hidden type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /></label><button className={styles.primary} type="button" onClick={() => setShowAdd((value) => !value)}>Add contact</button></div>
    </header>
    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}{error ? <div className={styles.error} role="alert">{error}</div> : null}
    {supportingIssues.length ? <div className={styles.supportingWarning} role="status"><span><strong>Some supporting CRM data is unavailable.</strong> {supportingIssues.map((resource) => resource === "duplicates" ? "duplicate suggestions" : "event choices").join(" and ")} did not load, but available CRM sections remain usable.</span><button type="button" onClick={() => void Promise.all([loadDuplicates(), loadEvents()])}>Retry supporting data</button></div> : null}
    {showAdd ? <form className={styles.addPanel} onSubmit={(event) => void createContact(event)}><div className={styles.sectionHead}><div><span>Canonical person</span><h2>Add organization contact</h2></div><button type="button" onClick={() => setShowAdd(false)}>Cancel</button></div><div className={styles.formGrid}><label>Name<input required name="displayName" /></label><label>Email<input required type="email" name="email" /></label><label>Company<input name="company" /></label><label>Job title<input name="jobTitle" /></label><label>Tags<input name="tags" placeholder="AI, Platform" /></label><label>Custom metadata<input name="metadata" placeholder="Topic=Agents, Region=APAC" /></label><label className={styles.wide}>Biography<textarea name="biography" rows={3} /></label><label className={styles.wide}>Internal notes<textarea name="internalNotes" rows={3} /></label></div><button className={styles.primary} disabled={busy}>Save contact</button></form> : null}
    <nav className={styles.tabs} aria-label="Speaker CRM sections">{(["pipeline", "directory", "segments", "analytics"] as Tab[]).map((value) => <button type="button" className={tab === value ? styles.activeTab : ""} onClick={() => setTab(value)} key={value}>{value}<small>{value === "directory" ? contacts.length : value === "segments" ? segments.length : value === "pipeline" ? pipeline?.stages.reduce((sum, stage) => sum + stage.contacts.length, 0) ?? 0 : ""}</small></button>)}</nav>

    {tab === "pipeline" ? <CrmResourceView label="sourcing pipeline" status={resourceStatus.pipeline} error={resourceErrors.pipeline} onRetry={() => void loadPipeline()}><PipelineView pipeline={pipeline} busy={busy} onOpen={openContact} onMove={(contactId, stageId) => void run(async () => { await moveCrmContact(organizationId, contactId, stageId, "Moved from CRM Kanban"); await loadAll(); }, "Could not move the contact.")} /></CrmResourceView> : null}
    {tab === "directory" ? <CrmResourceView label="speaker directory" status={resourceStatus.directory} error={resourceErrors.directory} onRetry={() => void loadDirectory()}><DirectoryView contacts={contacts} filters={filters} selected={selectedIds} duplicates={duplicates} onFilters={setFilters} onSelect={setSelectedIds} onOpen={openContact} onSaveSegment={saveSegment} onMerge={merge} onCompose={() => setShowOutreach(true)} /></CrmResourceView> : null}
    {tab === "segments" ? <CrmResourceView label="saved segments" status={resourceStatus.segments} error={resourceErrors.segments} onRetry={() => void loadSegments()}><SegmentsView segments={segments} onOpen={chooseSegment} /></CrmResourceView> : null}
    {tab === "analytics" ? <CrmResourceView label="organization metrics" status={resourceStatus.metrics} error={resourceErrors.metrics} onRetry={() => void loadMetrics()}><AnalyticsView metrics={metrics} /></CrmResourceView> : null}

    {detail ? <ContactDrawer organizationId={organizationId} contact={detail} events={events} pipeline={pipeline} busy={busy} onClose={() => setDetail(null)} onChanged={async (next, message) => { setDetail(next); setNotice(message); await loadAll(); }} onRun={run} /> : null}
    {showOutreach ? <OutreachDialog organizationId={organizationId} contacts={selected} events={events} busy={busy} onClose={() => setShowOutreach(false)} onRun={run} onQueued={async (count) => { setShowOutreach(false); setSelectedIds(new Set()); setNotice(`Persisted a Communications handoff for ${count} selected contacts. Delivery is not claimed until Communications consumes it.`); await loadAll(); }} /> : null}
  </div>;
}

function CrmResourceView({ label, status, error, onRetry, children }: { label: string; status: LoadStatus; error: string | undefined; onRetry: () => void; children: React.ReactNode }) {
  if (status === "loading") return <div className={styles.loadingState} aria-busy="true" aria-label={`Loading ${label}`}><span /><span /><span /></div>;
  if (status === "error") return <div className={styles.loadError} role="alert"><strong>Could not load {label}.</strong><p>{error ?? "This Speaker CRM section is unavailable."}</p><button className={styles.primary} type="button" onClick={onRetry}>Retry {label}</button></div>;
  return children;
}

function PipelineView({ pipeline, busy, onOpen, onMove }: { pipeline: CrmPipeline | null; busy: boolean; onOpen: (id: string) => Promise<void>; onMove: (contactId: string, stageId: string) => void }) {
  if (!pipeline) return <p className={styles.empty}>Loading sourcing pipeline…</p>;
  return <section className={styles.kanban} aria-label={pipeline.name}>{pipeline.stages.map((stage) => <div className={styles.column} key={stage.id}><header><span>{stage.name}</span><em className={styles[stage.outcome]}>{stage.contacts.length}</em></header><div>{stage.contacts.map((contact) => <article className={styles.pipelineCard} key={contact.contactId}><button type="button" onClick={() => void onOpen(contact.contactId)}><Avatar name={contact.displayName} /><span><strong>{contact.displayName}</strong><small>{[contact.jobTitle, contact.company].filter(Boolean).join(" · ") || contact.email}</small></span></button><div className={styles.tags}>{contact.tags.map((tag) => <i key={tag}>{tag}</i>)}</div><select aria-label={`Move ${contact.displayName}`} value={stage.id} disabled={busy} onChange={(event) => onMove(contact.contactId, event.target.value)}>{pipeline.stages.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></article>)}</div></div>)}</section>;
}

function DirectoryView({ contacts, filters, selected, duplicates, onFilters, onSelect, onOpen, onSaveSegment, onMerge, onCompose }: { contacts: CrmContact[]; filters: CrmFilters; selected: Set<string>; duplicates: CrmDuplicateGroup[]; onFilters: (filters: CrmFilters) => void; onSelect: (selected: Set<string>) => void; onOpen: (id: string) => Promise<void>; onSaveSegment: () => Promise<void>; onMerge: (primary: string, duplicate: string) => Promise<void>; onCompose: () => void }) {
  const companies = unique(contacts.map((contact) => contact.company).filter(Boolean)); const titles = unique(contacts.map((contact) => contact.jobTitle).filter(Boolean)); const tags = unique(contacts.flatMap((contact) => contact.tags));
  function toggleFilter(key: "companies" | "jobTitles" | "tags", value: string) { const current = filters[key]; onFilters({ ...filters, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] }); }
  return <div className={styles.directoryLayout}><section className={styles.directoryPanel}><div className={styles.directoryActions}><div><strong>{contacts.length} contacts</strong><small>{selected.size} selected</small></div><button type="button" onClick={() => onSelect(selected.size === contacts.length ? new Set() : new Set(contacts.map((contact) => contact.contactId)))}>{selected.size === contacts.length && contacts.length ? "Clear visible" : "Select visible"}</button><button type="button" onClick={() => void onSaveSegment()}>Save segment</button><button className={styles.primary} disabled={!selected.size} type="button" onClick={onCompose}>Email selected</button></div><div className={styles.table} role="table"><div className={styles.tableHead} role="row"><span /><span>Contact</span><span>Tags</span><span>Events</span><span>Pipeline</span><span /></div>{contacts.length ? contacts.map((contact) => <div className={styles.tableRow} role="row" key={contact.contactId}><input aria-label={`Select ${contact.displayName}`} type="checkbox" checked={selected.has(contact.contactId)} onChange={() => { const next = new Set(selected); if (next.has(contact.contactId)) next.delete(contact.contactId); else next.add(contact.contactId); onSelect(next); }} /><button className={styles.personButton} type="button" onClick={() => void onOpen(contact.contactId)}><Avatar name={contact.displayName} /><span><strong>{contact.displayName}</strong><small>{contact.email}</small><small>{[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}</small></span></button><span className={styles.tags}>{contact.tags.map((tag) => <i key={tag}>{tag}</i>)}</span><strong>{contact.eventCount}</strong><span>{contact.pipeline?.stageName ?? "Not sourced"}</span><button type="button" aria-label={`Open ${contact.displayName}`} onClick={() => void onOpen(contact.contactId)}>›</button></div>) : <p className={styles.empty}>No contacts match all active filters.</p>}</div></section><aside className={styles.filterPanel}><div className={styles.sectionHead}><div><span>Multi-criteria</span><h2>Directory filters</h2></div><button type="button" onClick={() => onFilters(emptyFilters)}>Clear all</button></div><label>Search<input value={filters.search} onChange={(event) => onFilters({ ...filters, search: event.target.value })} placeholder="Name, email, company, metadata" /></label><FilterGroup label="Company" values={companies} selected={filters.companies} onToggle={(value) => toggleFilter("companies", value)} /><FilterGroup label="Job title" values={titles} selected={filters.jobTitles} onToggle={(value) => toggleFilter("jobTitles", value)} /><FilterGroup label="Tags" values={tags} selected={filters.tags} onToggle={(value) => toggleFilter("tags", value)} />{duplicates.length ? <div className={styles.duplicatePanel}><strong>{duplicates.length} possible duplicate {duplicates.length === 1 ? "group" : "groups"}</strong>{duplicates.map((group) => <div key={group.key}><small>{group.reason}</small>{group.contacts.slice(1).map((duplicate) => <button type="button" key={duplicate.contactId} onClick={() => void onMerge(group.contacts[0]!.contactId, duplicate.contactId)}>Merge {duplicate.email} into {group.contacts[0]!.email}</button>)}</div>)}</div> : null}</aside></div>;
}

function SegmentsView({ segments, onOpen }: { segments: CrmSegment[]; onOpen: (id: string) => Promise<void> }) { return <section className={styles.segmentGrid}>{segments.length ? segments.map((segment) => <button type="button" key={segment.id} onClick={() => void onOpen(segment.id)}><span>Reusable audience</span><strong>{segment.name}</strong><em>{segment.memberCount} current members</em><small>{describeFilters(segment.filterDefinition)}</small></button>) : <p className={styles.empty}>Filter the directory, then save the first reusable segment.</p>}</section>; }
function AnalyticsView({ metrics }: { metrics: CrmMetrics | null }) { if (!metrics) return <p className={styles.empty}>Loading organization metrics…</p>; const max = Math.max(1, ...metrics.contactsByCompany.map((item) => item.count)); return <><section className={styles.metrics}><Metric label="Organization contacts" value={metrics.totalContacts} /><Metric label="With event history" value={metrics.contactsWithEventHistory} /><Metric label="Events represented" value={metrics.representedEvents} /><Metric label="Open sourcing" value={metrics.pipelineOpen} /><Metric label="Confirmed" value={metrics.pipelineWon} /><Metric label="Outreach handoffs" value={metrics.pendingOutreachHandoffs} /></section><div className={styles.analyticsGrid}><section className={styles.chart}><div className={styles.sectionHead}><div><span>Populated widget</span><h2>Contacts by company</h2></div></div>{metrics.contactsByCompany.map((item) => <div className={styles.bar} key={item.label}><span>{item.label}</span><i><b style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }} /></i><strong>{item.count}</strong></div>)}</section><section className={styles.chart}><div className={styles.sectionHead}><div><span>Metadata depth</span><h2>Popular tags</h2></div></div><div className={styles.tagCloud}>{metrics.popularTags.map((item) => <span key={item.label}>{item.label}<strong>{item.count}</strong></span>)}</div></section></div></>; }

function ContactDrawer({ organizationId, contact, events, pipeline, busy, onClose, onChanged, onRun }: { organizationId: string; contact: CrmContactDetail; events: CrmEvent[]; pipeline: CrmPipeline | null; busy: boolean; onClose: () => void; onChanged: (contact: CrmContactDetail, message: string) => Promise<void>; onRun: (action: () => Promise<void>, fallback: string) => Promise<void> }) {
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await onRun(async () => onChanged(await updateCrmContact(organizationId, contact.contactId, { displayName: form.get("displayName"), company: form.get("company"), jobTitle: form.get("jobTitle"), biography: form.get("biography"), internalNotes: form.get("internalNotes"), tags: splitList(form.get("tags")), customMetadata: parseMetadata(form.get("metadata")), expectedRevision: contact.revision }), "Profile, notes, tags, and metadata persisted."), "Could not update the contact."); }
  async function note(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const body = String(form.get("body") ?? ""); await onRun(async () => { await onChanged(await addCrmNote(organizationId, contact.contactId, body), "Timestamped internal note added."); formElement.reset(); }, "Could not add the note."); }
  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={styles.drawer} aria-label={`${contact.displayName} CRM profile`}><header><div className={styles.identity}><Avatar name={contact.displayName} /><span><h2>{contact.displayName}</h2><small>{contact.aliases.join(" · ")}</small></span></div><button type="button" aria-label={`Close ${contact.displayName} profile`} onClick={onClose}>×</button></header><div className={styles.drawerActions}>{contact.pipeline ? <label>Pipeline stage<select value={contact.pipeline.stageId} disabled={busy} onChange={(event) => void onRun(async () => onChanged(await moveCrmContact(organizationId, contact.contactId, event.target.value, "Moved from contact profile"), "Pipeline stage and timestamped history persisted."), "Could not move the contact.")}>{pipeline?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label> : <button type="button" disabled={busy} onClick={() => void onRun(async () => onChanged(await enrollCrmContact(organizationId, contact.contactId), "Contact enrolled in the sourcing pipeline."), "Could not enroll the contact.")}>Enroll in pipeline</button>}<label>Push to event<select defaultValue="" disabled={busy} onChange={(event) => { const eventId = event.target.value; if (!eventId) return; void onRun(async () => { const result = await pushCrmContact(organizationId, contact.contactId, eventId); await onChanged(await getCrmContact(organizationId, contact.contactId), result.idempotent ? "Canonical event speaker already existed; idempotent handoff reused it." : "Canonical person, profile, membership, and event speaker linked."); }, "Could not push the contact to the event."); }}><option value="">Choose event…</option>{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><form className={styles.profileForm} onSubmit={(event) => void save(event)}><div className={styles.formGrid}><label>Name<input name="displayName" defaultValue={contact.displayName} /></label><label>Company<input name="company" defaultValue={contact.company} /></label><label>Job title<input name="jobTitle" defaultValue={contact.jobTitle} /></label><label>Tags<input name="tags" defaultValue={contact.tags.join(", ")} /></label><label className={styles.wide}>Custom metadata<input name="metadata" defaultValue={Object.entries(contact.customMetadata).map(([key, value]) => `${key}=${value}`).join(", ")} /></label><label className={styles.wide}>Biography<textarea rows={4} name="biography" defaultValue={contact.biography} /></label><label className={styles.wide}>Internal summary<textarea rows={4} name="internalNotes" defaultValue={contact.internalNotes} /></label></div><button className={styles.primary} disabled={busy}>Save CRM profile</button></form><DrawerSection title="Cross-event history" count={contact.eventHistory.length}>{contact.eventHistory.length ? contact.eventHistory.map((item) => <article className={styles.historyCard} key={item.eventSpeakerId}><strong>{item.eventName}</strong><small>{item.status} · {item.sessions.length} sessions</small>{item.sessions.map((session) => <p key={session.id}>{session.title} · {session.role}</p>)}</article>) : <p className={styles.empty}>No event speaker handoff yet.</p>}</DrawerSection><DrawerSection title="Sourcing stage history" count={contact.stageHistory.length}>{contact.stageHistory.map((item) => <article className={styles.timeline} key={item.id}><i /><span><strong>{item.fromStage ? `${item.fromStage} → ` : ""}{item.toStage}</strong><small>{item.movedBy} · {formatDate(item.createdAt)}</small>{item.note ? <p>{item.note}</p> : null}</span></article>)}</DrawerSection><DrawerSection title="Internal notes" count={contact.notes.length}><form className={styles.noteForm} onSubmit={(event) => void note(event)}><textarea required name="body" rows={2} placeholder="Add a timestamped organizer-only note" /><button disabled={busy}>Add note</button></form>{contact.notes.map((item) => <article className={styles.note} key={item.id}><p>{item.body}</p><small>{item.authorName} · {formatDate(item.createdAt)}</small></article>)}</DrawerSection></aside></div>;
}

function OutreachDialog({ organizationId, contacts, events, busy, onClose, onRun, onQueued }: { organizationId: string; contacts: CrmContact[]; events: CrmEvent[]; busy: boolean; onClose: () => void; onRun: (action: () => Promise<void>, fallback: string) => Promise<void>; onQueued: (count: number) => Promise<void> }) {
  const [message, setMessage] = useState({ name: "Speaker sourcing outreach", subjectTemplate: "An invitation for {{recipient_name}}", htmlTemplate: "<p>Hello {{recipient_name}},</p><p>We would love to discuss an upcoming program.</p>", textTemplate: "Hello {{recipient_name}}, we would love to discuss an upcoming program." }); const preview = contacts[0];
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  async function submit(event: React.FormEvent) { event.preventDefault(); await onRun(async () => { const handoff = await createCrmOutreach(organizationId, { ...message, eventId, contactIds: contacts.map((contact) => contact.contactId), idempotencyKey: `crm-outreach:${crypto.randomUUID()}` }); await onQueued(handoff.recipientPersonIds.length); }, "Could not create the outreach handoff."); }
  return <div className={styles.backdrop}><form className={styles.outreach} onSubmit={(event) => void submit(event)}><header><div><span>New message</span><h2>Email {contacts.length} selected contacts</h2></div><button type="button" aria-label="Close email composer" onClick={onClose}>×</button></header><div className={styles.outreachGrid}><section><label>Target event<select required value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Choose event…</option>{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Message name<input value={message.name} onChange={(event) => setMessage({ ...message, name: event.target.value })} /></label><label>Subject<input value={message.subjectTemplate} onChange={(event) => setMessage({ ...message, subjectTemplate: event.target.value })} /></label><label>HTML body<textarea rows={7} value={message.htmlTemplate} onChange={(event) => setMessage({ ...message, htmlTemplate: event.target.value })} /></label><label>Plain text<textarea rows={5} value={message.textTemplate} onChange={(event) => setMessage({ ...message, textTemplate: event.target.value })} /></label></section><aside><span>Personalized preview</span><strong>{preview ? personalize(message.subjectTemplate, preview) : "No recipient"}</strong><div>{preview ? personalize(message.htmlTemplate, preview).replace(/<[^>]+>/g, " ") : ""}</div><small>The CRM persists the exact selected audience, target event, and message request. Communications owns rendering, provider delivery, and outcome logs.</small></aside></div><footer><button type="button" onClick={onClose}>Cancel</button><button className={styles.primary} disabled={busy || !contacts.length || !eventId}>{busy ? "Persisting…" : "Create email handoff"}</button></footer></form></div>;
}

function FilterGroup({ label, values, selected, onToggle }: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void }) { return <fieldset><legend>{label}</legend>{values.slice(0, 12).map((value) => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />{value}</label>)}</fieldset>; }
function DrawerSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <section className={styles.drawerSection}><div className={styles.sectionHead}><div><span>{count} records</span><h2>{title}</h2></div></div>{children}</section>; }
function Metric({ label, value }: { label: string; value: number }) { return <article><small>{label}</small><strong>{value}</strong></article>; }
function Avatar({ name }: { name: string }) { return <i className={styles.avatar}>{name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</i>; }
function splitList(value: FormDataEntryValue | null) { return String(value ?? "").split(/[,|;]/).map((item) => item.trim()).filter(Boolean); }
function parseMetadata(value: FormDataEntryValue | null) { return Object.fromEntries(splitList(value).flatMap((item) => { const index = item.indexOf("="); return index > 0 ? [[item.slice(0, index).trim(), item.slice(index + 1).trim()]] : []; })); }
function unique(values: string[]) { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function describeFilters(filters: Partial<CrmFilters>) { return [filters.search, ...(filters.companies ?? []), ...(filters.jobTitles ?? []), ...(filters.tags ?? [])].filter(Boolean).join(" · ") || "All organization contacts"; }
function personalize(template: string, contact: CrmContact) { return template.replace(/{{\s*recipient_name\s*}}/g, contact.displayName).replace(/{{\s*first_name\s*}}/g, contact.displayName.split(/\s+/)[0] ?? contact.displayName).replace(/{{\s*email\s*}}/g, contact.email ?? ""); }
