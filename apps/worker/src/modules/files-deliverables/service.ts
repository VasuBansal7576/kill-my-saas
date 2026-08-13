import { RequestUploadCommandSchema } from "@programflow/contracts";
import {
  decisions,
  deliverables,
  deliverableTransitions,
  deliverableVersions,
  eventSpeakers,
  events,
  fileBundleExports,
  fileComments,
  fileObjects,
  fileUploadAuthorizations,
  people,
  sessions,
  sessionSpeakers,
  sessionVersions,
  speakerProfiles,
  speakerProfileVersions,
  speakerTaskAssignments,
  speakerTasks,
  type Database,
} from "@programflow/database";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import type { CreateFileRequestInput, UpdateSessionContentInput, UpdateSpeakerContentInput } from "./contracts";
import { canAccessPrivateSpeakerFile } from "./authorization";
import type { PrivateFileStore } from "./storage";
import { StorageUnavailableError, StorageValidationError } from "./storage";
import { createZip, safePath } from "./zip";
import { releasedSpeakerDeliverable } from "../session-release-visibility";

type FileErrorCode =
  | "conflict"
  | "event_not_found"
  | "file_not_found"
  | "forbidden"
  | "invalid_file"
  | "invalid_transition"
  | "storage_unavailable"
  | "task_not_found";

export class FilesDeliverablesError extends Error {
  constructor(readonly code: FileErrorCode, message: string) { super(message); }
}

export interface DeliverableRow {
  id: string;
  eventId: string;
  taskAssignmentId: string | null;
  eventSpeakerId: string;
  personId: string;
  speakerName: string;
  taskTitle: string;
  instructions: string;
  dueAt: Date | null;
  sessionId: string | null;
  sessionTitle: string | null;
  status: "pending" | "submitted" | "changes_requested" | "approved";
  latestVersion: number;
  acceptedMediaTypes: string[];
  maxByteSize: number;
  handoff: "session_file" | "speaker_headshot";
  versions: Array<{
    id: string;
    version: number;
    originalName: string;
    mediaType: string;
    byteSize: number;
    checksumSha256: string;
    uploadedByPersonId: string;
    createdAt: Date;
    latest: boolean;
    comments: Array<{ id: string; authorPersonId: string; authorName: string; body: string; createdAt: Date }>;
  }>;
}

interface FileRequestConfiguration {
  [key: string]: unknown;
  acceptedMediaTypes: string[];
  maxByteSize: number;
  handoff: "session_file" | "speaker_headshot";
}

interface BundleManifest {
  [key: string]: unknown;
  format: "programflow.files.v1";
  grouping: "session" | "speaker" | "flat";
  generatedAt: string;
  entries: Array<{
    deliverableId: string;
    version: number;
    storageKey: string;
    archivePath: string;
    originalName: string;
    byteSize: number;
    checksumSha256: string;
  }>;
}

export async function createFileRequest(database: Database, actor: Actor, eventSlug: string, input: CreateFileRequestInput) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const eventSpeakerIds = [...new Set(input.eventSpeakerIds)];
  const ownedSpeakers = await database.select({ id: eventSpeakers.id }).from(eventSpeakers)
    .where(and(eq(eventSpeakers.eventId, event.id), inArray(eventSpeakers.id, eventSpeakerIds)));
  if (ownedSpeakers.length !== eventSpeakerIds.length) throw new FilesDeliverablesError("task_not_found", "Every assignee must be a speaker in this event.");

  const [existing] = await database.select({ id: speakerTasks.id }).from(speakerTasks)
    .where(and(eq(speakerTasks.eventId, event.id), eq(speakerTasks.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing) return loadFileRequest(database, event.id, existing.id);

  const configuration: FileRequestConfiguration = {
    acceptedMediaTypes: input.acceptedMediaTypes,
    maxByteSize: input.maxByteSize,
    handoff: input.handoff,
  };
  const taskId = await database.transaction(async (transaction) => {
    const [task] = await transaction.insert(speakerTasks).values({
      eventId: event.id,
      title: input.title,
      description: input.instructions,
      kind: "file_request",
      required: true,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      configuration,
      idempotencyKey: input.idempotencyKey,
    }).returning({ id: speakerTasks.id });
    if (!task) throw new FilesDeliverablesError("conflict", "The file request could not be created.");
    for (const eventSpeakerId of eventSpeakerIds) {
      const [assignment] = await transaction.insert(speakerTaskAssignments).values({ taskId: task.id, eventSpeakerId })
        .returning({ id: speakerTaskAssignments.id });
      if (!assignment) throw new FilesDeliverablesError("conflict", "A file request assignment could not be created.");
      const [session] = await transaction.select({ id: sessions.id }).from(sessionSpeakers)
        .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
        .where(and(eq(sessionSpeakers.eventSpeakerId, eventSpeakerId), eq(sessions.eventId, event.id)))
        .orderBy(asc(sessions.createdAt)).limit(1);
      const [deliverable] = await transaction.insert(deliverables).values({
        eventId: event.id,
        taskAssignmentId: assignment.id,
        eventSpeakerId,
        sessionId: input.handoff === "session_file" ? session?.id : null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      }).returning({ id: deliverables.id });
      if (!deliverable) throw new FilesDeliverablesError("conflict", "A speaker deliverable could not be created.");
      await transaction.insert(deliverableTransitions).values({
        deliverableId: deliverable.id,
        fromStatus: null,
        toStatus: "pending",
        actorPersonId: actor.personId,
        reason: "File request assigned",
      });
    }
    return task.id;
  });
  return loadFileRequest(database, event.id, taskId);
}

export async function listOrganizerDeliverables(database: Database, actor: Actor, eventSlug: string): Promise<DeliverableRow[]> {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  return loadDeliverables(database, event.id);
}

export async function listOwnDeliverables(database: Database, actor: Actor, eventSlug: string): Promise<DeliverableRow[]> {
  const event = await requireEvent(database, actor, eventSlug, "speaker");
  return loadDeliverables(database, event.id, actor.personId);
}

export async function requestUpload(database: Database, actor: Actor, commandValue: unknown, storage: PrivateFileStore) {
  const command = RequestUploadCommandSchema.parse(commandValue);
  const isOrganizer = actorCanAccessEvent(actor, command.eventId, "organizer");
  const isSpeaker = actorCanAccessEvent(actor, command.eventId, "speaker");
  if (!isOrganizer && !isSpeaker) throw new FilesDeliverablesError("forbidden", "Organizer or assigned-speaker access is required to upload this deliverable.");
  const [assignment] = await database.select({
    deliverableId: deliverables.id,
    eventSpeakerId: deliverables.eventSpeakerId,
    personId: eventSpeakers.personId,
    configuration: speakerTasks.configuration,
  }).from(speakerTaskAssignments)
    .innerJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .innerJoin(deliverables, eq(deliverables.taskAssignmentId, speakerTaskAssignments.id))
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, speakerTaskAssignments.eventSpeakerId))
    .where(and(eq(speakerTaskAssignments.id, command.taskAssignmentId), eq(speakerTasks.eventId, command.eventId))).limit(1);
  if (!assignment) throw new FilesDeliverablesError("task_not_found", "The file request assignment was not found.");
  if (!isOrganizer) {
    if (assignment.personId !== actor.personId) throw new FilesDeliverablesError("file_not_found", "The file request assignment was not found.");
    await requireSpeakerVisibleDeliverable(database, command.eventId, assignment.deliverableId, actor.personId);
  }
  const policy = filePolicy(assignment.configuration);
  if (!policy.acceptedMediaTypes.includes(command.mediaType) || command.byteSize > policy.maxByteSize) {
    throw new FilesDeliverablesError("invalid_file", `Accepted types: ${policy.acceptedMediaTypes.join(", ")}; maximum ${formatBytes(policy.maxByteSize)}.`);
  }
  const [existing] = await database.select().from(fileUploadAuthorizations)
    .where(and(eq(fileUploadAuthorizations.eventId, command.eventId), eq(fileUploadAuthorizations.idempotencyKey, command.idempotencyKey))).limit(1);
  if (existing) return uploadAuthorizationResponse(existing, storage.configured);

  const authorizationId = crypto.randomUUID();
  const storageKey = `events/${command.eventId}/quarantine/${authorizationId}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const status = storage.configured ? "authorized" : "blocked_external";
  const created = await database.transaction(async (transaction) => {
    const [file] = await transaction.insert(fileObjects).values({
      eventId: command.eventId,
      ownerPersonId: assignment.personId,
      storageKey,
      originalName: command.originalName,
      mediaType: command.mediaType,
      byteSize: command.byteSize,
      checksumSha256: command.checksumSha256,
    }).returning({ id: fileObjects.id });
    if (!file) throw new FilesDeliverablesError("conflict", "The quarantine file record could not be created.");
    return (await transaction.insert(fileUploadAuthorizations).values({
      id: authorizationId,
      eventId: command.eventId,
      deliverableId: assignment.deliverableId,
      requestedByPersonId: actor.personId,
      fileObjectId: file.id,
      status,
      idempotencyKey: command.idempotencyKey,
      expiresAt,
      failureCode: storage.configured ? null : "storage_not_configured",
    }).returning())[0];
  });
  if (!created) throw new FilesDeliverablesError("conflict", "The upload authorization could not be persisted.");
  return uploadAuthorizationResponse(created, storage.configured);
}

export async function requestProfileHeadshotUpload(
  database: Database,
  actor: Actor,
  eventSlug: string,
  command: { originalName: string; mediaType: "image/png" | "image/jpeg" | "image/webp"; byteSize: number; checksumSha256: string; idempotencyKey: string },
  storage: PrivateFileStore,
) {
  const event = await requireEvent(database, actor, eventSlug, "speaker");
  const [speaker] = await database.select({ id: eventSpeakers.id }).from(eventSpeakers)
    .where(and(eq(eventSpeakers.eventId, event.id), eq(eventSpeakers.personId, actor.personId))).limit(1);
  if (!speaker) throw new FilesDeliverablesError("task_not_found", "Your speaker profile was not found for this event.");
  return requestDirectProfileHeadshotUpload(database, actor, event.id, speaker.id, actor.personId, command, storage);
}

export async function requestOrganizerProfileHeadshotUpload(
  database: Database,
  actor: Actor,
  eventSlug: string,
  eventSpeakerId: string,
  command: { originalName: string; mediaType: "image/png" | "image/jpeg" | "image/webp"; byteSize: number; checksumSha256: string; idempotencyKey: string },
  storage: PrivateFileStore,
) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const [speaker] = await database.select({ id: eventSpeakers.id, personId: eventSpeakers.personId }).from(eventSpeakers)
    .where(and(eq(eventSpeakers.eventId, event.id), eq(eventSpeakers.id, eventSpeakerId))).limit(1);
  if (!speaker) throw new FilesDeliverablesError("task_not_found", "The speaker profile was not found for this event.");
  return requestDirectProfileHeadshotUpload(database, actor, event.id, speaker.id, speaker.personId, command, storage);
}

async function requestDirectProfileHeadshotUpload(
  database: Database,
  actor: Actor,
  eventId: string,
  eventSpeakerId: string,
  ownerPersonId: string,
  command: { originalName: string; mediaType: "image/png" | "image/jpeg" | "image/webp"; byteSize: number; checksumSha256: string; idempotencyKey: string },
  storage: PrivateFileStore,
) {
  const [existing] = await database.select().from(fileUploadAuthorizations)
    .where(and(eq(fileUploadAuthorizations.eventId, eventId), eq(fileUploadAuthorizations.idempotencyKey, command.idempotencyKey))).limit(1);
  if (existing) return uploadAuthorizationResponse(existing, storage.configured);

  const [profileDeliverable] = await database.select({ id: deliverables.id }).from(deliverables)
    .where(and(eq(deliverables.eventId, eventId), eq(deliverables.eventSpeakerId, eventSpeakerId), isNull(deliverables.taskAssignmentId))).limit(1);
  const authorizationId = crypto.randomUUID();
  const storageKey = `events/${eventId}/quarantine/${authorizationId}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const status = storage.configured ? "authorized" : "blocked_external";
  const created = await database.transaction(async (transaction) => {
    let deliverableId = profileDeliverable?.id;
    if (!deliverableId) {
      const [profileFile] = await transaction.insert(deliverables).values({
        eventId,
        eventSpeakerId,
      }).returning({ id: deliverables.id });
      deliverableId = profileFile?.id;
    }
    if (!deliverableId) throw new FilesDeliverablesError("conflict", "The profile file container could not be created.");
    const [file] = await transaction.insert(fileObjects).values({
      eventId,
      ownerPersonId,
      storageKey,
      originalName: command.originalName,
      mediaType: command.mediaType,
      byteSize: command.byteSize,
      checksumSha256: command.checksumSha256,
    }).returning({ id: fileObjects.id });
    if (!file) throw new FilesDeliverablesError("conflict", "The profile image record could not be created.");
    return (await transaction.insert(fileUploadAuthorizations).values({
      id: authorizationId,
      eventId,
      deliverableId,
      requestedByPersonId: actor.personId,
      fileObjectId: file.id,
      status,
      idempotencyKey: command.idempotencyKey,
      expiresAt,
      failureCode: storage.configured ? null : "storage_not_configured",
    }).returning())[0];
  });
  if (!created) throw new FilesDeliverablesError("conflict", "The profile image upload could not be authorized.");
  return uploadAuthorizationResponse(created, storage.configured);
}

export async function downloadOwnHeadshot(database: Database, actor: Actor, eventSlug: string, storage: PrivateFileStore) {
  const event = await requireEvent(database, actor, eventSlug, "speaker");
  const [file] = await database.select({ storageKey: fileObjects.storageKey, mediaType: fileObjects.mediaType }).from(eventSpeakers)
    .innerJoin(speakerProfiles, eq(speakerProfiles.personId, eventSpeakers.personId))
    .innerJoin(fileObjects, eq(fileObjects.id, speakerProfiles.headshotFileId))
    .where(and(eq(eventSpeakers.eventId, event.id), eq(eventSpeakers.personId, actor.personId), eq(fileObjects.verificationStatus, "verified"))).limit(1);
  if (!file) throw new FilesDeliverablesError("file_not_found", "Your verified profile headshot was not found.");
  try {
    const bytes = await storage.read(file.storageKey);
    if (!bytes) throw new FilesDeliverablesError("file_not_found", "Your verified profile headshot is missing from storage.");
    return new Response(Uint8Array.from(bytes).buffer, { headers: { "content-type": file.mediaType, "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof StorageUnavailableError) throw new FilesDeliverablesError("storage_unavailable", error.message);
    throw error;
  }
}

export async function uploadQuarantineObject(database: Database, actor: Actor, authorizationId: string, body: ReadableStream | null, storage: PrivateFileStore) {
  const authorization = await requireUploadAuthorization(database, actor, authorizationId);
  if (authorization.status === "uploaded" || authorization.status === "finalized") return { status: authorization.status };
  if (authorization.expiresAt.getTime() <= Date.now()) {
    await database.update(fileUploadAuthorizations).set({ status: "expired", failureCode: "authorization_expired" }).where(eq(fileUploadAuthorizations.id, authorizationId));
    throw new FilesDeliverablesError("invalid_file", "This upload authorization has expired.");
  }
  try {
    await storage.putQuarantine(authorization.storageKey, body, {
      byteSize: authorization.byteSize,
      mediaType: authorization.mediaType,
      checksumSha256: authorization.checksumSha256,
    });
    await database.update(fileUploadAuthorizations).set({ status: "uploaded", uploadedAt: new Date(), failureCode: null })
      .where(eq(fileUploadAuthorizations.id, authorization.id));
    return { status: "uploaded" as const };
  } catch (error) {
    const unavailable = error instanceof StorageUnavailableError;
    const failureCode = unavailable ? error.code : error instanceof StorageValidationError ? error.code : "r2_upload_failed";
    await database.transaction(async (transaction) => {
      await transaction.update(fileUploadAuthorizations).set({ status: unavailable ? "blocked_external" : "rejected", failureCode })
        .where(eq(fileUploadAuthorizations.id, authorization.id));
      await transaction.update(fileObjects).set({ verificationStatus: "rejected", rejectionReason: failureCode })
        .where(eq(fileObjects.id, authorization.fileObjectId));
    });
    throw new FilesDeliverablesError(unavailable ? "storage_unavailable" : "invalid_file", error instanceof Error ? error.message : "The upload failed validation.");
  }
}

export async function finalizeUpload(database: Database, actor: Actor, authorizationId: string, storage: PrivateFileStore) {
  const authorization = await requireUploadAuthorization(database, actor, authorizationId);
  const speakerPersonId = actorCanAccessEvent(actor, authorization.eventId, "organizer") ? undefined : actor.personId;
  if (authorization.status === "finalized") return loadDeliverable(database, authorization.eventId, authorization.deliverableId, speakerPersonId);
  if (authorization.status !== "uploaded") throw new FilesDeliverablesError("invalid_transition", "The quarantine upload must finish before finalization.");
  let stored;
  try { stored = await storage.inspect(authorization.storageKey); }
  catch (error) {
    if (error instanceof StorageUnavailableError) {
      await database.update(fileUploadAuthorizations).set({ status: "blocked_external", failureCode: error.code }).where(eq(fileUploadAuthorizations.id, authorization.id));
      throw new FilesDeliverablesError("storage_unavailable", error.message);
    }
    throw error;
  }
  if (!stored || stored.byteSize !== authorization.byteSize || stored.mediaType !== authorization.mediaType || stored.checksumSha256 !== authorization.checksumSha256) {
    await database.transaction(async (transaction) => {
      await transaction.update(fileUploadAuthorizations).set({ status: "rejected", failureCode: "stored_object_mismatch" }).where(eq(fileUploadAuthorizations.id, authorization.id));
      await transaction.update(fileObjects).set({ verificationStatus: "rejected", rejectionReason: "stored_object_mismatch" }).where(eq(fileObjects.id, authorization.fileObjectId));
    });
    throw new FilesDeliverablesError("invalid_file", "The stored quarantine object does not match the upload authorization.");
  }

  await database.transaction(async (transaction) => {
    const [current] = await transaction.select({ latestVersion: deliverables.latestVersion, status: deliverables.status, eventSpeakerId: deliverables.eventSpeakerId })
      .from(deliverables).where(eq(deliverables.id, authorization.deliverableId)).limit(1);
    if (!current) throw new FilesDeliverablesError("file_not_found", "The deliverable no longer exists.");
    const version = current.latestVersion + 1;
    await transaction.update(fileObjects).set({ verificationStatus: "verified", verifiedAt: new Date() }).where(eq(fileObjects.id, authorization.fileObjectId));
    await transaction.insert(deliverableVersions).values({
      deliverableId: authorization.deliverableId,
      version,
      fileObjectId: authorization.fileObjectId,
      uploadedByPersonId: actor.personId,
    });
    await transaction.update(deliverables).set({ status: "submitted", latestVersion: version, updatedAt: new Date() })
      .where(and(eq(deliverables.id, authorization.deliverableId), eq(deliverables.latestVersion, current.latestVersion)));
    await transaction.insert(deliverableTransitions).values({
      deliverableId: authorization.deliverableId,
      fromStatus: current.status,
      toStatus: "submitted",
      actorPersonId: actor.personId,
      reason: version === 1 ? "First verified upload" : `Verified upload v${version}`,
    });
    if (authorization.taskAssignmentId) {
      await transaction.update(speakerTaskAssignments).set({ status: "complete", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(speakerTaskAssignments.id, authorization.taskAssignmentId));
    }
    if (authorization.handoff === "speaker_headshot") {
      const [profile] = await transaction.select().from(speakerProfiles).where(eq(speakerProfiles.personId, authorization.ownerPersonId)).limit(1);
      if (profile) {
        const [latestProfile] = await transaction.select({ version: speakerProfileVersions.version }).from(speakerProfileVersions)
          .where(eq(speakerProfileVersions.speakerProfileId, profile.id)).orderBy(desc(speakerProfileVersions.version)).limit(1);
        let nextVersion = (latestProfile?.version ?? 0) + 1;
        if (!latestProfile) {
          await transaction.insert(speakerProfileVersions).values({ speakerProfileId: profile.id, version: 1, snapshot: profileSnapshot(profile), createdByPersonId: actor.personId });
          nextVersion = 2;
        }
        await transaction.update(speakerProfiles).set({ headshotFileId: authorization.fileObjectId, updatedAt: new Date() }).where(eq(speakerProfiles.id, profile.id));
        await transaction.insert(speakerProfileVersions).values({
          speakerProfileId: profile.id,
          version: nextVersion,
          snapshot: profileSnapshot({ ...profile, headshotFileId: authorization.fileObjectId }),
          createdByPersonId: actor.personId,
        });
      }
    }
    await transaction.update(fileUploadAuthorizations).set({ status: "finalized", finalizedAt: new Date(), failureCode: null })
      .where(eq(fileUploadAuthorizations.id, authorization.id));
  });
  return loadDeliverable(database, authorization.eventId, authorization.deliverableId, speakerPersonId);
}

export async function addFileComment(database: Database, actor: Actor, eventSlug: string, versionId: string, body: string) {
  const event = await requireEventAnyRole(database, actor, eventSlug);
  const version = await requireVersionAccess(database, actor, event.id, versionId);
  await database.insert(fileComments).values({ deliverableVersionId: version.id, authorPersonId: actor.personId, body });
  return loadDeliverable(database, event.id, version.deliverableId, actorCanAccessEvent(actor, event.id, "organizer") ? undefined : actor.personId);
}

export async function reviewDeliverable(database: Database, actor: Actor, eventSlug: string, deliverableId: string, status: "changes_requested" | "approved", reason: string | null) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const [current] = await database.select({ status: deliverables.status, latestVersion: deliverables.latestVersion }).from(deliverables)
    .where(and(eq(deliverables.id, deliverableId), eq(deliverables.eventId, event.id))).limit(1);
  if (!current) throw new FilesDeliverablesError("file_not_found", "Deliverable not found.");
  if (current.latestVersion === 0 || !["submitted", "changes_requested"].includes(current.status)) throw new FilesDeliverablesError("invalid_transition", "Only a submitted deliverable can be reviewed.");
  await database.transaction(async (transaction) => {
    await transaction.update(deliverables).set({ status, updatedAt: new Date() }).where(eq(deliverables.id, deliverableId));
    await transaction.insert(deliverableTransitions).values({ deliverableId, fromStatus: current.status, toStatus: status, actorPersonId: actor.personId, reason });
  });
  return loadDeliverable(database, event.id, deliverableId);
}

export async function downloadVersion(database: Database, actor: Actor, eventSlug: string, versionId: string, storage: PrivateFileStore) {
  const event = await requireEventAnyRole(database, actor, eventSlug);
  const version = await requireVersionAccess(database, actor, event.id, versionId);
  try {
    const response = await storage.download(version.storageKey, version.originalName, version.mediaType);
    if (!response) throw new FilesDeliverablesError("file_not_found", "The private object is missing from storage.");
    return response;
  } catch (error) {
    if (error instanceof StorageUnavailableError) throw new FilesDeliverablesError("storage_unavailable", error.message);
    throw error;
  }
}

export async function updateSessionContent(database: Database, actor: Actor, eventSlug: string, sessionId: string, input: UpdateSessionContentInput) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const [session] = await database.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.eventId, event.id))).limit(1);
  if (!session) throw new FilesDeliverablesError("file_not_found", "Session not found.");
  if (session.revision !== input.expectedRevision) throw new FilesDeliverablesError("conflict", "This session changed after it was opened. Reload and try again.");
  const contentStatus = session.contentStatus === "approved" ? "in_review" : session.contentStatus;
  await database.transaction(async (transaction) => {
    await transaction.insert(sessionVersions).values({ sessionId: session.id, version: session.revision, title: session.title, abstract: session.abstract, contentStatus: session.contentStatus, createdByPersonId: actor.personId }).onConflictDoNothing();
    await transaction.update(sessions).set({ title: input.title, abstract: input.abstract, contentStatus, revision: session.revision + 1, updatedAt: new Date() })
      .where(and(eq(sessions.id, session.id), eq(sessions.revision, session.revision)));
    await transaction.insert(sessionVersions).values({ sessionId: session.id, version: session.revision + 1, title: input.title, abstract: input.abstract, contentStatus, createdByPersonId: actor.personId });
  });
  return loadSessionContent(database, event.id, session.id);
}

export async function getSessionContent(database: Database, actor: Actor, eventSlug: string, sessionId: string) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  return loadSessionContent(database, event.id, sessionId);
}

export async function setSessionApproval(database: Database, actor: Actor, eventSlug: string, sessionId: string, status: "draft" | "in_review" | "approved", expectedRevision: number) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const [session] = await database.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.eventId, event.id))).limit(1);
  if (!session) throw new FilesDeliverablesError("file_not_found", "Session not found.");
  if (session.revision !== expectedRevision) throw new FilesDeliverablesError("conflict", "This session changed after it was opened. Reload and try again.");
  await database.transaction(async (transaction) => {
    await transaction.insert(sessionVersions).values({ sessionId: session.id, version: session.revision, title: session.title, abstract: session.abstract, contentStatus: session.contentStatus, createdByPersonId: actor.personId }).onConflictDoNothing();
    await transaction.update(sessions).set({ contentStatus: status, revision: session.revision + 1, updatedAt: new Date() }).where(eq(sessions.id, session.id));
    await transaction.insert(sessionVersions).values({ sessionId: session.id, version: session.revision + 1, title: session.title, abstract: session.abstract, contentStatus: status, createdByPersonId: actor.personId });
  });
  return loadSessionContent(database, event.id, session.id);
}

export async function restoreSessionVersion(database: Database, actor: Actor, eventSlug: string, sessionId: string, versionNumber: number, expectedRevision: number) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const [[session], [snapshot]] = await Promise.all([
    database.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.eventId, event.id))).limit(1),
    database.select().from(sessionVersions).where(and(eq(sessionVersions.sessionId, sessionId), eq(sessionVersions.version, versionNumber))).limit(1),
  ]);
  if (!session || !snapshot) throw new FilesDeliverablesError("file_not_found", "Session or version not found.");
  if (session.revision !== expectedRevision) throw new FilesDeliverablesError("conflict", "This session changed after it was opened. Reload and try again.");
  await database.transaction(async (transaction) => {
    await transaction.update(sessions).set({ title: snapshot.title, abstract: snapshot.abstract, contentStatus: snapshot.contentStatus, revision: session.revision + 1, updatedAt: new Date() }).where(eq(sessions.id, session.id));
    await transaction.insert(sessionVersions).values({ sessionId, version: session.revision + 1, title: snapshot.title, abstract: snapshot.abstract, contentStatus: snapshot.contentStatus, createdByPersonId: actor.personId });
  });
  return loadSessionContent(database, event.id, session.id);
}

export async function updateSpeakerContent(database: Database, actor: Actor, eventSlug: string, eventSpeakerId: string, input: UpdateSpeakerContentInput) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const record = await loadSpeakerContentRecord(database, event.id, eventSpeakerId);
  if (record.version !== input.expectedVersion) throw new FilesDeliverablesError("conflict", "This speaker profile changed after it was opened. Reload and try again.");
  const snapshot = { ...record.snapshot, biography: input.biography, company: input.company, jobTitle: input.jobTitle };
  await database.transaction(async (transaction) => {
    let nextVersion = record.version + 1;
    if (record.version === 0) {
      await transaction.insert(speakerProfileVersions).values({ speakerProfileId: record.profileId, version: 1, snapshot: record.snapshot, createdByPersonId: actor.personId });
      nextVersion = 2;
    }
    await transaction.update(speakerProfiles).set({ biography: input.biography, company: input.company, jobTitle: input.jobTitle, updatedAt: new Date() }).where(eq(speakerProfiles.id, record.profileId));
    await transaction.insert(speakerProfileVersions).values({ speakerProfileId: record.profileId, version: nextVersion, snapshot, createdByPersonId: actor.personId });
  });
  return loadSpeakerContentRecord(database, event.id, eventSpeakerId);
}

export async function getSpeakerContent(database: Database, actor: Actor, eventSlug: string, eventSpeakerId: string) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  return loadSpeakerContentRecord(database, event.id, eventSpeakerId);
}

export async function restoreSpeakerVersion(database: Database, actor: Actor, eventSlug: string, eventSpeakerId: string, versionNumber: number, expectedVersion: number) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const current = await loadSpeakerContentRecord(database, event.id, eventSpeakerId);
  if (current.version !== expectedVersion) throw new FilesDeliverablesError("conflict", "This speaker profile changed after it was opened. Reload and try again.");
  const [version] = await database.select().from(speakerProfileVersions).where(and(eq(speakerProfileVersions.speakerProfileId, current.profileId), eq(speakerProfileVersions.version, versionNumber))).limit(1);
  if (!version) throw new FilesDeliverablesError("file_not_found", "Speaker profile version not found.");
  const snapshot = version.snapshot;
  await database.transaction(async (transaction) => {
    await transaction.update(speakerProfiles).set({
      biography: stringValue(snapshot.biography), company: stringValue(snapshot.company), jobTitle: stringValue(snapshot.jobTitle),
      socialLinks: recordValue(snapshot.socialLinks), headshotFileId: nullableString(snapshot.headshotFileId), updatedAt: new Date(),
    }).where(eq(speakerProfiles.id, current.profileId));
    await transaction.insert(speakerProfileVersions).values({ speakerProfileId: current.profileId, version: current.version + 1, snapshot, createdByPersonId: actor.personId });
  });
  return loadSpeakerContentRecord(database, event.id, eventSpeakerId);
}

export async function requestBundleExport(database: Database, actor: Actor, eventSlug: string, deliverableIdsValue: string[], grouping: "session" | "speaker" | "flat", storage: PrivateFileStore) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const deliverableIds = [...new Set(deliverableIdsValue)];
  const rows = await loadLatestFiles(database, event.id, deliverableIds);
  if (rows.length !== deliverableIds.length) throw new FilesDeliverablesError("file_not_found", "Every selected deliverable must have a verified latest version.");
  const generatedAt = new Date().toISOString();
  const manifest: BundleManifest = {
    format: "programflow.files.v1",
    grouping,
    generatedAt,
    entries: rows.map((row) => ({
      deliverableId: row.deliverableId,
      version: row.version,
      storageKey: row.storageKey,
      archivePath: archivePath(grouping, row.speakerName, row.sessionTitle, row.originalName),
      originalName: row.originalName,
      byteSize: row.byteSize,
      checksumSha256: row.checksumSha256,
    })),
  };
  const status = storage.configured ? "pending" : "blocked_external";
  const [record] = await database.insert(fileBundleExports).values({
    eventId: event.id,
    requestedByPersonId: actor.personId,
    status,
    selection: { deliverableIds, grouping },
    manifest,
    failureCode: storage.configured ? null : "storage_not_configured",
  }).returning();
  if (!record) throw new FilesDeliverablesError("conflict", "The export request could not be persisted.");
  return record;
}

export async function processBundleExport(database: Database, exportId: string, storage: PrivateFileStore) {
  const [record] = await database.select().from(fileBundleExports).where(eq(fileBundleExports.id, exportId)).limit(1);
  if (!record || record.status === "ready") return record ?? null;
  const manifest = record.manifest as BundleManifest | null;
  if (!manifest) throw new FilesDeliverablesError("invalid_file", "The export manifest is missing.");
  await database.update(fileBundleExports).set({ status: "building", failureCode: null }).where(eq(fileBundleExports.id, exportId));
  try {
    const entries = [];
    for (const item of manifest.entries) {
      const contents = await storage.read(item.storageKey);
      if (!contents) throw new Error(`Missing private object for deliverable ${item.deliverableId}.`);
      entries.push({ path: item.archivePath, contents });
    }
    entries.push({ path: "manifest.json", contents: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    const storageKey = `events/${record.eventId}/exports/${record.id}.zip`;
    await storage.putBundle(storageKey, createZip(entries));
    const [ready] = await database.update(fileBundleExports).set({ status: "ready", storageKey, completedAt: new Date(), failureCode: null })
      .where(eq(fileBundleExports.id, exportId)).returning();
    return ready ?? null;
  } catch (error) {
    const unavailable = error instanceof StorageUnavailableError;
    const [failed] = await database.update(fileBundleExports).set({ status: unavailable ? "blocked_external" : "failed", failureCode: unavailable ? error.code : "bundle_generation_failed" })
      .where(eq(fileBundleExports.id, exportId)).returning();
    return failed ?? null;
  }
}

export async function listBundleExports(database: Database, actor: Actor, eventSlug: string) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  return database.select().from(fileBundleExports).where(eq(fileBundleExports.eventId, event.id)).orderBy(desc(fileBundleExports.createdAt));
}

export async function downloadBundle(database: Database, actor: Actor, eventSlug: string, exportId: string, storage: PrivateFileStore) {
  const event = await requireEvent(database, actor, eventSlug, "organizer");
  const [record] = await database.select().from(fileBundleExports).where(and(eq(fileBundleExports.id, exportId), eq(fileBundleExports.eventId, event.id))).limit(1);
  if (!record || record.status !== "ready" || !record.storageKey) throw new FilesDeliverablesError("file_not_found", "The ZIP export is not ready.");
  const response = await storage.download(record.storageKey, `programflow-files-${record.id}.zip`, "application/zip");
  if (!response) throw new FilesDeliverablesError("file_not_found", "The ZIP object is missing from storage.");
  return response;
}

async function requireEvent(database: Database, actor: Actor, slug: string, role: "organizer" | "speaker") {
  const [event] = await database.select({ id: events.id, slug: events.slug, name: events.name }).from(events).where(eq(events.slug, slug)).limit(1);
  if (!event) throw new FilesDeliverablesError("event_not_found", "Event not found.");
  if (!actorCanAccessEvent(actor, event.id, role)) throw new FilesDeliverablesError("forbidden", `An event ${role} membership is required.`);
  return event;
}

async function requireEventAnyRole(database: Database, actor: Actor, slug: string) {
  const [event] = await database.select({ id: events.id, slug: events.slug, name: events.name }).from(events).where(eq(events.slug, slug)).limit(1);
  if (!event) throw new FilesDeliverablesError("event_not_found", "Event not found.");
  if (!actorCanAccessEvent(actor, event.id, "organizer") && !actorCanAccessEvent(actor, event.id, "speaker")) throw new FilesDeliverablesError("forbidden", "Organizer or speaker membership is required.");
  return event;
}

async function loadFileRequest(database: Database, eventId: string, taskId: string) {
  const rows = await loadDeliverables(database, eventId);
  const assignmentIds = await database.select({ id: speakerTaskAssignments.id }).from(speakerTaskAssignments).where(eq(speakerTaskAssignments.taskId, taskId));
  const allowed = new Set(assignmentIds.map((row) => row.id));
  return rows.filter((row) => row.taskAssignmentId !== null && allowed.has(row.taskAssignmentId));
}

async function loadDeliverable(database: Database, eventId: string, deliverableId: string, speakerPersonId?: string) {
  const rows = await loadDeliverables(database, eventId, speakerPersonId, [deliverableId]);
  const row = rows[0];
  if (!row) throw new FilesDeliverablesError("file_not_found", "Deliverable not found.");
  return row;
}

async function loadDeliverables(database: Database, eventId: string, speakerPersonId?: string, ids?: string[]): Promise<DeliverableRow[]> {
  const conditions = [eq(deliverables.eventId, eventId)];
  if (speakerPersonId) {
    conditions.push(eq(eventSpeakers.personId, speakerPersonId));
    conditions.push(releasedSpeakerDeliverable()!);
  }
  if (ids?.length) conditions.push(inArray(deliverables.id, ids));
  const rows = await database.select({
    id: deliverables.id,
    eventId: deliverables.eventId,
    taskAssignmentId: deliverables.taskAssignmentId,
    eventSpeakerId: eventSpeakers.id,
    personId: eventSpeakers.personId,
    speakerName: people.displayName,
    taskTitle: speakerTasks.title,
    instructions: speakerTasks.description,
    dueAt: deliverables.dueAt,
    sessionId: deliverables.sessionId,
    sessionTitle: sessions.title,
    status: deliverables.status,
    latestVersion: deliverables.latestVersion,
    configuration: speakerTasks.configuration,
  }).from(deliverables)
    .leftJoin(speakerTaskAssignments, eq(speakerTaskAssignments.id, deliverables.taskAssignmentId))
    .leftJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, deliverables.eventSpeakerId))
    .innerJoin(people, eq(people.id, eventSpeakers.personId))
    .leftJoin(sessions, eq(sessions.id, deliverables.sessionId))
    .leftJoin(decisions, eq(decisions.submissionId, sessions.sourceSubmissionId))
    .where(and(...conditions)).orderBy(asc(deliverables.dueAt), asc(people.displayName), asc(speakerTasks.title));
  const deliverableIds = rows.map((row) => row.id);
  const versionRows = deliverableIds.length ? await database.select({
    deliverableId: deliverableVersions.deliverableId,
    id: deliverableVersions.id,
    version: deliverableVersions.version,
    originalName: fileObjects.originalName,
    mediaType: fileObjects.mediaType,
    byteSize: fileObjects.byteSize,
    checksumSha256: fileObjects.checksumSha256,
    uploadedByPersonId: deliverableVersions.uploadedByPersonId,
    createdAt: deliverableVersions.createdAt,
  }).from(deliverableVersions).innerJoin(fileObjects, eq(fileObjects.id, deliverableVersions.fileObjectId))
    .where(and(inArray(deliverableVersions.deliverableId, deliverableIds), eq(fileObjects.verificationStatus, "verified")))
    .orderBy(desc(deliverableVersions.version)) : [];
  const versionIds = versionRows.map((row) => row.id);
  const commentRows = versionIds.length ? await database.select({
    id: fileComments.id,
    versionId: fileComments.deliverableVersionId,
    authorPersonId: fileComments.authorPersonId,
    authorName: people.displayName,
    body: fileComments.body,
    createdAt: fileComments.createdAt,
  }).from(fileComments).innerJoin(people, eq(people.id, fileComments.authorPersonId))
    .where(inArray(fileComments.deliverableVersionId, versionIds)).orderBy(asc(fileComments.createdAt)) : [];
  return rows.map((row) => {
    const directProfileFile = row.taskAssignmentId === null;
    const policy = directProfileFile ? profileHeadshotPolicy() : filePolicy(row.configuration);
    return {
      ...row,
      taskTitle: row.taskTitle ?? "Profile headshot",
      instructions: row.instructions ?? "Speaker-managed profile photo.",
      ...policy,
      versions: versionRows.filter((version) => version.deliverableId === row.id).map((version) => ({
        ...version,
        latest: version.version === row.latestVersion,
        comments: commentRows.filter((comment) => comment.versionId === version.id).map((comment) => ({
          id: comment.id,
          authorPersonId: comment.authorPersonId,
          authorName: comment.authorName,
          body: comment.body,
          createdAt: comment.createdAt,
        })),
      })),
    };
  });
}

async function requireUploadAuthorization(database: Database, actor: Actor, id: string) {
  const [row] = await database.select({
    id: fileUploadAuthorizations.id,
    eventId: fileUploadAuthorizations.eventId,
    deliverableId: fileUploadAuthorizations.deliverableId,
    fileObjectId: fileUploadAuthorizations.fileObjectId,
    requestedByPersonId: fileUploadAuthorizations.requestedByPersonId,
    status: fileUploadAuthorizations.status,
    expiresAt: fileUploadAuthorizations.expiresAt,
    storageKey: fileObjects.storageKey,
    byteSize: fileObjects.byteSize,
    mediaType: fileObjects.mediaType,
    checksumSha256: fileObjects.checksumSha256,
    taskAssignmentId: deliverables.taskAssignmentId,
    handoffConfiguration: speakerTasks.configuration,
    ownerPersonId: eventSpeakers.personId,
  }).from(fileUploadAuthorizations)
    .innerJoin(fileObjects, eq(fileObjects.id, fileUploadAuthorizations.fileObjectId))
    .innerJoin(deliverables, eq(deliverables.id, fileUploadAuthorizations.deliverableId))
    .leftJoin(speakerTaskAssignments, eq(speakerTaskAssignments.id, deliverables.taskAssignmentId))
    .leftJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, deliverables.eventSpeakerId))
    .where(eq(fileUploadAuthorizations.id, id)).limit(1);
  if (!row) throw new FilesDeliverablesError("file_not_found", "Upload authorization not found.");
  const organizer = actorCanAccessEvent(actor, row.eventId, "organizer");
  const ownSpeaker = actorCanAccessEvent(actor, row.eventId, "speaker") && row.ownerPersonId === actor.personId;
  if (!organizer && !ownSpeaker) throw new FilesDeliverablesError("file_not_found", "Upload authorization not found.");
  if (!organizer) await requireSpeakerVisibleDeliverable(database, row.eventId, row.deliverableId, actor.personId);
  return { ...row, handoff: row.taskAssignmentId === null ? "speaker_headshot" as const : filePolicy(row.handoffConfiguration).handoff };
}

async function requireVersionAccess(database: Database, actor: Actor, eventId: string, versionId: string) {
  const organizer = actorCanAccessEvent(actor, eventId, "organizer");
  const conditions = [
    eq(deliverableVersions.id, versionId),
    eq(deliverables.eventId, eventId),
    eq(fileObjects.verificationStatus, "verified"),
  ];
  if (!organizer) {
    conditions.push(eq(eventSpeakers.personId, actor.personId));
    conditions.push(releasedSpeakerDeliverable()!);
  }
  const [row] = await database.select({
    id: deliverableVersions.id,
    deliverableId: deliverableVersions.deliverableId,
    eventId: deliverables.eventId,
    ownerPersonId: eventSpeakers.personId,
    storageKey: fileObjects.storageKey,
    originalName: fileObjects.originalName,
    mediaType: fileObjects.mediaType,
  }).from(deliverableVersions)
    .innerJoin(deliverables, eq(deliverables.id, deliverableVersions.deliverableId))
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, deliverables.eventSpeakerId))
    .innerJoin(fileObjects, eq(fileObjects.id, deliverableVersions.fileObjectId))
    .leftJoin(speakerTaskAssignments, eq(speakerTaskAssignments.id, deliverables.taskAssignmentId))
    .leftJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .leftJoin(sessions, eq(sessions.id, deliverables.sessionId))
    .leftJoin(decisions, eq(decisions.submissionId, sessions.sourceSubmissionId))
    .where(and(...conditions)).limit(1);
  if (!row) throw new FilesDeliverablesError("file_not_found", "File version not found.");
  if (!canAccessPrivateSpeakerFile(actor, eventId, row.ownerPersonId)) {
    throw new FilesDeliverablesError("forbidden", "This private file belongs to another speaker.");
  }
  return row;
}

async function requireSpeakerVisibleDeliverable(database: Database, eventId: string, deliverableId: string, personId: string) {
  const [row] = await database.select({ id: deliverables.id }).from(deliverables)
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, deliverables.eventSpeakerId))
    .leftJoin(speakerTaskAssignments, eq(speakerTaskAssignments.id, deliverables.taskAssignmentId))
    .leftJoin(speakerTasks, eq(speakerTasks.id, speakerTaskAssignments.taskId))
    .leftJoin(sessions, eq(sessions.id, deliverables.sessionId))
    .leftJoin(decisions, eq(decisions.submissionId, sessions.sourceSubmissionId))
    .where(and(
      eq(deliverables.id, deliverableId),
      eq(deliverables.eventId, eventId),
      eq(eventSpeakers.personId, personId),
      releasedSpeakerDeliverable(),
    )).limit(1);
  if (!row) throw new FilesDeliverablesError("file_not_found", "Deliverable not found.");
}

async function loadSessionContent(database: Database, eventId: string, sessionId: string) {
  const [session] = await database.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.eventId, eventId))).limit(1);
  if (!session) throw new FilesDeliverablesError("file_not_found", "Session not found.");
  const history = await database.select({
    version: sessionVersions.version,
    title: sessionVersions.title,
    abstract: sessionVersions.abstract,
    contentStatus: sessionVersions.contentStatus,
    createdByPersonId: sessionVersions.createdByPersonId,
    createdByName: people.displayName,
    createdAt: sessionVersions.createdAt,
  }).from(sessionVersions).innerJoin(people, eq(people.id, sessionVersions.createdByPersonId))
    .where(eq(sessionVersions.sessionId, sessionId)).orderBy(desc(sessionVersions.version));
  return { ...session, history };
}

async function loadSpeakerContentRecord(database: Database, eventId: string, eventSpeakerId: string) {
  const [row] = await database.select({
    profileId: speakerProfiles.id,
    displayName: people.displayName,
    biography: speakerProfiles.biography,
    company: speakerProfiles.company,
    jobTitle: speakerProfiles.jobTitle,
    socialLinks: speakerProfiles.socialLinks,
    headshotFileId: speakerProfiles.headshotFileId,
  }).from(eventSpeakers).innerJoin(people, eq(people.id, eventSpeakers.personId)).innerJoin(speakerProfiles, eq(speakerProfiles.personId, people.id))
    .where(and(eq(eventSpeakers.id, eventSpeakerId), eq(eventSpeakers.eventId, eventId))).limit(1);
  if (!row) throw new FilesDeliverablesError("file_not_found", "Speaker profile not found.");
  const history = await database.select({
    version: speakerProfileVersions.version,
    snapshot: speakerProfileVersions.snapshot,
    createdByPersonId: speakerProfileVersions.createdByPersonId,
    createdByName: people.displayName,
    createdAt: speakerProfileVersions.createdAt,
  }).from(speakerProfileVersions).innerJoin(people, eq(people.id, speakerProfileVersions.createdByPersonId))
    .where(eq(speakerProfileVersions.speakerProfileId, row.profileId)).orderBy(desc(speakerProfileVersions.version));
  return { ...row, version: history[0]?.version ?? 0, snapshot: profileSnapshot(row), history };
}

async function loadLatestFiles(database: Database, eventId: string, selected: string[]) {
  if (!selected.length) return [];
  return database.select({
    deliverableId: deliverables.id,
    version: deliverableVersions.version,
    storageKey: fileObjects.storageKey,
    originalName: fileObjects.originalName,
    byteSize: fileObjects.byteSize,
    checksumSha256: fileObjects.checksumSha256,
    speakerName: people.displayName,
    sessionTitle: sessions.title,
  }).from(deliverables)
    .innerJoin(deliverableVersions, and(eq(deliverableVersions.deliverableId, deliverables.id), eq(deliverableVersions.version, deliverables.latestVersion)))
    .innerJoin(fileObjects, eq(fileObjects.id, deliverableVersions.fileObjectId))
    .innerJoin(eventSpeakers, eq(eventSpeakers.id, deliverables.eventSpeakerId))
    .innerJoin(people, eq(people.id, eventSpeakers.personId))
    .leftJoin(sessions, eq(sessions.id, deliverables.sessionId))
    .where(and(eq(deliverables.eventId, eventId), inArray(deliverables.id, selected), eq(fileObjects.verificationStatus, "verified")));
}

function uploadAuthorizationResponse(row: typeof fileUploadAuthorizations.$inferSelect, storageConfigured: boolean) {
  return {
    id: row.id,
    status: row.status,
    uploadUrl: row.status === "authorized" && storageConfigured ? `/api/v1/speaker/files/uploads/${row.id}/content` : null,
    finalizeUrl: row.status === "uploaded" ? `/api/v1/speaker/files/uploads/${row.id}/finalize` : null,
    expiresAt: row.expiresAt,
    failureCode: row.failureCode,
  };
}

function filePolicy(value: Record<string, unknown> | null): FileRequestConfiguration {
  value ??= {};
  const acceptedMediaTypes = Array.isArray(value.acceptedMediaTypes) ? value.acceptedMediaTypes.filter((item): item is string => typeof item === "string") : ["application/pdf"];
  return {
    acceptedMediaTypes,
    maxByteSize: typeof value.maxByteSize === "number" ? value.maxByteSize : 100 * 1024 * 1024,
    handoff: value.handoff === "speaker_headshot" ? "speaker_headshot" : "session_file",
  };
}

function profileHeadshotPolicy(): FileRequestConfiguration {
  return { acceptedMediaTypes: ["image/png", "image/jpeg", "image/webp"], maxByteSize: 10 * 1024 * 1024, handoff: "speaker_headshot" };
}

function profileSnapshot(value: { biography: string; company: string; jobTitle: string; socialLinks: Record<string, string>; headshotFileId: string | null }) {
  return { biography: value.biography, company: value.company, jobTitle: value.jobTitle, socialLinks: value.socialLinks, headshotFileId: value.headshotFileId };
}
function archivePath(grouping: "session" | "speaker" | "flat", speakerName: string, sessionTitle: string | null, originalName: string) {
  if (grouping === "speaker") return safePath(`${speakerName}/${originalName}`);
  if (grouping === "session") return safePath(`${sessionTitle ?? "Unassigned session"}/${speakerName}/${originalName}`);
  return safePath(`${speakerName}-${originalName}`);
}
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableString(value: unknown) { return typeof value === "string" ? value : null; }
function recordValue(value: unknown): Record<string, string> { return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {}; }
function formatBytes(value: number) { return `${Math.round(value / 1024 / 1024)} MB`; }
