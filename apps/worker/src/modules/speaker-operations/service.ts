import {
  eventMemberships,
  eventSpeakers,
  events,
  people,
  personEmailAliases,
  sessions,
  sessionSpeakers,
  speakerProfiles,
  speakerResources,
  speakerTaskAssignments,
  speakerTasks,
  type Database,
} from "@programflow/database";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import type {
  AddSpeakerInput,
  CreateSpeakerTaskInput,
  RosterQuery,
  SaveSpeakerResourceInput,
  SpeakerStatus,
  UpdateSpeakerInput,
} from "./contracts";
import { parseSpeakerCsv } from "./csv";
import { sanitizeSpeakerResourceHtml } from "./resource-sanitizer";

type SpeakerOperationsErrorCode =
  | "conflict"
  | "event_not_found"
  | "file_task_owned_elsewhere"
  | "forbidden"
  | "invalid_task_response"
  | "speaker_not_found"
  | "task_not_found";

export class SpeakerOperationsError extends Error {
  constructor(readonly code: SpeakerOperationsErrorCode, message: string) {
    super(message);
  }
}

export interface SpeakerTaskSummary {
  id: string;
  title: string;
  description: string;
  kind: "action" | "form" | "file_request";
  required: boolean;
  dueAt: Date | null;
  configuration: Record<string, unknown>;
  assignments: Array<{
    id: string;
    eventSpeakerId: string;
    displayName: string;
    status: "pending" | "complete";
    dueAt: Date | null;
    completedAt: Date | null;
    response: Record<string, unknown> | null;
  }>;
}

export interface SpeakerRosterItem {
  eventSpeakerId: string;
  personId: string;
  displayName: string;
  email: string | null;
  status: SpeakerStatus;
  biography: string;
  company: string;
  jobTitle: string;
  headshotFileId: string | null;
  socialLinks: Record<string, string>;
  logistics: Record<string, string>;
  taskProgress: { complete: number; total: number; overdue: number };
  sessionCount: number;
}

export interface SpeakerDetail extends SpeakerRosterItem {
  tasks: SpeakerTaskSummary["assignments"] extends Array<infer Assignment>
    ? Array<Assignment & { taskId: string; title: string; description: string; kind: "action" | "form" | "file_request"; required: boolean; configuration: Record<string, unknown> }>
    : never;
  assignedSessions: Array<{ id: string; title: string; abstract: string; contentStatus: "draft" | "in_review" | "approved"; role: string }>;
}

export interface SpeakerPortal {
  event: { id: string; slug: string; name: string };
  speaker: SpeakerDetail;
  resources: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    contentHtml: string;
    revision: number;
  }>;
}

interface EventRecord { id: string; slug: string; name: string }

export async function listSpeakerRoster(
  database: Database,
  actor: Actor,
  eventSlug: string,
  query: RosterQuery,
): Promise<SpeakerRosterItem[]> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const conditions = [eq(eventSpeakers.eventId, event.id)];
  if (query.status) conditions.push(eq(eventSpeakers.status, query.status));
  if (query.search) {
    const pattern = `%${query.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const search = or(
      ilike(people.displayName, pattern),
      ilike(people.canonicalEmail, pattern),
      ilike(speakerProfiles.company, pattern),
      ilike(speakerProfiles.jobTitle, pattern),
    );
    if (search) conditions.push(search);
  }

  const rows = await database.select({
    eventSpeakerId: eventSpeakers.id,
    personId: people.id,
    displayName: people.displayName,
    email: people.canonicalEmail,
    status: eventSpeakers.status,
    logistics: eventSpeakers.logistics,
    biography: speakerProfiles.biography,
    company: speakerProfiles.company,
    jobTitle: speakerProfiles.jobTitle,
    headshotFileId: speakerProfiles.headshotFileId,
    socialLinks: speakerProfiles.socialLinks,
  }).from(eventSpeakers)
    .innerJoin(people, eq(people.id, eventSpeakers.personId))
    .leftJoin(speakerProfiles, eq(speakerProfiles.personId, people.id))
    .where(and(...conditions))
    .orderBy(asc(people.displayName));

  const ids = rows.map((row) => row.eventSpeakerId);
  const [assignmentRows, sessionRows] = ids.length === 0 ? [[], []] : await Promise.all([
    database.select({
      eventSpeakerId: speakerTaskAssignments.eventSpeakerId,
      status: speakerTaskAssignments.status,
      dueAtOverride: speakerTaskAssignments.dueAtOverride,
      dueAt: speakerTasks.dueAt,
    }).from(speakerTaskAssignments)
      .innerJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
      .where(and(eq(speakerTasks.eventId, event.id), inArray(speakerTaskAssignments.eventSpeakerId, ids))),
    database.select({ eventSpeakerId: sessionSpeakers.eventSpeakerId })
      .from(sessionSpeakers)
      .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
      .where(and(eq(sessions.eventId, event.id), inArray(sessionSpeakers.eventSpeakerId, ids))),
  ]);
  const now = Date.now();

  return rows.map((row) => {
    const assignments = assignmentRows.filter((assignment) => assignment.eventSpeakerId === row.eventSpeakerId);
    const complete = assignments.filter((assignment) => assignment.status === "complete").length;
    const item = {
      ...row,
      biography: row.biography ?? "",
      company: row.company ?? "",
      jobTitle: row.jobTitle ?? "",
      headshotFileId: row.headshotFileId ?? null,
      socialLinks: row.socialLinks ?? {},
      taskProgress: {
        complete,
        total: assignments.length,
        overdue: assignments.filter((assignment) => {
          const dueAt = assignment.dueAtOverride ?? assignment.dueAt;
          return assignment.status === "pending" && Boolean(dueAt && dueAt.getTime() < now);
        }).length,
      },
      sessionCount: sessionRows.filter((session) => session.eventSpeakerId === row.eventSpeakerId).length,
    } satisfies SpeakerRosterItem;
    if (query.taskStatus === "complete" && (assignments.length === 0 || complete !== assignments.length)) return null;
    if (query.taskStatus === "incomplete" && !assignments.some((assignment) => assignment.status === "pending")) return null;
    return item;
  }).filter((item): item is SpeakerRosterItem => item !== null);
}

export async function getSpeakerDetail(
  database: Database,
  actor: Actor,
  eventSlug: string,
  eventSpeakerId: string,
): Promise<SpeakerDetail> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  return loadSpeakerDetail(database, event, eventSpeakerId);
}

export async function addSpeaker(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: AddSpeakerInput,
): Promise<SpeakerDetail> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const { eventSpeakerId } = await persistExplicitSpeaker(database, event.id, input);
  return loadSpeakerDetail(database, event, eventSpeakerId);
}

export async function importSpeakers(
  database: Database,
  actor: Actor,
  eventSlug: string,
  csv: string,
): Promise<{ imported: number; reused: number; rows: Array<{ row: number; eventSpeakerId: string }> }> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const parsed = parseSpeakerCsv(csv);
  const results: Array<{ row: number; eventSpeakerId: string; created: boolean }> = [];
  for (const row of parsed) {
    const persisted = await persistExplicitSpeaker(database, event.id, row.input);
    results.push({ row: row.row, ...persisted });
  }
  return {
    imported: results.filter((result) => result.created).length,
    reused: results.filter((result) => !result.created).length,
    rows: results.map(({ row, eventSpeakerId }) => ({ row, eventSpeakerId })),
  };
}

export async function updateSpeaker(
  database: Database,
  actor: Actor,
  eventSlug: string,
  eventSpeakerId: string,
  input: UpdateSpeakerInput,
): Promise<SpeakerDetail> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const speaker = await requireEventSpeaker(database, event.id, eventSpeakerId);
  await persistProfileUpdate(database, speaker.personId, eventSpeakerId, input);
  return loadSpeakerDetail(database, event, eventSpeakerId);
}

export async function updateSpeakerStatus(
  database: Database,
  actor: Actor,
  eventSlug: string,
  eventSpeakerId: string,
  status: SpeakerStatus,
): Promise<SpeakerDetail> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  await requireEventSpeaker(database, event.id, eventSpeakerId);
  await database.update(eventSpeakers).set({ status, updatedAt: new Date() }).where(eq(eventSpeakers.id, eventSpeakerId));
  return loadSpeakerDetail(database, event, eventSpeakerId);
}

export async function listSpeakerTasks(database: Database, actor: Actor, eventSlug: string): Promise<SpeakerTaskSummary[]> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  return loadTasks(database, event.id);
}

export async function createSpeakerTask(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: CreateSpeakerTaskInput,
): Promise<SpeakerTaskSummary> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const uniqueSpeakerIds = [...new Set(input.eventSpeakerIds)];
  const owned = await database.select({ id: eventSpeakers.id }).from(eventSpeakers)
    .where(and(eq(eventSpeakers.eventId, event.id), inArray(eventSpeakers.id, uniqueSpeakerIds)));
  if (owned.length !== uniqueSpeakerIds.length) throw new SpeakerOperationsError("speaker_not_found", "Every task assignee must be a speaker in this event.");

  const [existing] = await database.select({ id: speakerTasks.id }).from(speakerTasks)
    .where(and(eq(speakerTasks.eventId, event.id), eq(speakerTasks.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing) return loadTask(database, event.id, existing.id);

  const [created] = await database.insert(speakerTasks).values({
    eventId: event.id,
    title: input.title,
    description: input.description,
    kind: input.kind,
    required: input.required,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    configuration: input.configuration,
    idempotencyKey: input.idempotencyKey,
  }).onConflictDoNothing().returning({ id: speakerTasks.id });
  if (!created) {
    const [winner] = await database.select({ id: speakerTasks.id }).from(speakerTasks)
      .where(and(eq(speakerTasks.eventId, event.id), eq(speakerTasks.idempotencyKey, input.idempotencyKey))).limit(1);
    if (!winner) throw new SpeakerOperationsError("conflict", "The task could not be created.");
    return loadTask(database, event.id, winner.id);
  }
  await database.insert(speakerTaskAssignments).values(uniqueSpeakerIds.map((eventSpeakerId) => ({
    taskId: created.id,
    eventSpeakerId,
  }))).onConflictDoNothing();
  return loadTask(database, event.id, created.id);
}

export async function updateAssignmentDueDate(
  database: Database,
  actor: Actor,
  eventSlug: string,
  assignmentId: string,
  dueAt: string | null,
): Promise<SpeakerTaskSummary> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const [assignment] = await database.select({ taskId: speakerTaskAssignments.taskId })
    .from(speakerTaskAssignments)
    .innerJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .where(and(eq(speakerTaskAssignments.id, assignmentId), eq(speakerTasks.eventId, event.id))).limit(1);
  if (!assignment) throw new SpeakerOperationsError("task_not_found", "Task assignment not found.");
  await database.update(speakerTaskAssignments).set({ dueAtOverride: dueAt ? new Date(dueAt) : null, updatedAt: new Date() })
    .where(eq(speakerTaskAssignments.id, assignmentId));
  return loadTask(database, event.id, assignment.taskId);
}

export async function getSpeakerPortal(database: Database, actor: Actor, eventSlug: string): Promise<SpeakerPortal> {
  const event = await requireEvent(database, actor, eventSlug, "speaker");
  const [speaker] = await database.select({ id: eventSpeakers.id, status: eventSpeakers.status }).from(eventSpeakers)
    .where(and(eq(eventSpeakers.eventId, event.id), eq(eventSpeakers.personId, actor.personId))).limit(1);
  if (!speaker) throw new SpeakerOperationsError("speaker_not_found", "Your speaker participation was not found for this event.");
  const [detail, resources] = await Promise.all([
    loadSpeakerDetail(database, event, speaker.id),
    database.select({
      id: speakerResources.id,
      slug: speakerResources.slug,
      title: speakerResources.title,
      summary: speakerResources.summary,
      contentHtml: speakerResources.contentHtml,
      visibleToStatuses: speakerResources.visibleToStatuses,
      revision: speakerResources.revision,
    }).from(speakerResources)
      .where(and(eq(speakerResources.eventId, event.id), eq(speakerResources.status, "published")))
      .orderBy(asc(speakerResources.title)),
  ]);
  return {
    event,
    speaker: detail,
    resources: resources.filter((resource) => resource.visibleToStatuses.includes(speaker.status as "invited" | "onboarding" | "ready"))
      .map(({ visibleToStatuses: _visibleToStatuses, ...resource }) => resource),
  };
}

export async function updateOwnSpeakerProfile(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: UpdateSpeakerInput,
): Promise<SpeakerPortal> {
  const event = await requireEvent(database, actor, eventSlug, "speaker");
  const [speaker] = await database.select({ id: eventSpeakers.id }).from(eventSpeakers)
    .where(and(eq(eventSpeakers.eventId, event.id), eq(eventSpeakers.personId, actor.personId))).limit(1);
  if (!speaker) throw new SpeakerOperationsError("speaker_not_found", "Your speaker participation was not found for this event.");
  const speakerSafeInput = { ...input, logistics: undefined };
  await persistProfileUpdate(database, actor.personId, speaker.id, speakerSafeInput);
  return getSpeakerPortal(database, actor, eventSlug);
}

export async function completeOwnSpeakerTask(
  database: Database,
  actor: Actor,
  eventSlug: string,
  assignmentId: string,
  response: Record<string, unknown> | null,
): Promise<SpeakerPortal> {
  const event = await requireEvent(database, actor, eventSlug, "speaker");
  const [assignment] = await database.select({
    id: speakerTaskAssignments.id,
    kind: speakerTasks.kind,
    configuration: speakerTasks.configuration,
  }).from(speakerTaskAssignments)
    .innerJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, speakerTaskAssignments.eventSpeakerId))
    .where(and(
      eq(speakerTaskAssignments.id, assignmentId),
      eq(speakerTasks.eventId, event.id),
      eq(eventSpeakers.personId, actor.personId),
    )).limit(1);
  if (!assignment) throw new SpeakerOperationsError("task_not_found", "Task assignment not found.");
  if (assignment.kind === "file_request") {
    throw new SpeakerOperationsError("file_task_owned_elsewhere", "File requests must be completed through Files & Deliverables.");
  }
  validateTaskResponse(assignment.kind, assignment.configuration, response);
  await database.update(speakerTaskAssignments).set({
    status: "complete",
    response,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(speakerTaskAssignments.id, assignment.id));
  return getSpeakerPortal(database, actor, eventSlug);
}

export async function listSpeakerResources(database: Database, actor: Actor, eventSlug: string) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  return database.select().from(speakerResources).where(eq(speakerResources.eventId, event.id)).orderBy(desc(speakerResources.updatedAt));
}

export async function saveSpeakerResource(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: SaveSpeakerResourceInput,
) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const allowedEmbedOrigins = [...new Set(input.allowedEmbedOrigins.map((value) => new URL(value).origin))];
  const sanitized = sanitizeSpeakerResourceHtml(input.contentHtml, allowedEmbedOrigins);
  const [existing] = await database.select().from(speakerResources)
    .where(and(eq(speakerResources.eventId, event.id), eq(speakerResources.slug, input.slug))).limit(1);
  if (existing) {
    if (input.expectedRevision !== undefined && input.expectedRevision !== existing.revision) {
      throw new SpeakerOperationsError("conflict", "This resource changed after it was opened. Reload before saving again.");
    }
    const [updated] = await database.update(speakerResources).set({
      title: input.title,
      summary: input.summary,
      contentHtml: sanitized,
      status: input.status,
      visibleToStatuses: input.visibleToStatuses,
      allowedEmbedOrigins,
      revision: sql`${speakerResources.revision} + 1`,
      updatedAt: new Date(),
    }).where(eq(speakerResources.id, existing.id)).returning();
    return updated;
  }
  const [created] = await database.insert(speakerResources).values({
    eventId: event.id,
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    contentHtml: sanitized,
    status: input.status,
    visibleToStatuses: input.visibleToStatuses,
    allowedEmbedOrigins,
  }).returning();
  return created;
}

async function persistExplicitSpeaker(database: Database, eventId: string, input: AddSpeakerInput): Promise<{ eventSpeakerId: string; created: boolean }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  return database.transaction(async (transaction) => {
    const [alias] = await transaction.select({ personId: personEmailAliases.personId }).from(personEmailAliases)
      .where(eq(personEmailAliases.normalizedEmail, normalizedEmail)).limit(1);
    const [canonical] = alias ? [] : await transaction.select({ id: people.id }).from(people)
      .where(sql`lower(${people.canonicalEmail}) = ${normalizedEmail}`).limit(1);
    let personId = alias?.personId ?? canonical?.id;
    if (!personId) {
      const [created] = await transaction.insert(people).values({
        stableKey: `speaker:${normalizedEmail}`,
        displayName: input.displayName,
        canonicalEmail: normalizedEmail,
      }).returning({ id: people.id });
      if (!created) throw new SpeakerOperationsError("conflict", "The speaker person could not be created.");
      personId = created.id;
    } else {
      await transaction.update(people).set({ displayName: input.displayName, updatedAt: new Date() }).where(eq(people.id, personId));
    }
    await transaction.insert(personEmailAliases).values({
      personId,
      email: input.email,
      normalizedEmail,
      isCanonical: true,
    }).onConflictDoNothing();
    await transaction.insert(speakerProfiles).values({
      personId,
      biography: input.biography,
      company: input.company,
      jobTitle: input.jobTitle,
      socialLinks: input.socialLinks,
    }).onConflictDoUpdate({
      target: speakerProfiles.personId,
      set: {
        biography: input.biography,
        company: input.company,
        jobTitle: input.jobTitle,
        socialLinks: input.socialLinks,
        updatedAt: new Date(),
      },
    });
    await transaction.insert(eventMemberships).values({ eventId, personId, role: "speaker" }).onConflictDoNothing();
    const [before] = await transaction.select({ id: eventSpeakers.id }).from(eventSpeakers)
      .where(and(eq(eventSpeakers.eventId, eventId), eq(eventSpeakers.personId, personId))).limit(1);
    if (before) {
      if (Object.keys(input.logistics).length > 0) {
        await transaction.update(eventSpeakers).set({ logistics: input.logistics, updatedAt: new Date() }).where(eq(eventSpeakers.id, before.id));
      }
      return { eventSpeakerId: before.id, created: false };
    }
    const [createdSpeaker] = await transaction.insert(eventSpeakers).values({ eventId, personId, logistics: input.logistics })
      .returning({ id: eventSpeakers.id });
    if (!createdSpeaker) throw new SpeakerOperationsError("conflict", "The event speaker could not be created.");
    return { eventSpeakerId: createdSpeaker.id, created: true };
  });
}

async function persistProfileUpdate(database: Database, personId: string, eventSpeakerId: string, input: UpdateSpeakerInput): Promise<void> {
  await database.transaction(async (transaction) => {
    if (input.displayName !== undefined) {
      await transaction.update(people).set({ displayName: input.displayName, updatedAt: new Date() }).where(eq(people.id, personId));
    }
    const profileValues = {
      ...(input.biography !== undefined ? { biography: input.biography } : {}),
      ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
      updatedAt: new Date(),
    };
    await transaction.insert(speakerProfiles).values({
      personId,
      biography: input.biography ?? "",
      company: input.company ?? "",
      jobTitle: input.jobTitle ?? "",
      socialLinks: input.socialLinks ?? {},
    }).onConflictDoUpdate({ target: speakerProfiles.personId, set: profileValues });
    if (input.logistics !== undefined) {
      await transaction.update(eventSpeakers).set({ logistics: input.logistics, updatedAt: new Date() }).where(eq(eventSpeakers.id, eventSpeakerId));
    }
  });
}

async function loadSpeakerDetail(database: Database, event: EventRecord, eventSpeakerId: string): Promise<SpeakerDetail> {
  const [speaker] = await database.select({
    eventSpeakerId: eventSpeakers.id,
    personId: eventSpeakers.personId,
    displayName: people.displayName,
    email: people.canonicalEmail,
    status: eventSpeakers.status,
    logistics: eventSpeakers.logistics,
    biography: speakerProfiles.biography,
    company: speakerProfiles.company,
    jobTitle: speakerProfiles.jobTitle,
    headshotFileId: speakerProfiles.headshotFileId,
    socialLinks: speakerProfiles.socialLinks,
  }).from(eventSpeakers)
    .innerJoin(people, eq(people.id, eventSpeakers.personId))
    .leftJoin(speakerProfiles, eq(speakerProfiles.personId, people.id))
    .where(and(eq(eventSpeakers.id, eventSpeakerId), eq(eventSpeakers.eventId, event.id))).limit(1);
  if (!speaker) throw new SpeakerOperationsError("speaker_not_found", "Speaker not found in this event.");
  const [tasks, assignedSessions] = await Promise.all([
    database.select({
      id: speakerTaskAssignments.id,
      taskId: speakerTasks.id,
      title: speakerTasks.title,
      description: speakerTasks.description,
      kind: speakerTasks.kind,
      required: speakerTasks.required,
      dueAtOverride: speakerTaskAssignments.dueAtOverride,
      dueAt: speakerTasks.dueAt,
      configuration: speakerTasks.configuration,
      eventSpeakerId: speakerTaskAssignments.eventSpeakerId,
      displayName: people.displayName,
      status: speakerTaskAssignments.status,
      completedAt: speakerTaskAssignments.completedAt,
      response: speakerTaskAssignments.response,
    }).from(speakerTaskAssignments)
      .innerJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
      .innerJoin(eventSpeakers, eq(eventSpeakers.id, speakerTaskAssignments.eventSpeakerId))
      .innerJoin(people, eq(people.id, eventSpeakers.personId))
      .where(and(eq(speakerTaskAssignments.eventSpeakerId, eventSpeakerId), eq(speakerTasks.eventId, event.id)))
      .orderBy(asc(speakerTasks.dueAt), asc(speakerTasks.title)),
    database.select({
      id: sessions.id,
      title: sessions.title,
      abstract: sessions.abstract,
      contentStatus: sessions.contentStatus,
      role: sessionSpeakers.role,
    }).from(sessionSpeakers)
      .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
      .where(and(eq(sessionSpeakers.eventSpeakerId, eventSpeakerId), eq(sessions.eventId, event.id)))
      .orderBy(asc(sessions.title)),
  ]);
  const normalizedTasks = tasks.map(({ dueAtOverride, dueAt, ...task }) => ({ ...task, dueAt: dueAtOverride ?? dueAt }));
  const complete = normalizedTasks.filter((task) => task.status === "complete").length;
  const now = Date.now();
  return {
    ...speaker,
    biography: speaker.biography ?? "",
    company: speaker.company ?? "",
    jobTitle: speaker.jobTitle ?? "",
    headshotFileId: speaker.headshotFileId ?? null,
    socialLinks: speaker.socialLinks ?? {},
    taskProgress: {
      complete,
      total: normalizedTasks.length,
      overdue: normalizedTasks.filter((task) => task.status === "pending" && Boolean(task.dueAt && task.dueAt.getTime() < now)).length,
    },
    sessionCount: assignedSessions.length,
    tasks: normalizedTasks,
    assignedSessions,
  };
}

async function loadTasks(database: Database, eventId: string): Promise<SpeakerTaskSummary[]> {
  const rows = await database.select({
    taskId: speakerTasks.id,
    title: speakerTasks.title,
    description: speakerTasks.description,
    kind: speakerTasks.kind,
    required: speakerTasks.required,
    dueAt: speakerTasks.dueAt,
    configuration: speakerTasks.configuration,
    assignmentId: speakerTaskAssignments.id,
    eventSpeakerId: speakerTaskAssignments.eventSpeakerId,
    assignmentStatus: speakerTaskAssignments.status,
    dueAtOverride: speakerTaskAssignments.dueAtOverride,
    completedAt: speakerTaskAssignments.completedAt,
    response: speakerTaskAssignments.response,
    displayName: people.displayName,
  }).from(speakerTasks)
    .leftJoin(speakerTaskAssignments, eq(speakerTaskAssignments.taskId, speakerTasks.id))
    .leftJoin(eventSpeakers, eq(eventSpeakers.id, speakerTaskAssignments.eventSpeakerId))
    .leftJoin(people, eq(people.id, eventSpeakers.personId))
    .where(eq(speakerTasks.eventId, eventId))
    .orderBy(asc(speakerTasks.dueAt), asc(speakerTasks.title), asc(people.displayName));
  const summaries = new Map<string, SpeakerTaskSummary>();
  for (const row of rows) {
    let task = summaries.get(row.taskId);
    if (!task) {
      task = {
        id: row.taskId,
        title: row.title,
        description: row.description,
        kind: row.kind,
        required: row.required,
        dueAt: row.dueAt,
        configuration: row.configuration,
        assignments: [],
      };
      summaries.set(row.taskId, task);
    }
    if (row.assignmentId && row.eventSpeakerId && row.displayName && row.assignmentStatus) {
      task.assignments.push({
        id: row.assignmentId,
        eventSpeakerId: row.eventSpeakerId,
        displayName: row.displayName,
        status: row.assignmentStatus,
        dueAt: row.dueAtOverride ?? row.dueAt,
        completedAt: row.completedAt,
        response: row.response,
      });
    }
  }
  return [...summaries.values()];
}

async function loadTask(database: Database, eventId: string, taskId: string): Promise<SpeakerTaskSummary> {
  const tasks = await loadTasks(database, eventId);
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new SpeakerOperationsError("task_not_found", "Task not found.");
  return task;
}

async function requireEvent(database: Database, actor: Actor, eventSlug: string, role: "organizer" | "speaker"): Promise<EventRecord> {
  const candidates = await database.select({ id: events.id, slug: events.slug, name: events.name }).from(events).where(eq(events.slug, eventSlug));
  if (candidates.length === 0) throw new SpeakerOperationsError("event_not_found", "Event not found.");
  const event = candidates.find((candidate) => actorCanAccessEvent(actor, candidate.id, role));
  if (!event) throw new SpeakerOperationsError("forbidden", `${role === "organizer" ? "Organizer" : "Speaker"} access is required for this event.`);
  return event;
}

async function requireEventSpeaker(database: Database, eventId: string, eventSpeakerId: string): Promise<{ id: string; personId: string }> {
  const [speaker] = await database.select({ id: eventSpeakers.id, personId: eventSpeakers.personId }).from(eventSpeakers)
    .where(and(eq(eventSpeakers.id, eventSpeakerId), eq(eventSpeakers.eventId, eventId))).limit(1);
  if (!speaker) throw new SpeakerOperationsError("speaker_not_found", "Speaker not found in this event.");
  return speaker;
}

function validateTaskResponse(kind: "action" | "form", configuration: Record<string, unknown>, response: Record<string, unknown> | null): void {
  if (kind === "action") return;
  const fields = Array.isArray(configuration.fields) ? configuration.fields : [];
  for (const field of fields) {
    if (!isFormField(field) || !field.required) continue;
    const value = response?.[field.key];
    if (value === undefined || value === null || value === "") {
      throw new SpeakerOperationsError("invalid_task_response", `${field.label ?? field.key} is required.`);
    }
  }
}

function isFormField(value: unknown): value is { key: string; label?: string; required?: boolean } {
  return typeof value === "object" && value !== null && "key" in value && typeof value.key === "string";
}
