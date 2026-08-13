import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AccessibleDialog } from "../../app/AccessibleDialog";
import { formatEventDateRange, formatEventDateTime } from "../../app/event-time";
import { publicProgramRequest } from "./api";
import {
  filterSessions,
  filterSpeakers,
  biographyForDisplay,
  formatDay,
  formatRange,
  initials,
  optimisticItinerarySelection,
  sessionsAtTime,
  sessionsByStart,
  startTimes,
  type PublicFilters,
} from "./model";
import type { PublishedProgram, PublicSession, PublicSpeaker, PublicSurface } from "./types";
import "./public-program.css";

const surfaces: Array<{ key: PublicSurface; label: string }> = [
  { key: "sessions", label: "Sessions" },
  { key: "speakers", label: "Speakers" },
  { key: "agenda", label: "Agenda" },
  { key: "itinerary", label: "My itinerary" },
  { key: "gallery", label: "Speaker gallery" },
];

const initialFilters: PublicFilters = { search: "", trackId: "", formatId: "", roomId: "" };

export function PublicSessionsPage() { return <PublicProgramPage surface="sessions" />; }
export function PublicSpeakersPage() { return <PublicProgramPage surface="speakers" />; }
export function PublicAgendaPage() { return <PublicProgramPage surface="agenda" />; }
export function PublicItineraryPage() { return <PublicProgramPage surface="itinerary" />; }
export function PublicSpeakerGalleryPage() { return <PublicProgramPage surface="gallery" />; }

export function PublicProgramPage({ surface }: { surface: PublicSurface }) {
  const { eventSlug = "" } = useParams();
  const [program, setProgram] = useState<PublishedProgram | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [activeDay, setActiveDay] = useState("");
  const [selectedSession, setSelectedSession] = useState<PublicSession | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<PublicSpeaker | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedItineraryIds, setSelectedItineraryIds] = useState<Set<string>>(() => new Set());
  const [showPersonal, setShowPersonal] = useState(false);
  const [itineraryBusyId, setItineraryBusyId] = useState<string | null>(null);
  const [itineraryLoading, setItineraryLoading] = useState(surface === "itinerary");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void publicProgramRequest<PublishedProgram>(`/api/v1/public/program/${encodeURIComponent(eventSlug)}`)
      .then((result) => {
        if (!active) return;
        setProgram(result);
        setActiveDay(result.days[0] ?? "");
      })
      .catch((caught: unknown) => { if (active) setError(message(caught)); });
    return () => { active = false; };
  }, [eventSlug]);

  useEffect(() => {
    if (surface !== "itinerary" || !program) return;
    let active = true;
    const recoveryKey = `programflow-itinerary-recovery:${program.event.id}`;
    const recovery = window.localStorage.getItem(recoveryKey);
    void publicProgramRequest<{ selectedSessionIds: string[]; recoveryToken: string | null }>(
      `/api/v1/public/program/${encodeURIComponent(eventSlug)}/anonymous-itinerary`,
      { headers: recovery ? { "x-itinerary-recovery": recovery } : undefined },
    ).then((result) => {
      if (!active) return;
      if (result.recoveryToken) window.localStorage.setItem(recoveryKey, result.recoveryToken);
      setSelectedItineraryIds(new Set(result.selectedSessionIds));
      setItineraryLoading(false);
    }).catch((caught: unknown) => { if (active) { setError(message(caught)); setItineraryLoading(false); } });
    return () => { active = false; };
  }, [eventSlug, program, surface]);

  const filteredSessions = useMemo(() => program ? filterSessions(program, filters) : [], [filters, program]);
  const filteredSpeakers = useMemo(() => program ? filterSpeakers(program, filters.search) : [], [filters.search, program]);

  async function toggleItinerary(sessionId: string) {
    const previous = selectedItineraryIds;
    const optimistic = optimisticItinerarySelection(previous, sessionId);
    setSelectedItineraryIds(optimistic.next);
    setItineraryBusyId(sessionId);
    setError(null);
    try {
      const response = await publicProgramRequest<{ selectedSessionIds: string[] }>(
        `/api/v1/public/program/${encodeURIComponent(eventSlug)}/anonymous-itinerary/sessions/${sessionId}`,
        { method: optimistic.method },
      );
      setSelectedItineraryIds(new Set(response.selectedSessionIds));
    } catch (caught) {
      setSelectedItineraryIds(previous);
      setError(message(caught));
    } finally {
      setItineraryBusyId(null);
    }
  }

  function toggleExpanded(sessionId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  if (!program) {
    return <div className="public-program loading"><p>{error ?? "Loading the live program…"}</p></div>;
  }

  const visibleItinerary = showPersonal
    ? sessionsByStart(filteredSessions.filter((session) => selectedItineraryIds.has(session.id)))
    : sessionsByStart(filteredSessions);
  const day = program.days.includes(activeDay) ? activeDay : program.days[0] ?? "";

  return <div className="public-program" style={{ "--event-color": program.event.branding.primaryColor } as CSSProperties}>
    <header className="public-program-head">
      <div className="public-brand">
        {program.event.branding.logoUrl ? <img src={program.event.branding.logoUrl} alt="" /> : <span>{initials(program.event.name)}</span>}
        <div><p>Public event program</p><h1>{program.event.name}</h1><small>{dateSpan(program)} · {program.event.location}</small></div>
      </div>
      <span className="public-live"><i /> Live</span>
    </header>

    <nav className="public-program-nav" aria-label="Public program views">
      {surfaces.map((item) => <Link key={item.key} className={surface === item.key ? "active" : ""} aria-current={surface === item.key ? "page" : undefined} to={`/program/${eventSlug}/${item.key === "gallery" ? "speaker-gallery" : item.key}`}>{item.label}</Link>)}
    </nav>

    <main id="main-content" className="public-program-main">
      <div className="public-title-row">
        <div><p>{surfaceLabel(surface)}</p><h2>{surfaceTitle(surface)}</h2><small>{surfaceDescription(surface)}</small></div>
        {surface === "itinerary" ? <div className="itinerary-actions">
          <div className="public-segmented"><button className={!showPersonal ? "active" : ""} type="button" onClick={() => setShowPersonal(false)}>All sessions</button><button className={showPersonal ? "active" : ""} type="button" onClick={() => setShowPersonal(true)}>My schedule <b aria-live="polite">{itineraryLoading ? "…" : selectedItineraryIds.size}</b></button></div>
          {itineraryLoading ? <span className="itinerary-loading-status" role="status">Loading saved itinerary…</span> : itineraryBusyId ? <span className="itinerary-loading-status" role="status">Saving itinerary…</span> : <a className={selectedItineraryIds.size ? "calendar-export" : "calendar-export disabled"} aria-disabled={!selectedItineraryIds.size} href={`/api/v1/public/program/${encodeURIComponent(eventSlug)}/anonymous-itinerary/calendar.ics`}>Add to calendar</a>}
        </div> : null}
      </div>

      {surface !== "agenda" ? <SearchAndFacets program={program} filters={filters} setFilters={setFilters} speakerOnly={surface === "speakers" || surface === "gallery"} resultCount={surface === "speakers" || surface === "gallery" ? filteredSpeakers.length : filteredSessions.length} /> : null}

      {error ? <div className="public-error" role="alert">{error}</div> : null}

      {surface === "sessions" ? <SessionGrid sessions={filteredSessions} timezone={program.event.timezone} expanded={expanded} toggleExpanded={toggleExpanded} open={setSelectedSession} /> : null}
      {surface === "speakers" ? <SpeakerDirectory speakers={filteredSpeakers} open={setSelectedSpeaker} /> : null}
      {surface === "agenda" ? <Agenda program={program} day={day} setDay={setActiveDay} open={setSelectedSession} /> : null}
      {surface === "itinerary" ? <Itinerary sessions={visibleItinerary} program={program} selectedIds={selectedItineraryIds} busyId={itineraryBusyId} loading={itineraryLoading} toggle={toggleItinerary} open={setSelectedSession} personal={showPersonal} /> : null}
      {surface === "gallery" ? <SpeakerGallery speakers={filteredSpeakers} open={setSelectedSpeaker} /> : null}
    </main>

    {selectedSession ? <SessionDetail session={selectedSession} timezone={program.event.timezone} close={() => setSelectedSession(null)} /> : null}
    {selectedSpeaker ? <SpeakerDetail speaker={selectedSpeaker} timezone={program.event.timezone} close={() => setSelectedSpeaker(null)} /> : null}
  </div>;
}

function SearchAndFacets(props: {
  program: PublishedProgram;
  filters: PublicFilters;
  setFilters(value: PublicFilters): void;
  speakerOnly: boolean;
  resultCount: number;
}) {
  const update = (values: Partial<PublicFilters>) => props.setFilters({ ...props.filters, ...values });
  return <section className="public-filters" aria-label="Program filters">
    <label className="public-search"><span>Search</span><input type="search" value={props.filters.search} placeholder={props.speakerOnly ? "Search speakers" : "Search titles or speakers"} onChange={(event) => update({ search: event.target.value })} /></label>
    {!props.speakerOnly ? <>
      <FilterSelect label="Track" value={props.filters.trackId} options={props.program.tracks} change={(trackId) => update({ trackId })} />
      <FilterSelect label="Format" value={props.filters.formatId} options={props.program.formats} change={(formatId) => update({ formatId })} />
      <FilterSelect label="Location" value={props.filters.roomId} options={props.program.rooms} change={(roomId) => update({ roomId })} />
    </> : null}
    <span className="result-count">{props.resultCount} result{props.resultCount === 1 ? "" : "s"}</span>
  </section>;
}

function FilterSelect(props: { label: string; value: string; options: Array<{ id: string; name: string }>; change(value: string): void }) {
  return <label><span>{props.label}</span><select value={props.value} onChange={(event) => props.change(event.target.value)}><option value="">All {props.label.toLocaleLowerCase()}s</option>{props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
}

function SessionGrid(props: { sessions: PublicSession[]; timezone: string; expanded: Set<string>; toggleExpanded(id: string): void; open(session: PublicSession): void }) {
  if (!props.sessions.length) return <Empty>No sessions match those filters.</Empty>;
  return <section className="session-grid">{props.sessions.map((session) => <article className="public-session-card" key={session.id}>
    <Tags session={session} />
    <button className="public-card-title" type="button" onClick={() => props.open(session)}><h3>{session.title}</h3></button>
    <p className={props.expanded.has(session.id) ? "expanded" : "clamped"}>{session.description || "Session description coming soon."}</p>
    {session.description.length > 120 ? <button className="show-more" type="button" onClick={() => props.toggleExpanded(session.id)}>{props.expanded.has(session.id) ? "Show less" : "Show more"}</button> : null}
    <div className="session-meta"><time>{formatRange(session, props.timezone, true)}</time><span>{session.room.name}</span></div>
    <SpeakerMiniList speakers={session.speakers} />
  </article>)}</section>;
}

function SpeakerDirectory({ speakers, open }: { speakers: PublicSpeaker[]; open(speaker: PublicSpeaker): void }) {
  if (!speakers.length) return <Empty>No speakers match that search.</Empty>;
  return <section className="speaker-directory">{speakers.map((speaker) => <button type="button" key={speaker.id} onClick={() => open(speaker)}>
    <Headshot speaker={speaker} />
    <span><strong>{speaker.name}</strong><small>{[speaker.jobTitle || "Speaker", speaker.company].filter(Boolean).join(" · ")}</small></span>
    <b>{speaker.sessions.length} session{speaker.sessions.length === 1 ? "" : "s"}</b><i>→</i>
  </button>)}</section>;
}

function SpeakerGallery({ speakers, open }: { speakers: PublicSpeaker[]; open(speaker: PublicSpeaker): void }) {
  if (!speakers.length) return <Empty>No speakers match that search.</Empty>;
  return <section className="speaker-gallery">{speakers.map((speaker) => <button type="button" key={speaker.id} onClick={() => open(speaker)}>
    <Headshot speaker={speaker} large />
    <strong>{speaker.name}</strong><span>{speaker.jobTitle || "Speaker"}</span><small>{speaker.company || "Independent"}</small>
  </button>)}</section>;
}

function Agenda({ program, day, setDay, open }: { program: PublishedProgram; day: string; setDay(value: string): void; open(session: PublicSession): void }) {
  const sessions = sessionsByStart(program.sessions.filter((session) => session.day === day));
  const times = startTimes(sessions);
  return <>
    <DayNavigation days={program.days} active={day} setActive={setDay} />
    {sessions.length === 0 ? <Empty>No approved sessions are scheduled on this day.</Empty> : <section className="public-agenda" style={{ "--room-count": program.rooms.length } as CSSProperties}>
      <div className="agenda-corner">Time</div>{program.rooms.map((room) => <div className="agenda-room" key={room.id}>{room.name}</div>)}
      {times.flatMap((startsAt) => [
        <time className="agenda-time" key={`time-${startsAt}`}>{new Intl.DateTimeFormat(undefined, { timeZone: program.event.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(startsAt))}</time>,
        ...program.rooms.map((room) => {
          const matches = sessionsAtTime(sessions, startsAt).filter((session) => session.room.id === room.id);
          return <div className="agenda-cell" key={`${startsAt}-${room.id}`}>{matches.map((session) => <button type="button" key={session.id} onClick={() => open(session)}><Tags session={session} /><strong>{session.title}</strong><small>{formatRange(session, program.event.timezone)}</small></button>)}</div>;
        }),
      ])}
    </section>}
  </>;
}

function Itinerary(props: {
  sessions: PublicSession[];
  program: PublishedProgram;
  selectedIds: Set<string>;
  busyId: string | null;
  loading: boolean;
  toggle(id: string): Promise<void>;
  open(session: PublicSession): void;
  personal: boolean;
}) {
  if (props.loading) return <div className="public-empty" role="status">Loading your saved itinerary…</div>;
  if (!props.sessions.length) return <Empty>{props.personal ? "Star sessions to build your personal schedule." : "No sessions match those filters."}</Empty>;
  return <section className="public-itinerary">{props.program.days.map((day) => {
    const sessions = props.sessions.filter((session) => session.day === day);
    if (!sessions.length) return null;
    return <div className="itinerary-day" key={day}><header><p>{formatDay(day)}</p><span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span></header>{sessions.map((session) => <article key={session.id}>
      <button className={props.selectedIds.has(session.id) ? "star selected" : "star"} aria-pressed={props.selectedIds.has(session.id)} aria-busy={props.busyId === session.id} disabled={props.busyId !== null} type="button" onClick={() => { void props.toggle(session.id); }} aria-label={props.busyId === session.id ? `Saving ${session.title}` : `${props.selectedIds.has(session.id) ? "Remove" : "Add"} ${session.title} ${props.selectedIds.has(session.id) ? "from" : "to"} my schedule`}>★<span className="visually-hidden">{props.busyId === session.id ? "Saving" : ""}</span></button>
      <time>{formatRange(session, props.program.event.timezone, true)}</time>
      <div><Tags session={session} /><button className="itinerary-title" type="button" onClick={() => props.open(session)}><h3>{session.title}</h3></button><p>{session.description || "Session description coming soon."}</p><SpeakerMiniList speakers={session.speakers} /></div>
      <strong>{session.room.name}</strong>
    </article>)}</div>;
  })}</section>;
}

function SessionDetail({ session, timezone, close }: { session: PublicSession; timezone: string; close(): void }) {
  return <Modal close={close} label={`Session details: ${session.title}`}>
    <Tags session={session} /><h2>{session.title}</h2><p>{session.description || "Session description coming soon."}</p>
    <dl><div><dt>Date & time</dt><dd>{formatRange(session, timezone, true)}</dd></div><div><dt>Room</dt><dd>{session.room.name}</dd></div><div><dt>Track</dt><dd>{session.track?.name ?? "General"}</dd></div><div><dt>Format</dt><dd>{session.format?.name ?? "Session"}</dd></div></dl>
    <h3>Speakers</h3><SpeakerMiniList speakers={session.speakers} />
  </Modal>;
}

function SpeakerDetail({ speaker, timezone, close }: { speaker: PublicSpeaker; timezone: string; close(): void }) {
  const [expanded, setExpanded] = useState(false);
  const biography = biographyForDisplay(speaker.biography);
  return <Modal close={close} label={`Speaker details: ${speaker.name}`}>
    <div className="speaker-detail-head"><Headshot speaker={speaker} large /><div><h2>{speaker.name}</h2><p>{[speaker.jobTitle || "Speaker", speaker.company].filter(Boolean).join(" · ")}</p></div></div>
    <p className={expanded ? "" : "clamped bio"}>{biography || "Biography coming soon."}</p>
    {biography.length > 180 ? <button className="show-more" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show more"}</button> : null}
    <h3>Sessions</h3><div className="speaker-session-list">{speaker.sessions.map((session) => <article key={session.id}><strong>{session.title}</strong><small>{formatEventDateTime(session.startsAt, timezone)} · {session.room}</small></article>)}</div>
  </Modal>;
}

function Modal({ children, close, label }: { children: ReactNode; close(): void; label: string }) {
  return <AccessibleDialog close={close} label={label} backdropClassName="public-modal-backdrop" dialogClassName="public-modal">
    <button className="modal-close" data-dialog-initial-focus type="button" onClick={close} aria-label={`Close ${label}`}>×</button>{children}
  </AccessibleDialog>;
}

function Tags({ session }: { session: PublicSession }) {
  return <div className="public-tags">{session.track ? <span>{session.track.name}</span> : null}{session.format ? <span>{session.format.name}</span> : null}</div>;
}

function Headshot({ speaker, large = false }: { speaker: PublicSpeaker; large?: boolean }) {
  return speaker.headshotUrl
    ? <img className={large ? "speaker-headshot large" : "speaker-headshot"} src={speaker.headshotUrl} alt={`Headshot of ${speaker.name}`} />
    : <span className={large ? "speaker-headshot fallback large" : "speaker-headshot fallback"} aria-label={`No photo available for ${speaker.name}`}>{initials(speaker.name)}</span>;
}

function SpeakerMiniList({ speakers }: { speakers: PublicSpeaker[] }) {
  return <div className="speaker-mini-list">{speakers.length ? speakers.map((speaker) => <span key={speaker.id}><Headshot speaker={speaker} /><i><strong>{speaker.name}</strong><small>{[speaker.jobTitle || "Speaker", speaker.company].filter(Boolean).join(" · ")}</small></i></span>) : <small>Speakers to be announced</small>}</div>;
}

function DayNavigation({ days, active, setActive }: { days: string[]; active: string; setActive(value: string): void }) {
  return <nav className="public-day-nav" aria-label="Event days">{days.map((day, index) => <button key={day} className={active === day ? "active" : ""} aria-pressed={active === day} type="button" onClick={() => setActive(day)}><span>Day {index + 1}</span><strong>{formatDay(day)}</strong></button>)}</nav>;
}

function Empty({ children }: { children: ReactNode }) { return <div className="public-empty">{children}</div>; }

function surfaceLabel(surface: PublicSurface): string {
  return surface === "gallery" ? "People" : surface === "agenda" || surface === "itinerary" ? "Schedule" : "Program";
}

function surfaceTitle(surface: PublicSurface): string {
  return { sessions: "Explore sessions", speakers: "Meet the speakers", agenda: "Agenda", itinerary: "Build your itinerary", gallery: "Speaker gallery" }[surface];
}

function surfaceDescription(surface: PublicSurface): string {
  return {
    sessions: "Search the complete approved program by topic, speaker, track, format or room.",
    speakers: "Browse the program's speakers in surname order and open any profile for their sessions.",
    agenda: "Navigate each event day and see every session at its published time and room.",
    itinerary: "Star sessions, keep them across reloads, and export your personal schedule.",
    gallery: "A visual directory of every speaker in the live program.",
  }[surface];
}

function dateSpan(program: PublishedProgram): string {
  return formatEventDateRange(program.event.startsOn, program.event.endsOn);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The public program could not be loaded.";
}
