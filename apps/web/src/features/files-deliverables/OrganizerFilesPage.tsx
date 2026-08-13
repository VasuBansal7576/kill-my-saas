import type { EventConfiguration } from "@programflow/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { eventLocalDateTimeToIso, formatEventDueDate } from "../../app/event-time";
import { jsonRequest, requestJson, sha256 } from "./api";
import styles from "./files-deliverables.module.css";
import type {
  Deliverable,
  FileExport,
  SessionContent,
  SpeakerChoice,
  SpeakerContent,
} from "./types";

export function OrganizerFilesPage() {
  const { eventSlug = "" } = useParams();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerChoice[]>([]);
  const [exports, setExports] = useState<FileExport[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [sessionContent, setSessionContent] = useState<SessionContent | null>(
    null,
  );
  const [speakerContent, setSpeakerContent] = useState<SpeakerContent | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    const [files, roster, exportRows, event] = await Promise.all([
      requestJson<Deliverable[]>(`/api/v1/organizer/events/${eventSlug}/files`),
      requestJson<SpeakerChoice[]>(
        `/api/v1/organizer/events/${eventSlug}/speakers?taskStatus=all&search=`,
      ),
      requestJson<FileExport[]>(
        `/api/v1/organizer/events/${eventSlug}/file-exports`,
      ),
      requestJson<EventConfiguration>(
        `/api/v1/organizer/events/${eventSlug}/configuration`,
      ),
    ]);
    setDeliverables(files);
    setSpeakers(roster);
    setExports(exportRows);
    setTimezone(event.timezone);
  }, [eventSlug]);
  useEffect(() => {
    Promise.all([
      requestJson<Deliverable[]>(`/api/v1/organizer/events/${eventSlug}/files`),
      requestJson<SpeakerChoice[]>(
        `/api/v1/organizer/events/${eventSlug}/speakers?taskStatus=all&search=`,
      ),
      requestJson<FileExport[]>(
        `/api/v1/organizer/events/${eventSlug}/file-exports`,
      ),
      requestJson<EventConfiguration>(
        `/api/v1/organizer/events/${eventSlug}/configuration`,
      ),
    ])
      .then(([files, roster, exportRows, event]) => {
        setDeliverables(files);
        setSpeakers(roster);
        setExports(exportRows);
        setTimezone(event.timezone);
      })
      .catch(showError(setMessage));
  }, [eventSlug]);

  const visible = useMemo(
    () =>
      deliverables.filter(
        (row) =>
          filter === "all" ||
          (filter === "overdue"
            ? row.status === "pending" &&
              Boolean(row.dueAt && new Date(row.dueAt) < new Date())
            : row.status === filter),
      ),
    [deliverables, filter],
  );
  const active = deliverables.find((row) => row.id === selected) ?? null;
  const counts = {
    requested: deliverables.length,
    submitted: deliverables.filter((row) => row.latestVersion > 0).length,
    overdue: deliverables.filter(
      (row) =>
        row.status === "pending" &&
        Boolean(row.dueAt && new Date(row.dueAt) < new Date()),
    ).length,
    review: deliverables.filter((row) => row.status === "submitted").length,
  };

  async function createRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await requestJson(
        `/api/v1/organizer/events/${eventSlug}/file-requests`,
        jsonRequest("POST", {
          title: form.get("title"),
          instructions: form.get("instructions"),
          dueAt: eventLocalDateTimeToIso(String(form.get("dueAt") ?? ""), timezone),
          eventSpeakerIds: form.getAll("speakers").map(String),
          acceptedMediaTypes: form.getAll("mediaTypes").map(String),
          maxByteSize: Number(form.get("maxMegabytes")) * 1024 * 1024,
          handoff: form.get("handoff"),
          idempotencyKey: idempotencyKey.current,
        }),
      );
      idempotencyKey.current = crypto.randomUUID();
      formElement.reset();
      setMessage("File request and speaker deliverables persisted.");
      await load();
    } catch (error) {
      showError(setMessage)(error);
    }
  }

  async function comment(
    event: React.FormEvent<HTMLFormElement>,
    versionId: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = new FormData(formElement).get("body");
    try {
      await requestJson(
        `/api/v1/organizer/events/${eventSlug}/files/versions/${versionId}/comments`,
        jsonRequest("POST", { body }),
      );
      formElement.reset();
      await load();
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function review(status: "changes_requested" | "approved") {
    if (!active) return;
    try {
      await requestJson(
        `/api/v1/organizer/events/${eventSlug}/deliverables/${active.id}/review`,
        jsonRequest("POST", { status, reason: null }),
      );
      setMessage(
        status === "approved"
          ? "Latest immutable version approved."
          : "Changes requested from the speaker.",
      );
      await load();
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function uploadHeadshot(row: Deliverable, file: File) {
    try {
      const directProfileUpload = row.taskAssignmentId === null;
      const authorization = await requestJson<{
        id: string;
        uploadUrl: string | null;
        failureCode: string | null;
      }>(
        directProfileUpload
          ? `/api/v1/organizer/events/${eventSlug}/content/speakers/${row.eventSpeakerId}/headshot-uploads`
          : "/api/v1/organizer/files/uploads",
        jsonRequest("POST", {
          ...(directProfileUpload
            ? {}
            : { eventId: row.eventId, taskAssignmentId: row.taskAssignmentId }),
          originalName: file.name,
          mediaType: file.type,
          byteSize: file.size,
          checksumSha256: await sha256(file),
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      if (!authorization.uploadUrl)
        throw new Error(
          `Headshot upload blocked by external storage: ${authorization.failureCode ?? "unknown"}.`,
        );
      const uploaded = await fetch(
        authorization.uploadUrl.replace(
          "/api/v1/speaker/",
          "/api/v1/organizer/",
        ),
        { method: "PUT", headers: { "content-type": file.type }, body: file },
      );
      if (!uploaded.ok) throw new Error("The private headshot upload failed.");
      await requestJson(
        `/api/v1/organizer/files/uploads/${authorization.id}/finalize`,
        { method: "POST" },
      );
      setMessage(
        "Headshot finalized and handed off to the canonical speaker profile.",
      );
      await load();
      await openContent(row);
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function requestExport() {
    try {
      const record = await requestJson<FileExport>(
        `/api/v1/organizer/events/${eventSlug}/file-exports`,
        jsonRequest("POST", { deliverableIds: checked, grouping: "session" }),
      );
      setMessage(
        record.status === "blocked_external"
          ? `Export blocked: ${record.failureCode}.`
          : "Latest-version ZIP generation queued with a persisted manifest.",
      );
      setChecked([]);
      await load();
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function openContent(row: Deliverable) {
    setSelected(row.id);
    try {
      const [session, speaker] = await Promise.all([
        row.sessionId
          ? requestJson<SessionContent>(
              `/api/v1/organizer/events/${eventSlug}/content/sessions/${row.sessionId}`,
            )
          : null,
        requestJson<SpeakerContent>(
          `/api/v1/organizer/events/${eventSlug}/content/speakers/${row.eventSpeakerId}`,
        ),
      ]);
      setSessionContent(session);
      setSpeakerContent(speaker);
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function saveSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionContent) return;
    const form = new FormData(event.currentTarget);
    try {
      setSessionContent(
        await requestJson(
          `/api/v1/organizer/events/${eventSlug}/content/sessions/${sessionContent.id}`,
          jsonRequest("PUT", {
            title: form.get("title"),
            abstract: form.get("abstract"),
            expectedRevision: sessionContent.revision,
          }),
        ),
      );
      setMessage(
        "Session edit persisted and versioned; approved content returned to review.",
      );
      await load();
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function approveSession(status: SessionContent["contentStatus"]) {
    if (!sessionContent) return;
    try {
      setSessionContent(
        await requestJson(
          `/api/v1/organizer/events/${eventSlug}/content/sessions/${sessionContent.id}/approval`,
          jsonRequest("POST", {
            status,
            expectedRevision: sessionContent.revision,
          }),
        ),
      );
      setMessage(`Session content is ${status.replace("_", " ")}.`);
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function restoreSession(version: number) {
    if (!sessionContent) return;
    try {
      setSessionContent(
        await requestJson(
          `/api/v1/organizer/events/${eventSlug}/content/sessions/${sessionContent.id}/versions/${version}/restore`,
          jsonRequest("POST", { expectedRevision: sessionContent.revision }),
        ),
      );
      setMessage(
        `Restored session version ${version} as a new immutable revision.`,
      );
      await load();
    } catch (error) {
      showError(setMessage)(error);
    }
  }
  async function saveSpeaker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!speakerContent || !active) return;
    const form = new FormData(event.currentTarget);
    try {
      setSpeakerContent(
        await requestJson(
          `/api/v1/organizer/events/${eventSlug}/content/speakers/${active.eventSpeakerId}`,
          jsonRequest("PUT", {
            biography: form.get("biography"),
            company: form.get("company"),
            jobTitle: form.get("jobTitle"),
            expectedVersion: speakerContent.version,
          }),
        ),
      );
      setMessage("Speaker content persisted with attributed history.");
    } catch (error) {
      showError(setMessage)(error);
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Onboarding</p>
          <h1>Tasks & deliverables</h1>
          <p>
            See what is missing, request it once, and retain every private
            uploaded version.
          </p>
        </div>
        <button
          className={styles.primary}
          disabled={!checked.length}
          onClick={() => void requestExport()}
        >
          Download ZIP ({checked.length})
        </button>
      </header>
      {message ? (
        <div className={styles.notice} role="status">
          {message}
        </div>
      ) : null}
      <section className={styles.metrics}>
        <Metric label="Requested" value={counts.requested} />
        <Metric label="Submitted" value={counts.submitted} />
        <Metric label="Overdue" value={counts.overdue} danger />
        <Metric label="Awaiting review" value={counts.review} />
      </section>
      <div className={styles.layout}>
        <section>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2>Deliverables dashboard & file library</h2>
              <select
                aria-label="Filter deliverables"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="pending">Incomplete</option>
                <option value="overdue">Overdue</option>
                <option value="submitted">Awaiting review</option>
                <option value="changes_requested">Changes requested</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div className={styles.table}>
              <div className={styles.tableHead}>
                <span />
                <span>Speaker / request</span>
                <span>Due</span>
                <span>Status</span>
                <span>Version</span>
              </div>
              {visible.map((row) => (
                <button
                  className={styles.tableRow}
                  type="button"
                  key={row.id}
                  onClick={() => void openContent(row)}
                >
                  <input
                    aria-label={`Select ${row.taskTitle} for ${row.speakerName}`}
                    type="checkbox"
                    checked={checked.includes(row.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      setChecked((current) =>
                        event.target.checked
                          ? [...current, row.id]
                          : current.filter((id) => id !== row.id),
                      )
                    }
                  />
                  <span>
                    <strong>{row.speakerName}</strong>
                    <small>
                      {row.taskTitle} · {row.sessionTitle ?? "Speaker profile"}
                    </small>
                  </span>
                  <span>{formatEventDueDate(row.dueAt, timezone)}</span>
                  <Status value={row.status} />
                  <span>
                    {row.latestVersion ? `v${row.latestVersion}` : "—"}
                  </span>
                </button>
              ))}
            </div>
          </section>
          {active ? (
            <section className={styles.panel}>
              <div className={styles.sectionHead}>
                <h2>{active.taskTitle}</h2>
                <div className={styles.actions}>
                  <button
                    className={styles.secondary}
                    disabled={!active.latestVersion}
                    onClick={() => void review("changes_requested")}
                  >
                    Request changes
                  </button>
                  <button
                    className={styles.primary}
                    disabled={!active.latestVersion}
                    onClick={() => void review("approved")}
                  >
                    Approve latest
                  </button>
                </div>
              </div>
              <p className={styles.help}>{active.instructions}</p>
              {active.handoff === "speaker_headshot" ? (
                <div className={styles.uploadBox}>
                  <strong>Organizer headshot replacement</strong>
                  <small>
                    PNG or JPEG up to{" "}
                    {Math.round(active.maxByteSize / 1024 / 1024)} MB;
                    verification updates the canonical profile.
                  </small>
                  <label className={styles.primary}>
                    Choose headshot
                    <input
                      aria-label={`Upload a replacement headshot for ${active.speakerName}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadHeadshot(active, file);
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {active.versions.map((version) => (
                <article className={styles.version} key={version.id}>
                  <div>
                    <strong>
                      v{version.version} · {version.originalName}
                    </strong>
                    {version.latest ? <Status value="latest" /> : null}
                    <small>
                      {formatBytes(version.byteSize)} ·{" "}
                      {formatDate(version.createdAt)}
                    </small>
                  </div>
                  <a
                    className={styles.download}
                    href={`/api/v1/organizer/events/${eventSlug}/files/versions/${version.id}/download`}
                  >
                    Download private version
                  </a>
                  <div className={styles.comments}>
                    {version.comments.map((item) => (
                      <p key={item.id}>
                        <strong>{item.authorName}</strong>{" "}
                        <time>{formatDate(item.createdAt)}</time>
                        <span>{item.body}</span>
                      </p>
                    ))}
                  </div>
                  <form
                    className={styles.commentForm}
                    onSubmit={(event) => void comment(event, version.id)}
                  >
                    <input
                      required
                      name="body"
                      placeholder="Reply across roles…"
                    />
                    <button className={styles.secondary}>Comment</button>
                  </form>
                </article>
              ))}
            </section>
          ) : null}
          {sessionContent ? (
            <section className={styles.panel}>
              <div className={styles.sectionHead}>
                <h2>Session content & approval</h2>
                <select
                  aria-label="Session content status"
                  value={sessionContent.contentStatus}
                  onChange={(event) =>
                    void approveSession(
                      event.target.value as SessionContent["contentStatus"],
                    )
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="in_review">In review</option>
                  <option value="approved">Approved</option>
                </select>
              </div>
              <form
                className={styles.stack}
                key={sessionContent.revision}
                onSubmit={(event) => void saveSession(event)}
              >
                <label>
                  Title
                  <input name="title" defaultValue={sessionContent.title} />
                </label>
                <label>
                  Abstract
                  <textarea
                    rows={7}
                    name="abstract"
                    defaultValue={sessionContent.abstract}
                  />
                </label>
                <button className={styles.primary}>Save version</button>
              </form>
              <History
                items={sessionContent.history}
                onRestore={restoreSession}
              />
            </section>
          ) : null}
          {speakerContent ? (
            <section className={styles.panel}>
              <div className={styles.sectionHead}>
                <h2>{speakerContent.displayName} · profile content</h2>
                <span>v{speakerContent.version}</span>
              </div>
              <form
                className={styles.stack}
                key={speakerContent.version}
                onSubmit={(event) => void saveSpeaker(event)}
              >
                <label>
                  Job title
                  <input
                    name="jobTitle"
                    defaultValue={speakerContent.jobTitle}
                  />
                </label>
                <label>
                  Company
                  <input name="company" defaultValue={speakerContent.company} />
                </label>
                <label>
                  Biography
                  <textarea
                    rows={6}
                    name="biography"
                    defaultValue={speakerContent.biography}
                  />
                </label>
                <button className={styles.primary}>Save profile version</button>
              </form>
            </section>
          ) : null}
        </section>
        <aside>
          <form
            className={styles.panel}
            onSubmit={(event) => void createRequest(event)}
          >
            <div className={styles.sectionHead}>
              <h2>New file request</h2>
              <span>Persisted assignment</span>
            </div>
            <div className={styles.stack}>
              <label>
                Request name
                <input
                  required
                  name="title"
                  placeholder="Upload Session Presentation"
                />
              </label>
              <label>
                Instructions
                <textarea
                  required
                  name="instructions"
                  rows={4}
                  placeholder="Final slide deck as a PDF, 16:9 aspect ratio."
                />
              </label>
              <label>
                Due date <small>{timezone}</small>
                <input required type="datetime-local" name="dueAt" />
              </label>
              <label>
                Handoff
                <select name="handoff">
                  <option value="session_file">Session file</option>
                  <option value="speaker_headshot">
                    Final speaker headshot
                  </option>
                </select>
              </label>
              <label>
                Maximum size (MB)
                <input
                  type="number"
                  name="maxMegabytes"
                  min="1"
                  max="250"
                  defaultValue="100"
                />
              </label>
              <fieldset>
                <legend>Accepted file types</legend>
                <label>
                  <input
                    type="checkbox"
                    name="mediaTypes"
                    value="application/pdf"
                    defaultChecked
                  />{" "}
                  PDF
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="mediaTypes"
                    value="application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    defaultChecked
                  />{" "}
                  PPTX
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="mediaTypes"
                    value="image/png"
                    defaultChecked
                  />{" "}
                  PNG
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="mediaTypes"
                    value="image/jpeg"
                    defaultChecked
                  />{" "}
                  JPEG
                </label>
              </fieldset>
              <fieldset>
                <legend>Assign speakers</legend>
                {speakers.map((speaker) => (
                  <label key={speaker.eventSpeakerId}>
                    <input
                      type="checkbox"
                      name="speakers"
                      value={speaker.eventSpeakerId}
                    />{" "}
                    {speaker.displayName}
                  </label>
                ))}
              </fieldset>
              <button className={styles.primary}>Create and assign</button>
            </div>
          </form>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2>ZIP exports</h2>
              <span>Latest versions</span>
            </div>
            {exports.length ? (
              exports.map((item) => (
                <div className={styles.exportRow} key={item.id}>
                  <Status value={item.status} />
                  <small>{formatDate(item.createdAt)}</small>
                  {item.status === "ready" ? (
                    <a
                      href={`/api/v1/organizer/events/${eventSlug}/file-exports/${item.id}/download`}
                    >
                      Download
                    </a>
                  ) : item.failureCode ? (
                    <em>{item.failureCode}</em>
                  ) : null}
                </div>
              ))
            ) : (
              <p className={styles.empty}>No export requests yet.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <article className={styles.metric}>
      <small>{label}</small>
      <strong className={danger ? styles.danger : ""}>{value}</strong>
    </article>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`${styles.status} ${styles[value] ?? ""}`}>
      {value.replace("_", " ")}
    </span>
  );
}
function History({
  items,
  onRestore,
}: {
  items: SessionContent["history"];
  onRestore: (version: number) => Promise<void>;
}) {
  return (
    <div className={styles.history}>
      <h3>Change history</h3>
      {items.map((item) => (
        <div key={item.version}>
          <span>
            <strong>
              v{item.version} · {item.createdByName}
            </strong>
            <small>
              {formatDate(item.createdAt)} ·{" "}
              {item.contentStatus.replace("_", " ")}
            </small>
          </span>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => void onRestore(item.version)}
          >
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "No due date";
}
function formatBytes(value: number) {
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(value / 1024)} KB`;
}
function showError(setter: (value: string) => void) {
  return (error: unknown) =>
    setter(
      error instanceof Error
        ? error.message
        : "The files workspace could not complete that action.",
    );
}
