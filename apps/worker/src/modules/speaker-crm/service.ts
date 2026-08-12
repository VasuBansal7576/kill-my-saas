import type { CrmEventSpeakerHandoff, PushCrmContactToEventCommand } from "@programflow/contracts";
import {
  eventMemberships,
  eventSpeakers,
  events,
  people,
  personEmailAliases,
  sessions,
  sessionSpeakers,
  speakerProfiles,
  type Database,
} from "@programflow/database";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  crmContactMerges,
  crmContactNotes,
  crmContacts,
  crmEventSpeakerHandoffs,
  crmOutreachRequests,
  crmPipelineEnrollments,
  crmPipelineStages,
  crmPipelineStageTransitions,
  crmPipelines,
  crmSavedSegments,
} from "@programflow/database";
import type { Actor } from "../identity-access/actor";
import type {
  CreateCrmContact,
  CreateCrmOutreachHandoff,
  CrmDirectoryFilter,
  MergeCrmContacts,
  SaveCrmSegment,
  UpdateCrmContact,
} from "./contracts";
import { PushCrmContactToEventCommandSchema } from "./contracts";
import { parseCrmCsv } from "./csv";

type CrmErrorCode = "conflict" | "contact_not_found" | "event_not_found" | "forbidden" | "invalid_contact" | "pipeline_not_found" | "segment_not_found";
export class SpeakerCrmError extends Error {
  constructor(readonly code: CrmErrorCode, message: string) { super(message); }
}

export interface CrmDirectoryContact {
  contactId: string;
  personId: string;
  displayName: string;
  email: string | null;
  biography: string;
  company: string;
  jobTitle: string;
  headshotFileId: string | null;
  tags: string[];
  customMetadata: Record<string, string>;
  internalNotes: string;
  revision: number;
  eventCount: number;
  pipeline: null | { enrollmentId: string; pipelineId: string; stageId: string; stageName: string; outcome: "open" | "won" | "lost" };
  updatedAt: Date;
}

export interface CrmContactDetail extends CrmDirectoryContact {
  aliases: string[];
  notes: Array<{ id: string; body: string; authorPersonId: string; authorName: string; createdAt: Date }>;
  eventHistory: Array<{
    eventId: string;
    eventSlug: string;
    eventName: string;
    eventSpeakerId: string;
    status: "invited" | "onboarding" | "ready" | "withdrawn";
    sessions: Array<{ id: string; title: string; role: string }>;
  }>;
  stageHistory: Array<{ id: string; fromStage: string | null; toStage: string; note: string; movedBy: string; createdAt: Date }>;
  mergedSources: Array<{ contactId: string; personId: string; mergedAt: Date }>;
}

export interface CrmPipelineBoard {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
    outcome: "open" | "won" | "lost";
    contacts: CrmDirectoryContact[];
  }>;
}

export interface CrmOutreachHandoffRequest {
  requestId: string;
  organizationId: string;
  eventId: string;
  recipientPersonIds: string[];
  recipientSnapshot: Array<{ contactId: string; personId: string; displayName: string; email: string }>;
  message: { name: string; subjectTemplate: string; htmlTemplate: string; textTemplate: string };
  idempotencyKey: string;
  idempotent: boolean;
}

export async function listCrmDirectory(database: Database, actor: Actor, organizationId: string, filters: CrmDirectoryFilter): Promise<CrmDirectoryContact[]> {
  requireOrganizationOrganizer(actor, organizationId);
  const rows = await loadActiveDirectory(database, organizationId);
  return filterDirectory(rows, normalizeLegacyFilters(filters));
}

export async function createCrmContact(database: Database, actor: Actor, organizationId: string, input: CreateCrmContact): Promise<CrmContactDetail> {
  requireOrganizationOrganizer(actor, organizationId);
  const contactId = await database.transaction(async (transaction) => {
    const result = await persistContact(transaction as unknown as Database, organizationId, input, "manual");
    return result.contactId;
  });
  return getCrmContact(database, actor, organizationId, contactId);
}

export async function updateCrmContact(database: Database, actor: Actor, organizationId: string, contactId: string, input: UpdateCrmContact): Promise<CrmContactDetail> {
  requireOrganizationOrganizer(actor, organizationId);
  await database.transaction(async (transaction) => {
    const [contact] = await transaction.select().from(crmContacts)
      .where(and(eq(crmContacts.id, contactId), eq(crmContacts.organizationId, organizationId), isNull(crmContacts.mergedIntoContactId))).limit(1);
    if (!contact) throw new SpeakerCrmError("contact_not_found", "CRM contact not found.");
    if (input.expectedRevision !== undefined && input.expectedRevision !== contact.revision) throw new SpeakerCrmError("conflict", "The contact changed after it was opened. Reload before saving.");
    if (input.displayName !== undefined) await transaction.update(people).set({ displayName: input.displayName, updatedAt: new Date() }).where(eq(people.id, contact.personId));
    const profileUpdate = {
      ...(input.biography !== undefined ? { biography: input.biography } : {}),
      ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      updatedAt: new Date(),
    };
    await transaction.insert(speakerProfiles).values({
      personId: contact.personId,
      biography: input.biography ?? "",
      company: input.company ?? "",
      jobTitle: input.jobTitle ?? "",
    }).onConflictDoUpdate({ target: speakerProfiles.personId, set: profileUpdate });
    await transaction.update(crmContacts).set({
      ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      ...(input.tags !== undefined ? { tags: uniqueStrings(input.tags) } : {}),
      ...(input.customMetadata !== undefined ? { customMetadata: input.customMetadata } : {}),
      revision: sql`${crmContacts.revision} + 1`,
      updatedAt: new Date(),
    }).where(eq(crmContacts.id, contactId));
  });
  return getCrmContact(database, actor, organizationId, contactId);
}

export async function addCrmContactNote(database: Database, actor: Actor, organizationId: string, contactId: string, body: string): Promise<CrmContactDetail> {
  requireOrganizationOrganizer(actor, organizationId);
  const [contact] = await database.select({ id: crmContacts.id }).from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.organizationId, organizationId), isNull(crmContacts.mergedIntoContactId))).limit(1);
  if (!contact) throw new SpeakerCrmError("contact_not_found", "CRM contact not found.");
  await database.insert(crmContactNotes).values({ contactId, authorPersonId: actor.personId, body });
  return getCrmContact(database, actor, organizationId, contactId);
}

export async function importCrmContacts(database: Database, actor: Actor, organizationId: string, csv: string) {
  requireOrganizationOrganizer(actor, organizationId);
  const rows = parseCrmCsv(csv);
  const results = await database.transaction(async (transaction) => {
    const scoped = transaction as unknown as Database;
    const imported: Array<{ row: number; contactId: string; created: boolean }> = [];
    for (const row of rows) imported.push({ row: row.row, ...(await persistContact(scoped, organizationId, row.input, "csv")) });
    return imported;
  });
  return {
    imported: results.filter((result) => result.created).length,
    reused: results.filter((result) => !result.created).length,
    rows: results.map(({ row, contactId }) => ({ row, contactId })),
  };
}

export async function listDuplicateCandidates(database: Database, actor: Actor, organizationId: string) {
  requireOrganizationOrganizer(actor, organizationId);
  const contacts = await loadActiveDirectory(database, organizationId);
  const groups = new Map<string, CrmDirectoryContact[]>();
  for (const contact of contacts) {
    const key = normalizeName(contact.displayName);
    groups.set(key, [...(groups.get(key) ?? []), contact]);
  }
  return [...groups.values()].flatMap((group) => {
    const emails = new Set(group.map((contact) => contact.email?.toLowerCase()).filter(Boolean));
    if (group.length < 2 || emails.size < 2) return [];
    return [{ key: normalizeName(group[0]?.displayName ?? ""), reason: "Same normalized name with different email addresses", contacts: group }];
  });
}

export async function mergeCrmContacts(database: Database, actor: Actor, organizationId: string, input: MergeCrmContacts): Promise<CrmContactDetail> {
  requireOrganizationOrganizer(actor, organizationId);
  await database.transaction(async (transaction) => {
    const contacts = await transaction.select().from(crmContacts).where(and(
      eq(crmContacts.organizationId, organizationId),
      inArray(crmContacts.id, [input.primaryContactId, input.duplicateContactId]),
      isNull(crmContacts.mergedIntoContactId),
    ));
    const primary = contacts.find((contact) => contact.id === input.primaryContactId);
    const duplicate = contacts.find((contact) => contact.id === input.duplicateContactId);
    if (!primary || !duplicate) throw new SpeakerCrmError("contact_not_found", "Both active contacts must belong to this organization.");
    await transaction.update(crmContacts).set({
      tags: uniqueStrings([...primary.tags, ...duplicate.tags]),
      customMetadata: { ...duplicate.customMetadata, ...primary.customMetadata },
      internalNotes: [primary.internalNotes, duplicate.internalNotes].filter(Boolean).join("\n\n--- Merged notes ---\n"),
      revision: sql`${crmContacts.revision} + 1`,
      updatedAt: new Date(),
    }).where(eq(crmContacts.id, primary.id));
    await transaction.update(crmContacts).set({ mergedIntoContactId: primary.id, revision: sql`${crmContacts.revision} + 1`, updatedAt: new Date() })
      .where(eq(crmContacts.id, duplicate.id));
    await transaction.update(crmContactNotes).set({ contactId: primary.id }).where(eq(crmContactNotes.contactId, duplicate.id));
    await transaction.update(personEmailAliases).set({ personId: primary.personId, updatedAt: new Date() }).where(eq(personEmailAliases.personId, duplicate.personId));
    const [primaryProfile] = await transaction.select().from(speakerProfiles).where(eq(speakerProfiles.personId, primary.personId)).limit(1);
    const [duplicateProfile] = await transaction.select().from(speakerProfiles).where(eq(speakerProfiles.personId, duplicate.personId)).limit(1);
    if (duplicateProfile) await transaction.insert(speakerProfiles).values({
      personId: primary.personId,
      biography: primaryProfile?.biography || duplicateProfile.biography,
      company: primaryProfile?.company || duplicateProfile.company,
      jobTitle: primaryProfile?.jobTitle || duplicateProfile.jobTitle,
      headshotFileId: primaryProfile?.headshotFileId ?? duplicateProfile.headshotFileId,
      socialLinks: { ...duplicateProfile.socialLinks, ...(primaryProfile?.socialLinks ?? {}) },
    }).onConflictDoUpdate({ target: speakerProfiles.personId, set: {
      biography: primaryProfile?.biography || duplicateProfile.biography,
      company: primaryProfile?.company || duplicateProfile.company,
      jobTitle: primaryProfile?.jobTitle || duplicateProfile.jobTitle,
      headshotFileId: primaryProfile?.headshotFileId ?? duplicateProfile.headshotFileId,
      socialLinks: { ...duplicateProfile.socialLinks, ...(primaryProfile?.socialLinks ?? {}) },
      updatedAt: new Date(),
    } });
    await transaction.insert(crmContactMerges).values({
      organizationId,
      primaryContactId: primary.id,
      mergedContactId: duplicate.id,
      primaryPersonId: primary.personId,
      mergedPersonId: duplicate.personId,
      mergedByPersonId: actor.personId,
      provenance: { reason: input.reason, retainedRelationshipsOnPersonId: duplicate.personId },
    });
  });
  return getCrmContact(database, actor, organizationId, input.primaryContactId);
}

export async function getCrmContact(database: Database, actor: Actor, organizationId: string, contactId: string): Promise<CrmContactDetail> {
  requireOrganizationOrganizer(actor, organizationId);
  const directory = await loadActiveDirectory(database, organizationId);
  const contact = directory.find((candidate) => candidate.contactId === contactId);
  if (!contact) throw new SpeakerCrmError("contact_not_found", "CRM contact not found.");
  const merges = await database.select().from(crmContactMerges).where(eq(crmContactMerges.primaryContactId, contactId)).orderBy(asc(crmContactMerges.createdAt));
  const personIds = [contact.personId, ...merges.map((merge) => merge.mergedPersonId)];
  const contactIds = [contactId, ...merges.map((merge) => merge.mergedContactId)];
  const [aliases, noteRows, historyRows, speakerSessions, enrollments] = await Promise.all([
    database.select({ email: personEmailAliases.email }).from(personEmailAliases).where(inArray(personEmailAliases.personId, personIds)).orderBy(asc(personEmailAliases.email)),
    database.select({ id: crmContactNotes.id, body: crmContactNotes.body, authorPersonId: crmContactNotes.authorPersonId, authorName: people.displayName, createdAt: crmContactNotes.createdAt })
      .from(crmContactNotes).innerJoin(people, eq(people.id, crmContactNotes.authorPersonId)).where(inArray(crmContactNotes.contactId, contactIds)).orderBy(desc(crmContactNotes.createdAt)),
    database.select({ eventSpeakerId: eventSpeakers.id, eventId: events.id, eventSlug: events.slug, eventName: events.name, status: eventSpeakers.status })
      .from(eventSpeakers).innerJoin(events, eq(events.id, eventSpeakers.eventId)).where(and(eq(events.organizationId, organizationId), inArray(eventSpeakers.personId, personIds))).orderBy(desc(events.startsOn)),
    database.select({ eventSpeakerId: sessionSpeakers.eventSpeakerId, id: sessions.id, title: sessions.title, role: sessionSpeakers.role })
      .from(sessionSpeakers).innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
      .innerJoin(eventSpeakers, eq(eventSpeakers.id, sessionSpeakers.eventSpeakerId)).innerJoin(events, eq(events.id, eventSpeakers.eventId))
      .where(and(eq(events.organizationId, organizationId), inArray(eventSpeakers.personId, personIds))),
    database.select({ enrollmentId: crmPipelineEnrollments.id }).from(crmPipelineEnrollments).where(inArray(crmPipelineEnrollments.contactId, contactIds)),
  ]);
  const stageHistory = enrollments.length ? await database.select({
    id: crmPipelineStageTransitions.id,
    fromStageId: crmPipelineStageTransitions.fromStageId,
    toStageId: crmPipelineStageTransitions.toStageId,
    note: crmPipelineStageTransitions.note,
    movedBy: people.displayName,
    createdAt: crmPipelineStageTransitions.createdAt,
  }).from(crmPipelineStageTransitions).innerJoin(people, eq(people.id, crmPipelineStageTransitions.movedByPersonId))
    .where(inArray(crmPipelineStageTransitions.enrollmentId, enrollments.map((row) => row.enrollmentId))).orderBy(desc(crmPipelineStageTransitions.createdAt)) : [];
  const stageIds = uniqueStrings(stageHistory.flatMap((row) => [row.fromStageId, row.toStageId].filter((value): value is string => value !== null)));
  const stageRows = stageIds.length ? await database.select({ id: crmPipelineStages.id, name: crmPipelineStages.name }).from(crmPipelineStages).where(inArray(crmPipelineStages.id, stageIds)) : [];
  const stageNames = new Map(stageRows.map((stage) => [stage.id, stage.name]));
  return {
    ...contact,
    aliases: uniqueStrings([contact.email ?? "", ...aliases.map((alias) => alias.email)].filter(Boolean)),
    notes: noteRows,
    eventHistory: historyRows.map((history) => ({ ...history, sessions: speakerSessions.filter((session) => session.eventSpeakerId === history.eventSpeakerId).map(({ id, title, role }) => ({ id, title, role })) })),
    stageHistory: stageHistory.map((transition) => ({ ...transition, fromStage: transition.fromStageId ? stageNames.get(transition.fromStageId) ?? "Unknown stage" : null, toStage: stageNames.get(transition.toStageId) ?? "Unknown stage" })),
    mergedSources: merges.map((merge) => ({ contactId: merge.mergedContactId, personId: merge.mergedPersonId, mergedAt: merge.createdAt })),
  };
}

export async function listCrmSegments(database: Database, actor: Actor, organizationId: string) {
  requireOrganizationOrganizer(actor, organizationId);
  const [segments, directory] = await Promise.all([
    database.select().from(crmSavedSegments).where(eq(crmSavedSegments.organizationId, organizationId)).orderBy(asc(crmSavedSegments.name)),
    loadActiveDirectory(database, organizationId),
  ]);
  return segments.map((segment) => ({ ...segment, memberCount: filterDirectory(directory, segment.filterDefinition).length }));
}

export async function saveCrmSegment(database: Database, actor: Actor, organizationId: string, input: SaveCrmSegment) {
  requireOrganizationOrganizer(actor, organizationId);
  const filters = compactFilters(normalizeLegacyFilters(input.filters));
  const [segment] = await database.insert(crmSavedSegments).values({ organizationId, name: input.name, filterDefinition: filters, createdByPersonId: actor.personId })
    .onConflictDoUpdate({ target: [crmSavedSegments.organizationId, crmSavedSegments.name], set: { filterDefinition: filters, updatedAt: new Date() } }).returning();
  return segment;
}

export async function openCrmSegment(database: Database, actor: Actor, organizationId: string, segmentId: string) {
  requireOrganizationOrganizer(actor, organizationId);
  const [segment] = await database.select().from(crmSavedSegments).where(and(eq(crmSavedSegments.id, segmentId), eq(crmSavedSegments.organizationId, organizationId))).limit(1);
  if (!segment) throw new SpeakerCrmError("segment_not_found", "Saved segment not found.");
  const members = filterDirectory(await loadActiveDirectory(database, organizationId), segment.filterDefinition);
  return { segment, members };
}

export async function getCrmPipeline(database: Database, actor: Actor, organizationId: string): Promise<CrmPipelineBoard> {
  requireOrganizationOrganizer(actor, organizationId);
  const pipelineId = await ensureDefaultPipeline(database, organizationId);
  const [pipeline, stages, directory] = await Promise.all([
    database.select().from(crmPipelines).where(eq(crmPipelines.id, pipelineId)).limit(1),
    database.select().from(crmPipelineStages).where(eq(crmPipelineStages.pipelineId, pipelineId)).orderBy(asc(crmPipelineStages.position)),
    loadActiveDirectory(database, organizationId),
  ]);
  const value = pipeline[0];
  if (!value) throw new SpeakerCrmError("pipeline_not_found", "CRM pipeline not found.");
  return { id: value.id, name: value.name, stages: stages.map((stage) => ({ ...stage, contacts: directory.filter((contact) => contact.pipeline?.stageId === stage.id) })) };
}

export async function enrollCrmContact(database: Database, actor: Actor, organizationId: string, contactId: string) {
  requireOrganizationOrganizer(actor, organizationId);
  const pipelineId = await ensureDefaultPipeline(database, organizationId);
  await requireActiveContact(database, organizationId, contactId);
  const [firstStage] = await database.select().from(crmPipelineStages).where(eq(crmPipelineStages.pipelineId, pipelineId)).orderBy(asc(crmPipelineStages.position)).limit(1);
  if (!firstStage) throw new SpeakerCrmError("pipeline_not_found", "CRM pipeline has no stages.");
  await database.transaction(async (transaction) => {
    const [existing] = await transaction.select().from(crmPipelineEnrollments).where(and(eq(crmPipelineEnrollments.pipelineId, pipelineId), eq(crmPipelineEnrollments.contactId, contactId))).limit(1);
    if (existing) return;
    const [enrollment] = await transaction.insert(crmPipelineEnrollments).values({ pipelineId, contactId, stageId: firstStage.id, enrolledByPersonId: actor.personId }).returning();
    if (!enrollment) throw new SpeakerCrmError("conflict", "Contact could not be enrolled.");
    await transaction.insert(crmPipelineStageTransitions).values({ enrollmentId: enrollment.id, toStageId: firstStage.id, movedByPersonId: actor.personId, note: "Enrolled in sourcing pipeline" });
  });
  return getCrmContact(database, actor, organizationId, contactId);
}

export async function moveCrmPipelineContact(database: Database, actor: Actor, organizationId: string, contactId: string, stageId: string, note: string) {
  requireOrganizationOrganizer(actor, organizationId);
  const pipelineId = await ensureDefaultPipeline(database, organizationId);
  await database.transaction(async (transaction) => {
    const [stage] = await transaction.select().from(crmPipelineStages).where(and(eq(crmPipelineStages.id, stageId), eq(crmPipelineStages.pipelineId, pipelineId))).limit(1);
    const [enrollment] = await transaction.select().from(crmPipelineEnrollments).innerJoin(crmContacts, eq(crmContacts.id, crmPipelineEnrollments.contactId))
      .where(and(eq(crmPipelineEnrollments.pipelineId, pipelineId), eq(crmPipelineEnrollments.contactId, contactId), eq(crmContacts.organizationId, organizationId), isNull(crmContacts.mergedIntoContactId))).limit(1);
    if (!stage || !enrollment) throw new SpeakerCrmError("pipeline_not_found", "Pipeline contact or stage not found.");
    const current = enrollment.crm_pipeline_enrollments;
    if (current.stageId === stageId) return;
    await transaction.update(crmPipelineEnrollments).set({ stageId, updatedAt: new Date() }).where(eq(crmPipelineEnrollments.id, current.id));
    await transaction.insert(crmPipelineStageTransitions).values({ enrollmentId: current.id, fromStageId: current.stageId, toStageId: stageId, movedByPersonId: actor.personId, note });
  });
  return getCrmContact(database, actor, organizationId, contactId);
}

export async function pushCrmContactToEvent(database: Database, actor: Actor, raw: PushCrmContactToEventCommand): Promise<CrmEventSpeakerHandoff> {
  const parsed = PushCrmContactToEventCommandSchema.safeParse(raw);
  if (!parsed.success) throw new SpeakerCrmError("invalid_contact", parsed.error.issues[0]?.message ?? "Invalid CRM event handoff.");
  const command = parsed.data;
  requireOrganizationOrganizer(actor, command.organizationId);
  return database.transaction(async (transaction) => {
    const [prior] = await transaction.select().from(crmEventSpeakerHandoffs).where(eq(crmEventSpeakerHandoffs.idempotencyKey, command.idempotencyKey)).limit(1);
    if (prior) {
      if (prior.organizationId !== command.organizationId || prior.contactId !== command.contactId || prior.eventId !== command.eventId) throw new SpeakerCrmError("conflict", "That event handoff key was already used for a different request.");
      return { contactId: prior.contactId, eventId: prior.eventId, eventSpeakerId: prior.eventSpeakerId, personId: prior.personId, idempotent: true };
    }
    const [contact] = await transaction.select().from(crmContacts).where(and(eq(crmContacts.id, command.contactId), eq(crmContacts.organizationId, command.organizationId), isNull(crmContacts.mergedIntoContactId))).limit(1);
    if (!contact) throw new SpeakerCrmError("contact_not_found", "CRM contact not found.");
    const [event] = await transaction.select({ id: events.id }).from(events).where(and(eq(events.id, command.eventId), eq(events.organizationId, command.organizationId))).limit(1);
    if (!event) throw new SpeakerCrmError("event_not_found", "Target event not found in this organization.");
    await transaction.insert(speakerProfiles).values({ personId: contact.personId }).onConflictDoNothing();
    await transaction.insert(eventMemberships).values({ eventId: event.id, personId: contact.personId, role: "speaker" }).onConflictDoNothing();
    const [existing] = await transaction.select({ id: eventSpeakers.id }).from(eventSpeakers).where(and(eq(eventSpeakers.eventId, event.id), eq(eventSpeakers.personId, contact.personId))).limit(1);
    const [created] = existing ? [] : await transaction.insert(eventSpeakers).values({ eventId: event.id, personId: contact.personId }).onConflictDoNothing().returning({ id: eventSpeakers.id });
    const eventSpeakerId = existing?.id ?? created?.id ?? (await transaction.select({ id: eventSpeakers.id }).from(eventSpeakers).where(and(eq(eventSpeakers.eventId, event.id), eq(eventSpeakers.personId, contact.personId))).limit(1))[0]?.id;
    if (!eventSpeakerId) throw new SpeakerCrmError("conflict", "The event speaker handoff could not be completed.");
    await transaction.insert(crmEventSpeakerHandoffs).values({
      organizationId: command.organizationId,
      contactId: command.contactId,
      eventId: command.eventId,
      personId: contact.personId,
      eventSpeakerId,
      idempotencyKey: command.idempotencyKey,
      reusedExistingSpeaker: Boolean(existing),
      requestedByPersonId: actor.personId,
    });
    return { contactId: command.contactId, eventId: command.eventId, eventSpeakerId, personId: contact.personId, idempotent: false };
  });
}

export async function createCrmOutreachHandoff(database: Database, actor: Actor, organizationId: string, input: CreateCrmOutreachHandoff): Promise<CrmOutreachHandoffRequest> {
  requireOrganizationOrganizer(actor, organizationId);
  return database.transaction(async (transaction) => {
    const [prior] = await transaction.select().from(crmOutreachRequests).where(eq(crmOutreachRequests.idempotencyKey, input.idempotencyKey)).limit(1);
    if (prior) {
      if (prior.organizationId !== organizationId || prior.eventId !== input.eventId || prior.subjectTemplate !== input.subjectTemplate || !sameIds(prior.selectedContactIds, input.contactIds)) throw new SpeakerCrmError("conflict", "That outreach key was already used for a different event, message, or audience.");
      return outreachResult(prior, true);
    }
    const [targetEvent] = await transaction.select({ id: events.id }).from(events)
      .where(and(eq(events.id, input.eventId), eq(events.organizationId, organizationId))).limit(1);
    if (!targetEvent) throw new SpeakerCrmError("event_not_found", "Choose an event owned by this organization for the outreach handoff.");
    const recipients = await transaction.select({ contactId: crmContacts.id, personId: people.id, displayName: people.displayName, email: people.canonicalEmail })
      .from(crmContacts).innerJoin(people, eq(people.id, crmContacts.personId)).where(and(eq(crmContacts.organizationId, organizationId), inArray(crmContacts.id, input.contactIds), isNull(crmContacts.mergedIntoContactId)));
    if (recipients.length !== input.contactIds.length) throw new SpeakerCrmError("contact_not_found", "Every outreach recipient must be an active contact in this organization.");
    if (recipients.some((recipient) => !recipient.email)) throw new SpeakerCrmError("invalid_contact", "Every outreach recipient needs a canonical email address.");
    const snapshot = recipients.map((recipient) => ({ ...recipient, email: recipient.email! }));
    const [request] = await transaction.insert(crmOutreachRequests).values({
      organizationId,
      eventId: targetEvent.id,
      name: input.name,
      subjectTemplate: input.subjectTemplate,
      htmlTemplate: input.htmlTemplate,
      textTemplate: input.textTemplate,
      selectedContactIds: input.contactIds,
      recipientSnapshot: snapshot,
      idempotencyKey: input.idempotencyKey,
      requestedByPersonId: actor.personId,
    }).returning();
    if (!request) throw new SpeakerCrmError("conflict", "The outreach handoff could not be persisted.");
    return outreachResult(request, false);
  });
}

export async function getCrmMetrics(database: Database, actor: Actor, organizationId: string) {
  requireOrganizationOrganizer(actor, organizationId);
  const [directory, pipeline, eventRows, outreachRows] = await Promise.all([
    loadActiveDirectory(database, organizationId),
    getCrmPipeline(database, actor, organizationId),
    database.select({ personId: eventSpeakers.personId, eventId: events.id }).from(eventSpeakers).innerJoin(events, eq(events.id, eventSpeakers.eventId)).where(eq(events.organizationId, organizationId)),
    database.select({ status: crmOutreachRequests.status }).from(crmOutreachRequests).where(eq(crmOutreachRequests.organizationId, organizationId)),
  ]);
  const companyCounts = countValues(directory.map((contact) => contact.company || "Unspecified"));
  const tagCounts = countValues(directory.flatMap((contact) => contact.tags));
  return {
    totalContacts: directory.length,
    contactsWithEventHistory: new Set(eventRows.map((row) => row.personId)).size,
    representedEvents: new Set(eventRows.map((row) => row.eventId)).size,
    pipelineOpen: pipeline.stages.filter((stage) => stage.outcome === "open").reduce((sum, stage) => sum + stage.contacts.length, 0),
    pipelineWon: pipeline.stages.filter((stage) => stage.outcome === "won").reduce((sum, stage) => sum + stage.contacts.length, 0),
    pendingOutreachHandoffs: outreachRows.filter((row) => row.status === "pending_handoff").length,
    contactsByCompany: topCounts(companyCounts, 8),
    popularTags: topCounts(tagCounts, 8),
  };
}

export async function listOrganizationEvents(database: Database, actor: Actor, organizationId: string) {
  requireOrganizationOrganizer(actor, organizationId);
  return database.select({ id: events.id, slug: events.slug, name: events.name, startsOn: events.startsOn }).from(events).where(eq(events.organizationId, organizationId)).orderBy(desc(events.startsOn));
}

async function loadActiveDirectory(database: Database, organizationId: string): Promise<CrmDirectoryContact[]> {
  const rows = await database.select({
    contactId: crmContacts.id, personId: people.id, displayName: people.displayName, email: people.canonicalEmail,
    biography: speakerProfiles.biography, company: speakerProfiles.company, jobTitle: speakerProfiles.jobTitle, headshotFileId: speakerProfiles.headshotFileId,
    tags: crmContacts.tags, customMetadata: crmContacts.customMetadata, internalNotes: crmContacts.internalNotes, revision: crmContacts.revision, updatedAt: crmContacts.updatedAt,
    enrollmentId: crmPipelineEnrollments.id, pipelineId: crmPipelineEnrollments.pipelineId, stageId: crmPipelineStages.id, stageName: crmPipelineStages.name, stageOutcome: crmPipelineStages.outcome,
  }).from(crmContacts).innerJoin(people, eq(people.id, crmContacts.personId)).leftJoin(speakerProfiles, eq(speakerProfiles.personId, people.id))
    .leftJoin(crmPipelineEnrollments, eq(crmPipelineEnrollments.contactId, crmContacts.id)).leftJoin(crmPipelineStages, eq(crmPipelineStages.id, crmPipelineEnrollments.stageId))
    .where(and(eq(crmContacts.organizationId, organizationId), isNull(crmContacts.mergedIntoContactId))).orderBy(asc(people.displayName));
  const eventCounts = rows.length ? await database.select({ personId: eventSpeakers.personId, count: sql<number>`count(distinct ${eventSpeakers.eventId})::int` })
    .from(eventSpeakers).innerJoin(events, eq(events.id, eventSpeakers.eventId)).where(and(eq(events.organizationId, organizationId), inArray(eventSpeakers.personId, rows.map((row) => row.personId)))).groupBy(eventSpeakers.personId) : [];
  const counts = new Map(eventCounts.map((row) => [row.personId, row.count]));
  return rows.map((row) => ({
    contactId: row.contactId, personId: row.personId, displayName: row.displayName, email: row.email,
    biography: row.biography ?? "", company: row.company ?? "", jobTitle: row.jobTitle ?? "", headshotFileId: row.headshotFileId ?? null,
    tags: row.tags, customMetadata: row.customMetadata, internalNotes: row.internalNotes, revision: row.revision, eventCount: counts.get(row.personId) ?? 0, updatedAt: row.updatedAt,
    pipeline: row.enrollmentId && row.pipelineId && row.stageId && row.stageName && row.stageOutcome ? { enrollmentId: row.enrollmentId, pipelineId: row.pipelineId, stageId: row.stageId, stageName: row.stageName, outcome: row.stageOutcome } : null,
  }));
}

async function persistContact(database: Database, organizationId: string, input: CreateCrmContact, source: "manual" | "csv") {
  const normalizedEmail = input.email.trim().toLowerCase();
  const [alias] = await database.select({ personId: personEmailAliases.personId }).from(personEmailAliases).where(eq(personEmailAliases.normalizedEmail, normalizedEmail)).limit(1);
  const [canonical] = alias ? [] : await database.select({ id: people.id }).from(people).where(sql`lower(${people.canonicalEmail}) = ${normalizedEmail}`).limit(1);
  let personId = alias?.personId ?? canonical?.id;
  if (!personId) {
    const [created] = await database.insert(people).values({ stableKey: `crm:${normalizedEmail}`, displayName: input.displayName, canonicalEmail: normalizedEmail }).returning({ id: people.id });
    if (!created) throw new SpeakerCrmError("conflict", "The canonical person could not be created.");
    personId = created.id;
  }
  await database.insert(personEmailAliases).values({ personId, email: input.email, normalizedEmail, isCanonical: true }).onConflictDoNothing();
  await database.insert(speakerProfiles).values({ personId, biography: input.biography, company: input.company, jobTitle: input.jobTitle }).onConflictDoUpdate({ target: speakerProfiles.personId, set: {
    biography: sql<string>`coalesce(nullif(${speakerProfiles.biography}, ''), ${input.biography})`,
    company: sql<string>`coalesce(nullif(${speakerProfiles.company}, ''), ${input.company})`,
    jobTitle: sql<string>`coalesce(nullif(${speakerProfiles.jobTitle}, ''), ${input.jobTitle})`,
    updatedAt: new Date(),
  } });
  const [existing] = await database.select().from(crmContacts).where(and(eq(crmContacts.organizationId, organizationId), eq(crmContacts.personId, personId))).limit(1);
  if (existing) {
    if (existing.mergedIntoContactId) throw new SpeakerCrmError("conflict", "This email belongs to a contact already merged into another record.");
    await database.update(crmContacts).set({
      tags: uniqueStrings([...existing.tags, ...input.tags]),
      customMetadata: { ...existing.customMetadata, ...input.customMetadata },
      internalNotes: existing.internalNotes || input.internalNotes,
      revision: sql`${crmContacts.revision} + 1`, updatedAt: new Date(),
    }).where(eq(crmContacts.id, existing.id));
    return { contactId: existing.id, created: false };
  }
  const [contact] = await database.insert(crmContacts).values({ organizationId, personId, source, internalNotes: input.internalNotes, tags: uniqueStrings(input.tags), customMetadata: input.customMetadata }).returning({ id: crmContacts.id });
  if (!contact) throw new SpeakerCrmError("conflict", "The CRM contact could not be created.");
  return { contactId: contact.id, created: true };
}

async function ensureDefaultPipeline(database: Database, organizationId: string) {
  const [existing] = await database.select({ id: crmPipelines.id }).from(crmPipelines).where(and(eq(crmPipelines.organizationId, organizationId), eq(crmPipelines.isDefault, true))).limit(1);
  if (existing) return existing.id;
  return database.transaction(async (transaction) => {
    const [created] = await transaction.insert(crmPipelines).values({ organizationId, name: "Speaker sourcing", isDefault: true }).onConflictDoNothing().returning({ id: crmPipelines.id });
    const pipelineId = created?.id ?? (await transaction.select({ id: crmPipelines.id }).from(crmPipelines).where(and(eq(crmPipelines.organizationId, organizationId), eq(crmPipelines.name, "Speaker sourcing"))).limit(1))[0]?.id;
    if (!pipelineId) throw new SpeakerCrmError("conflict", "The default pipeline could not be created.");
    await transaction.insert(crmPipelineStages).values([
      { pipelineId, name: "Researching", position: 0, outcome: "open" },
      { pipelineId, name: "Contacted", position: 1, outcome: "open" },
      { pipelineId, name: "Interested", position: 2, outcome: "open" },
      { pipelineId, name: "Confirmed", position: 3, outcome: "won" },
      { pipelineId, name: "Lost", position: 4, outcome: "lost" },
    ]).onConflictDoNothing();
    return pipelineId;
  });
}

async function requireActiveContact(database: Database, organizationId: string, contactId: string) {
  const [contact] = await database.select({ id: crmContacts.id }).from(crmContacts).where(and(eq(crmContacts.id, contactId), eq(crmContacts.organizationId, organizationId), isNull(crmContacts.mergedIntoContactId))).limit(1);
  if (!contact) throw new SpeakerCrmError("contact_not_found", "CRM contact not found.");
  return contact;
}

function requireOrganizationOrganizer(actor: Actor, organizationId: string) {
  if (!actor.organizationRoles.some((grant) => grant.organizationId === organizationId && grant.role === "organizer")) throw new SpeakerCrmError("forbidden", "An organization organizer role is required.");
}

function filterDirectory(rows: CrmDirectoryContact[], filters: Partial<CrmDirectoryFilter>) {
  const search = filters.search?.trim().toLocaleLowerCase() ?? "";
  const companies = (filters.companies ?? []).map(normalizeValue);
  const jobTitles = (filters.jobTitles ?? []).map(normalizeValue);
  const tags = (filters.tags ?? []).map(normalizeValue);
  return rows.filter((row) => {
    const haystack = [row.displayName, row.email ?? "", row.company, row.jobTitle, ...row.tags, ...Object.values(row.customMetadata)].join(" ").toLocaleLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (companies.length && !companies.includes(normalizeValue(row.company))) return false;
    if (jobTitles.length && !jobTitles.includes(normalizeValue(row.jobTitle))) return false;
    if (tags.length && !tags.every((tag) => row.tags.some((value) => normalizeValue(value) === tag))) return false;
    if (filters.metadata && Object.entries(filters.metadata).some(([key, value]) => normalizeValue(row.customMetadata[key] ?? "") !== normalizeValue(value))) return false;
    return true;
  });
}

function normalizeLegacyFilters(filters: CrmDirectoryFilter): CrmDirectoryFilter {
  return {
    ...filters,
    companies: uniqueStrings([...(filters.companies ?? []), ...(filters.company ? [filters.company] : [])]),
    jobTitles: uniqueStrings([...(filters.jobTitles ?? []), ...(filters.jobTitle ? [filters.jobTitle] : [])]),
    tags: uniqueStrings([...(filters.tags ?? []), ...(filters.tag ? [filters.tag] : [])]),
  };
}
function compactFilters(filters: CrmDirectoryFilter) { return { search: filters.search || undefined, companies: filters.companies.length ? filters.companies : undefined, jobTitles: filters.jobTitles.length ? filters.jobTitles : undefined, tags: filters.tags.length ? filters.tags : undefined, metadata: Object.keys(filters.metadata).length ? filters.metadata : undefined }; }
function normalizeValue(value: string) { return value.trim().toLocaleLowerCase(); }
function normalizeName(value: string) { return normalizeValue(value).replace(/[^a-z0-9]+/g, " ").trim(); }
function uniqueStrings(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function sameIds(left: string[], right: string[]) { return left.length === right.length && left.every((id) => right.includes(id)); }
function countValues(values: string[]) { const counts = new Map<string, number>(); for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1); return counts; }
function topCounts(values: Map<string, number>, limit: number) { return [...values].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)).slice(0, limit); }
function outreachResult(request: typeof crmOutreachRequests.$inferSelect, idempotent: boolean): CrmOutreachHandoffRequest { return { requestId: request.id, organizationId: request.organizationId, eventId: request.eventId, recipientPersonIds: request.recipientSnapshot.map((recipient) => recipient.personId), recipientSnapshot: request.recipientSnapshot, message: { name: request.name, subjectTemplate: request.subjectTemplate, htmlTemplate: request.htmlTemplate, textTemplate: request.textTemplate }, idempotencyKey: request.idempotencyKey, idempotent }; }
