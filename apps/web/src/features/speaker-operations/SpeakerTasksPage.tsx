import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { eventLocalDateTimeToIso, formatEventDueDate } from "../../app/event-time";
import { jsonRequest, requestJson } from "./api";
import styles from "./speaker-operations.module.css";
import type { RosterSpeaker, SpeakerTask, SpeakerTasksWorkspace } from "./types";

export function SpeakerTasksPage() {
  const { eventSlug = "" } = useParams();
  const [tasks, setTasks] = useState<SpeakerTask[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [speakers, setSpeakers] = useState<RosterSpeaker[]>([]);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      const [taskRows, rosterRows] = await Promise.all([
        requestJson<SpeakerTasksWorkspace>(`/api/v1/organizer/events/${eventSlug}/tasks`),
        requestJson<RosterSpeaker[]>(`/api/v1/organizer/events/${eventSlug}/speakers?taskStatus=all&search=`),
      ]);
      setTasks(taskRows.tasks); setTimezone(taskRows.event.timezone); setSpeakers(rosterRows); setMessage(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Tasks could not be loaded."); }
  }, [eventSlug]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      requestJson<SpeakerTasksWorkspace>(`/api/v1/organizer/events/${eventSlug}/tasks`),
      requestJson<RosterSpeaker[]>(`/api/v1/organizer/events/${eventSlug}/speakers?taskStatus=all&search=`),
    ]).then(([taskRows, rosterRows]) => {
      if (!active) return;
      setTasks(taskRows.tasks);
      setTimezone(taskRows.event.timezone);
      setSpeakers(rosterRows);
      setMessage(null);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "Tasks could not be loaded.");
    });
    return () => { active = false; };
  }, [eventSlug]);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); const formElement = event.currentTarget; const form = new FormData(formElement);
    const assignees = form.getAll("assignees").map(String);
    try {
      await requestJson<SpeakerTask>(`/api/v1/organizer/events/${eventSlug}/tasks`, jsonRequest("POST", {
        title: form.get("title"), description: form.get("description"), kind: form.get("kind"), required: true,
        dueAt: eventLocalDateTimeToIso(String(form.get("dueAt") ?? ""), timezone),
        configuration: form.get("kind") === "form" ? { fields: [{ key: "acknowledgement", label: "Acknowledgement", required: true }] } : {},
        eventSpeakerIds: assignees, idempotencyKey: idempotencyKey.current,
      }));
      idempotencyKey.current = crypto.randomUUID(); formElement.reset(); setMessage("Task and assignments persisted."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The task could not be created."); }
    finally { setSaving(false); }
  }

  const visibleTasks = tasks.filter((task) => filter === "all" || task.assignments.some((assignment) => assignment.status === filter));
  const showDate = (value: string | null) => formatEventDueDate(value, timezone);
  return <div className={styles.workspace}><header className={styles.pageHead}><div><p className={styles.eyebrow}>Onboarding</p><h1>Speaker tasks</h1><p>Create a request once, assign it to a group, and track completion. Times use {timezone}.</p></div></header>{message ? <div className={styles.notice} role="status">{message}</div> : null}<div className={styles.twoColumn}><form className={styles.editor} onSubmit={(event) => void createTask(event)}><div className={styles.sectionHead}><h2>New task</h2><span>Action or form</span></div><div className={styles.stack}><label>Title<input required name="title" /></label><label>Description<textarea name="description" rows={3} /></label><div className={styles.formGrid}><label>Type<select name="kind"><option value="action">General action</option><option value="form">Form</option></select></label><label>Due date <small>{timezone}</small><input name="dueAt" type="datetime-local" /></label></div><fieldset><legend>Assign speakers</legend><div className={styles.checkboxList}>{speakers.map((speaker) => <label key={speaker.eventSpeakerId}><input type="checkbox" name="assignees" value={speaker.eventSpeakerId} />{speaker.displayName}</label>)}</div></fieldset><button className={styles.primaryButton} disabled={saving}>{saving ? "Creating…" : "Create and assign"}</button></div></form><section className={styles.panel}><div className={styles.sectionHead}><h2>Assignment progress</h2><select aria-label="Filter task assignments" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="pending">Incomplete</option><option value="complete">Complete</option></select></div>{visibleTasks.length ? visibleTasks.map((task) => <article className={styles.taskCard} key={task.id}><div><strong>{task.title}</strong><small>{task.kind} · {showDate(task.dueAt)}</small></div><span>{task.assignments.filter((assignment) => assignment.status === "complete").length}/{task.assignments.length} complete</span><div className={styles.assignmentList}>{task.assignments.map((assignment) => <div key={assignment.id}><span className={`${styles.checkmark} ${assignment.status === "complete" ? styles.checked : ""}`}>{assignment.status === "complete" ? "✓" : "○"}</span><span><strong>{assignment.displayName}</strong><small>{assignment.status} · {showDate(assignment.dueAt)}</small></span></div>)}</div></article>) : <p className={styles.empty}>No task assignments match this filter.</p>}</section></div></div>;
}
