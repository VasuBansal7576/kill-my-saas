import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { jsonRequest, schedulingRequest } from "./api";
import { formatDay, formatTime, groupsForView, localDate, sessionConflictIds, zonedDateTimeToIso } from "./model";
import type { AgendaRepairSuggestion, AgendaSession, AgendaView, AgendaWorkspace, AutoPlaceResult, PlacementSuggestionsResult } from "./types";
import "./scheduling.css";

const hours = Array.from({ length: 8 }, (_, index) => index + 9);

export function AgendaPage() {
  const { eventSlug = "" } = useParams();
  const [workspace, setWorkspace] = useState<AgendaWorkspace | null>(null);
  const [view, setView] = useState<AgendaView>("day");
  const [day, setDay] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [formRoomId, setFormRoomId] = useState("");
  const [formDay, setFormDay] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockedSuggestions, setBlockedSuggestions] = useState<AgendaRepairSuggestion[]>([]);

  const load = useCallback(async (revisionId?: string) => {
    setError(null);
    const query = revisionId ? `?revisionId=${encodeURIComponent(revisionId)}` : "";
    const loaded = await schedulingRequest<AgendaWorkspace>(`/api/v1/organizer/events/${eventSlug}/agenda${query}`);
    if (!loaded.revision) {
      const created = await schedulingRequest<AgendaWorkspace>(
        `/api/v1/organizer/events/${eventSlug}/agenda/revisions`,
        jsonRequest("POST"),
      );
      setWorkspace(created);
      setBlockedSuggestions([]);
      return;
    }
    setWorkspace(loaded);
    setBlockedSuggestions([]);
  }, [eventSlug]);

  useEffect(() => {
    let active = true;
    void schedulingRequest<AgendaWorkspace>(`/api/v1/organizer/events/${eventSlug}/agenda`)
      .then((loaded) => loaded.revision ? loaded : schedulingRequest<AgendaWorkspace>(
        `/api/v1/organizer/events/${eventSlug}/agenda/revisions`,
        jsonRequest("POST"),
      ))
      .then((loaded) => { if (active) setWorkspace(loaded); })
      .catch((caught: unknown) => { if (active) setError(message(caught)); });
    return () => { active = false; };
  }, [eventSlug]);

  const conflicts = useMemo(() => workspace ? sessionConflictIds(workspace) : new Set<string>(), [workspace]);
  const repairSuggestions = useMemo(() => {
    const combined = [...(workspace?.repairSuggestions ?? []), ...blockedSuggestions];
    return [...new Map(combined.map((suggestion) => [suggestion.id, suggestion])).values()];
  }, [blockedSuggestions, workspace]);
  const unscheduled = workspace?.sessions.filter((session) => !session.placement) ?? [];
  const selectedSession = workspace?.sessions.find((session) => session.id === selectedSessionId) ?? null;
  const activeDay = workspace && workspace.days.includes(day) ? day : workspace?.days[0] ?? "";
  const activeFormDay = workspace && workspace.days.includes(formDay) ? formDay : workspace?.days[0] ?? "";
  const activeFormRoomId = workspace && workspace.rooms.some((room) => room.id === formRoomId) ? formRoomId : workspace?.rooms[0]?.id ?? "";

  async function startRevision() {
    await mutate(async () => {
      const created = await schedulingRequest<AgendaWorkspace>(
        `/api/v1/organizer/events/${eventSlug}/agenda/revisions`,
        jsonRequest("POST"),
      );
      setWorkspace(created);
      setBlockedSuggestions([]);
      setNotice("A new editable schedule version is ready.");
    });
  }

  async function placeAt(sessionId: string, roomId: string, targetDay: string, time: string) {
    if (!workspace?.revision) return;
    const session = workspace.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) return;
    if (workspace.revision.inUse) {
      setError("This schedule version is already public. Start a new version before moving sessions.");
      return;
    }
    await mutate(async () => {
      const startsAt = zonedDateTimeToIso(targetDay, time, workspace.event.timezone);
      const endsAt = new Date(Date.parse(startsAt) + session.durationMinutes * 60_000).toISOString();
      let next: AgendaWorkspace;
      try {
        next = await moveSession(workspace, eventSlug, { sessionId, roomId, startsAt, endsAt });
      } catch (caught) {
        if (errorCode(caught) === "room_overlap") {
          const alternatives = await schedulingRequest<PlacementSuggestionsResult>(
            `/api/v1/organizer/events/${eventSlug}/agenda/placements/${sessionId}/suggestions?revisionId=${encodeURIComponent(workspace.revision!.id)}`,
          ).catch(() => null);
          setBlockedSuggestions(alternatives?.suggestions ?? []);
        }
        throw caught;
      }
      setWorkspace(next);
      setBlockedSuggestions([]);
      setSelectedSessionId(null);
      setNotice(`${session.title} was placed on the schedule.`);
    });
  }

  async function moveToSuggestion(suggestion: AgendaRepairSuggestion) {
    if (!workspace?.revision || suggestion.revisionId !== workspace.revision.id) {
      setError("That suggestion belongs to another schedule version. Reload the current version and try again.");
      return;
    }
    const session = workspace.sessions.find((candidate) => candidate.id === suggestion.sessionId);
    const room = workspace.rooms.find((candidate) => candidate.id === suggestion.roomId);
    if (!session || !room) return;
    await mutate(async () => {
      const next = await moveSession(workspace, eventSlug, suggestion);
      setWorkspace(next);
      setBlockedSuggestions([]);
      setSelectedSessionId(null);
      setNotice(`${session.title} moved to ${formatDay(localDate(suggestion.startsAt, workspace.event.timezone))} at ${formatTime(suggestion.startsAt, workspace.event.timezone)} in ${room.name}. Conflicts were recomputed.`);
    });
  }

  async function unplace(session: AgendaSession) {
    if (!workspace?.revision) return;
    await mutate(async () => {
      const next = await schedulingRequest<AgendaWorkspace>(
        `/api/v1/organizer/events/${eventSlug}/agenda/placements/${session.id}?revisionId=${workspace.revision!.id}`,
        { method: "DELETE" },
      );
      setWorkspace(next);
      setBlockedSuggestions([]);
      setNotice(`${session.title} returned to the unscheduled queue.`);
    });
  }

  async function autoPlace() {
    if (!workspace?.revision) return;
    await mutate(async () => {
      const result = await schedulingRequest<AutoPlaceResult>(
        `/api/v1/organizer/events/${eventSlug}/agenda/auto-place`,
        jsonRequest("POST", { revisionId: workspace.revision!.id }),
      );
      setWorkspace(result.workspace);
      setBlockedSuggestions([]);
      setNotice(`${result.placedSessionIds.length} session${result.placedSessionIds.length === 1 ? "" : "s"} auto-placed${result.unplaced.length ? `; ${result.unplaced.length} could not fit` : ""}.`);
    });
  }

  async function mutate(operation: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  function drop(event: DragEvent, roomId: string, targetDay: string, hour: number) {
    event.preventDefault();
    const sessionId = event.dataTransfer.getData("text/programflow-session") || event.dataTransfer.getData("text/plain");
    if (sessionId) void placeAt(sessionId, roomId, targetDay, `${String(hour).padStart(2, "0")}:00`);
  }

  if (!workspace) return <section className="agenda-loading">{error ? <p role="alert">{error}</p> : <p>Loading the agenda…</p>}</section>;

  return <div className="agenda-workspace">
    <header className="agenda-head">
      <div><p className="agenda-kicker">Schedule</p><h1>Agenda</h1><p>Place accepted sessions, resolve conflicts, and prepare the public program.</p></div>
      <div className="agenda-actions">
        <button className="agenda-secondary" type="button" disabled={busy || unscheduled.length === 0 || workspace.revision?.inUse} onClick={() => void autoPlace()}>Auto-place {unscheduled.length}</button>
        {workspace.revision?.inUse ? <button className="agenda-primary" type="button" disabled={busy} onClick={() => void startRevision()}>Start new revision</button> : null}
      </div>
    </header>

    {error ? <div className="agenda-alert error" role="alert">{error}</div> : null}
    {notice ? <div className="agenda-alert success" role="status">{notice}</div> : null}

    <section className={`agenda-readiness ${workspace.readiness.ready ? "ready" : "blocked"}`}>
      <div><strong>{workspace.readiness.ready ? "Schedule is ready to publish" : "Schedule needs attention"}</strong><span>{workspace.readiness.ready ? "All scheduled sessions are conflict-free." : workspace.readiness.reasons.join(" ")}</span></div>
      {workspace.readiness.ready ? <Link to={`/organizer/events/${eventSlug}/publish`}>Open public program →</Link> : <button type="button" onClick={() => setView("day")}>Resolve in Day view</button>}
    </section>

    <div className="agenda-toolbar">
      <nav className="agenda-tabs" aria-label="Agenda views">
        {(["day", "week", "list", "track", "room"] as const).map((candidate) => <button key={candidate} className={view === candidate ? "active" : ""} aria-pressed={view === candidate} type="button" onClick={() => setView(candidate)}>{candidate[0]?.toUpperCase()}{candidate.slice(1)}</button>)}
      </nav>
      <div className="agenda-revision-picker">
        <label>Schedule version<select value={workspace.revision?.id ?? ""} onChange={(event) => void mutate(() => load(event.target.value))}>{workspace.revisions.map((revision) => <option key={revision.id} value={revision.id}>Version {revision.version} · {revision.status}{revision.inUse ? " · public" : ""}</option>)}</select></label>
        <Link to={`/organizer/events/${eventSlug}/settings`}>Rooms & tracks</Link>
      </div>
    </div>

    <div className="agenda-layout">
      <aside className="agenda-queue">
        <div className="agenda-section-head"><div><span>Unscheduled</span><strong>{unscheduled.length}</strong></div><small>Drag, select with Enter, or use the placement form.</small></div>
        <div className="agenda-queue-list">{unscheduled.length === 0 ? <p className="agenda-empty">Every session has a placement.</p> : unscheduled.map((session) => <SessionCard key={session.id} session={session} timezone={workspace.event.timezone} conflicted={false} selected={selectedSessionId === session.id} select={() => setSelectedSessionId(session.id)} />)}</div>
        <form className="agenda-placement-form" onSubmit={(event) => { event.preventDefault(); if (selectedSessionId) void placeAt(selectedSessionId, activeFormRoomId, activeFormDay, formTime); }}>
          <strong>Place or move selected</strong>
          <label>Session<select value={selectedSessionId ?? ""} onChange={(event) => setSelectedSessionId(event.target.value || null)}><option value="">Choose a session</option>{workspace.sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label>
          <label>Day<select value={activeFormDay} onChange={(event) => setFormDay(event.target.value)}>{workspace.days.map((value) => <option key={value} value={value}>{formatDay(value)}</option>)}</select></label>
          <label>Room<select value={activeFormRoomId} onChange={(event) => setFormRoomId(event.target.value)}>{workspace.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <label>Start<input type="time" step={900} value={formTime} onChange={(event) => setFormTime(event.target.value)} /></label>
          <button type="submit" disabled={busy || !selectedSessionId || !activeFormRoomId || !activeFormDay || workspace.revision?.inUse}>Place on schedule</button>
          {selectedSession?.placement ? <button className="agenda-unplace" type="button" disabled={busy || workspace.revision?.inUse} onClick={() => void unplace(selectedSession)}>Return to unscheduled</button> : null}
        </form>
      </aside>

      <section className="agenda-canvas">
        {workspace.conflicts.length > 0 || blockedSuggestions.length > 0 ? <ConflictRepairPanel workspace={workspace} suggestions={repairSuggestions} busy={busy} move={moveToSuggestion} /> : null}
        {view === "day" ? <DayView workspace={workspace} day={activeDay} setDay={setDay} selectedSessionId={selectedSessionId} conflicts={conflicts} busy={busy} drop={drop} placeAt={placeAt} select={setSelectedSessionId} unplace={unplace} /> : <GroupedView workspace={workspace} view={view} conflicts={conflicts} select={setSelectedSessionId} unplace={unplace} />}
      </section>
    </div>
  </div>;
}

export function ConflictRepairPanel(props: {
  workspace: AgendaWorkspace;
  suggestions: AgendaRepairSuggestion[];
  busy: boolean;
  move(suggestion: AgendaRepairSuggestion): void;
}) {
  const { workspace } = props;
  const hasConflicts = workspace.conflicts.length > 0;
  return <section className="agenda-conflicts" aria-live="polite">
    <header>
      <div><strong>{hasConflicts ? `${workspace.conflicts.length} conflict${workspace.conflicts.length === 1 ? "" : "s"} to repair` : "That room is occupied"}</strong><span>{hasConflicts ? "These alternatives are conflict-free in the current schedule version." : "Choose another valid placement from the current schedule version."}</span></div>
      {workspace.revision ? <small>Version {workspace.revision.version}</small> : null}
    </header>
    {workspace.conflicts.map((conflict) => <div className="agenda-conflict-row" key={conflict.id}><i /><span>{conflict.message}</span><time>{formatTime(conflict.startsAt, workspace.event.timezone)}–{formatTime(conflict.endsAt, workspace.event.timezone)}</time></div>)}
    <div className="agenda-repair-list">
      <div className="agenda-repair-head"><strong>Suggested moves</strong><span>Each option keeps the session duration and avoids room and speaker overlaps.</span></div>
      {props.suggestions.length === 0 ? <p className="agenda-repair-empty">No valid 9:00–17:00 placement is available. Use the placement form to adjust the program.</p> : props.suggestions.map((suggestion) => {
        const session = workspace.sessions.find((candidate) => candidate.id === suggestion.sessionId);
        const room = workspace.rooms.find((candidate) => candidate.id === suggestion.roomId);
        if (!session || !room) return null;
        const day = formatDay(localDate(suggestion.startsAt, workspace.event.timezone));
        const start = formatTime(suggestion.startsAt, workspace.event.timezone);
        const end = formatTime(suggestion.endsAt, workspace.event.timezone);
        return <article key={suggestion.id}>
          <div><strong>Move {session.title}</strong><span>{day} · {start}–{end} · {room.name}</span></div>
          <button type="button" disabled={props.busy || workspace.revision?.inUse} onClick={() => props.move(suggestion)} aria-label={`Move ${session.title} to ${day} at ${start} in ${room.name}`}>Move here</button>
        </article>;
      })}
    </div>
  </section>;
}

function DayView(props: {
  workspace: AgendaWorkspace;
  day: string;
  setDay(day: string): void;
  selectedSessionId: string | null;
  conflicts: Set<string>;
  busy: boolean;
  drop(event: DragEvent, roomId: string, day: string, hour: number): void;
  placeAt(sessionId: string, roomId: string, day: string, time: string): Promise<void>;
  select(sessionId: string): void;
  unplace(session: AgendaSession): Promise<void>;
}) {
  const { workspace } = props;
  return <section className="agenda-day-view">
    <header><div><span>Day view</span><h2>{props.day ? formatDay(props.day) : "No event day"}</h2></div><div className="agenda-day-nav">{workspace.days.map((day) => <button key={day} type="button" className={props.day === day ? "active" : ""} onClick={() => props.setDay(day)}>{new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${day}T00:00:00Z`))}</button>)}</div></header>
    {workspace.rooms.length === 0 ? <div className="agenda-empty"><p>Add a room in Event settings before placing sessions.</p></div> : <div className="agenda-grid" style={{ gridTemplateColumns: `72px repeat(${workspace.rooms.length}, minmax(180px, 1fr))` }}>
      <div className="agenda-grid-corner" />{workspace.rooms.map((room) => <div className="agenda-room-head" key={room.id}>{room.name}</div>)}
      {hours.flatMap((hour) => [
        <div className="agenda-time" key={`time-${hour}`}>{String(hour).padStart(2, "0")}:00</div>,
        ...workspace.rooms.map((room) => {
          const cellSessions = workspace.sessions.filter((session) => session.placement
            && session.placement.roomId === room.id
            && localDate(session.placement.startsAt, workspace.event.timezone) === props.day
            && localHour(session.placement.startsAt, workspace.event.timezone) === hour);
          return <div className="agenda-slot" key={`${hour}-${room.id}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => props.drop(event, room.id, props.day, hour)}>
            {cellSessions.map((session) => <SessionCard key={session.id} session={session} timezone={workspace.event.timezone} conflicted={props.conflicts.has(session.id)} selected={props.selectedSessionId === session.id} select={() => props.select(session.id)} unplace={() => { void props.unplace(session); }} />)}
            <button className="agenda-drop-command" type="button" disabled={props.busy || !props.selectedSessionId || workspace.revision?.inUse} onClick={() => { if (props.selectedSessionId) void props.placeAt(props.selectedSessionId, room.id, props.day, `${String(hour).padStart(2, "0")}:00`); }}>{props.selectedSessionId ? "Place selected" : "Drop session"}</button>
          </div>;
        }),
      ])}
    </div>}
  </section>;
}

function GroupedView(props: { workspace: AgendaWorkspace; view: Exclude<AgendaView, "day">; conflicts: Set<string>; select(sessionId: string): void; unplace(session: AgendaSession): Promise<void> }) {
  const groups = groupsForView(props.workspace, props.view);
  return <section className="agenda-grouped-view"><header><span>{props.view} view</span><h2>{props.view === "list" ? "Chronological agenda" : `Agenda by ${props.view}`}</h2></header><div className="agenda-groups">{groups.map((group) => <article key={group.key}><div className="agenda-group-head"><strong>{group.label}</strong><span>{group.sessions.length} session{group.sessions.length === 1 ? "" : "s"}</span></div>{group.sessions.length === 0 ? <p className="agenda-empty">No sessions in this group.</p> : group.sessions.map((session) => <SessionCard key={session.id} session={session} timezone={props.workspace.event.timezone} conflicted={props.conflicts.has(session.id)} selected={false} select={() => props.select(session.id)} unplace={() => { void props.unplace(session); }} />)}</article>)}</div></section>;
}

function SessionCard(props: { session: AgendaSession; timezone: string; conflicted: boolean; selected: boolean; select(): void; unplace?: () => void }) {
  const { session } = props;
  return <article className={`agenda-session ${props.conflicted ? "conflicted" : ""} ${props.selected ? "selected" : ""}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/programflow-session", session.id); event.dataTransfer.setData("text/plain", session.id); }}>
    <button type="button" onClick={props.select} aria-pressed={props.selected} aria-label={`Select ${session.title} for placement`}>
      <span>{session.trackName ?? "No track"}{session.formatName ? ` · ${session.formatName}` : ""}</span>
      <strong>{session.title}</strong>
      <small>{session.speakers.map((speaker) => speaker.displayName).join(", ") || "No speaker assigned"}</small>
      {session.placement ? <time>{formatTime(session.placement.startsAt, props.timezone)}–{formatTime(session.placement.endsAt, props.timezone)}</time> : <em>{session.durationMinutes} min</em>}
      {props.conflicted ? <b>Speaker conflict</b> : null}
    </button>
    {props.unplace ? <button className="agenda-card-remove" type="button" onClick={props.unplace} aria-label={`Return ${session.title} to unscheduled`}>×</button> : null}
  </article>;
}

function localHour(value: string, timezone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date(value)));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The scheduling operation could not be completed.";
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as Error & { code?: string }).code : undefined;
}

function moveSession(
  workspace: AgendaWorkspace,
  eventSlug: string,
  placement: Pick<AgendaRepairSuggestion, "sessionId" | "roomId" | "startsAt" | "endsAt">,
): Promise<AgendaWorkspace> {
  if (!workspace.revision) throw new Error("Create a schedule version before placing sessions.");
  return schedulingRequest<AgendaWorkspace>(
    `/api/v1/organizer/events/${eventSlug}/agenda/placements/${placement.sessionId}`,
    jsonRequest("PUT", {
      eventId: workspace.event.id,
      revisionId: workspace.revision.id,
      ...placement,
    }),
  );
}
