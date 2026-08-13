import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SpeakerPortal } from "../speaker-operations/types";
import { jsonRequest, requestJson, sha256 } from "./api";
import { speakerFileWorkspaceState } from "./presentation";
import styles from "./files-deliverables.module.css";
import type { Deliverable } from "./types";

type LoadState = "loading" | "ready" | "error";

export function SpeakerFilesPage() {
  const { eventSlug = "" } = useParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [portal, setPortal] = useState<SpeakerPortal | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const portalRequest = requestJson<SpeakerPortal>(`/api/v1/speaker/events/${eventSlug}`);
    void portalRequest.then(setPortal).catch(() => setPortal(null));
    try {
      const nextDeliverables = await requestJson<Deliverable[]>(`/api/v1/speaker/events/${eventSlug}/files`);
      setDeliverables(nextDeliverables);
      setLoadState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your files could not be loaded.");
      setLoadState("error");
    }
  }, [eventSlug]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);
  useEffect(() => {
    if (loadState === "loading") return;
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }, [loadState]);

  function retryLoad() {
    setLoadState("loading");
    setLoadError(null);
    void load();
  }

  async function upload(row: Deliverable, file: File) {
    setBusy(row.id);
    try {
      const authorization = await requestJson<{ id: string; status: string; uploadUrl: string | null; failureCode: string | null }>(
        row.taskAssignmentId === null ? `/api/v1/speaker/events/${eventSlug}/profile/headshot-uploads` : "/api/v1/speaker/files/uploads",
        jsonRequest("POST", {
          ...(row.taskAssignmentId === null ? {} : { eventId: row.eventId, taskAssignmentId: row.taskAssignmentId }),
          originalName: file.name, mediaType: file.type, byteSize: file.size,
          checksumSha256: await sha256(file), idempotencyKey: crypto.randomUUID(),
        }),
      );
      if (!authorization.uploadUrl) throw new Error(`Upload blocked by external storage: ${authorization.failureCode ?? authorization.status}.`);
      const uploaded = await fetch(authorization.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!uploaded.ok) throw new Error((await uploaded.json().catch(() => null) as { error?: { message?: string } } | null)?.error?.message ?? "The private upload failed.");
      await requestJson(`/api/v1/speaker/files/uploads/${authorization.id}/finalize`, { method: "POST" });
      setMessage(`${file.name} saved as version ${row.latestVersion + 1}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function comment(event: React.FormEvent<HTMLFormElement>, versionId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    try {
      await requestJson(`/api/v1/speaker/events/${eventSlug}/files/versions/${versionId}/comments`, jsonRequest("POST", { body: new FormData(formElement).get("body") }));
      formElement.reset();
      setMessage("Comment added.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The comment could not be saved.");
    }
  }

  if (loadState === "loading") return <div className={styles.portal} aria-busy="true"><PageHeader headingRef={headingRef} /><div className={styles.loadingList} aria-label="Loading file requests"><span /><span /></div></div>;
  if (loadState === "error") return <div className={styles.portal}><PageHeader headingRef={headingRef} /><div className={styles.errorState} role="alert"><strong>File requests are unavailable.</strong><p>{loadError ?? "Your files could not be loaded."}</p><button className={styles.primary} type="button" onClick={retryLoad}>Retry loading files</button></div></div>;

  const pendingFileRequests = portal?.speaker.tasks.filter((task) => task.kind === "file_request" && task.status === "pending").length ?? 0;
  const workspaceState = speakerFileWorkspaceState(deliverables.length, pendingFileRequests);

  return <div className={styles.portal}>
    <PageHeader headingRef={headingRef} />
    {message ? <div className={styles.notice} role="status">{message}</div> : null}
    {workspaceState === "handoff_pending" ? <div className={styles.handoffState} role="status"><strong>File workspace setup is incomplete.</strong><p>{pendingFileRequests === 1 ? "A file request appears" : `${pendingFileRequests} file requests appear`} in Tasks, but no upload workspace is linked here. Ask the organizer to repair the deliverable handoff before uploading.</p><div><Link className={styles.secondary} to={`/speaker/events/${eventSlug}/tasks`}>Review tasks</Link><button className={styles.primary} type="button" onClick={retryLoad}>Retry</button></div></div> : workspaceState === "empty" ? <div className={styles.emptyState}><strong>No file requests assigned.</strong><p>When an organizer requests a presentation, headshot, or other deliverable, the private upload workspace will appear here.</p><Link className={styles.secondary} to={`/speaker/events/${eventSlug}/tasks`}>View speaker tasks</Link></div> : <div className={styles.portalList}>{deliverables.map((row) => <article className={styles.panel} key={row.id}><div className={styles.sectionHead}><div><h2>{row.taskTitle}</h2><small>{row.sessionTitle ?? "Speaker profile"} · due {formatDate(row.dueAt)}</small></div><span className={`${styles.status} ${styles[row.status] ?? ""}`}>{row.status.replace("_", " ")}</span></div><p>{row.instructions}</p><div className={styles.uploadBox}><strong>Accepted: {row.acceptedMediaTypes.map(labelType).join(", ")}</strong><small>Maximum file size: {Math.round(row.maxByteSize / 1024 / 1024)} MB. Files remain private and are checked before they are saved.</small><label className={styles.primary}>{busy === row.id ? "Checking…" : row.latestVersion ? "Upload new version" : "Choose file"}<input aria-label={`Upload a file for ${row.taskTitle}${row.sessionTitle ? `, ${row.sessionTitle}` : ""}`} disabled={busy === row.id} type="file" accept={row.acceptedMediaTypes.join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(row, file); }} /></label></div>{row.versions.map((version) => <div className={styles.version} key={version.id}><div><strong>v{version.version} · {version.originalName}</strong>{version.latest ? <span className={`${styles.status} ${styles.latest}`}>latest</span> : null}<small>{formatDate(version.createdAt)} · {(version.byteSize / 1024 / 1024).toFixed(1)} MB</small></div><a className={styles.download} href={`/api/v1/speaker/events/${eventSlug}/files/versions/${version.id}/download`}>Download v{version.version}</a><div className={styles.comments}>{version.comments.map((item) => <p key={item.id}><strong>{item.authorName}</strong> <time>{formatDate(item.createdAt)}</time><span>{item.body}</span></p>)}</div><form className={styles.commentForm} onSubmit={(event) => void comment(event, version.id)}><input aria-label={`Comment on ${row.taskTitle} version ${version.version}`} required name="body" placeholder="Add a comment…" /><button className={styles.secondary}>Comment</button></form></div>)}</article>)}</div>}
  </div>;
}

function PageHeader({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return <header className={styles.pageHead}><div><p className={styles.eyebrow}>Speaker portal</p><h1 ref={headingRef} tabIndex={-1}>Your files &amp; deliverables</h1><p>Only your assigned requests and private version history are visible here.</p></div></header>;
}

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "No due date"; }
function labelType(value: string) { return value === "application/pdf" ? "PDF" : value.includes("presentationml") ? "PPTX" : value.replace("image/", "").toUpperCase(); }
