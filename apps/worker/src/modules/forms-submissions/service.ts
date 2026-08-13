import {
  cfpForms,
  cfpFormVersions,
  decisionNotifications,
  decisions,
  eventFormats,
  eventTracks,
  events,
  formFields,
  outboxEvents,
  people,
  personEmailAliases,
  rowsFromExecuteResult,
  sessions,
  sessionChangeRequests,
  submissionParticipants,
  submissions,
  submissionVersions,
  type Database,
  type FormFieldDefinition,
  type PublishedFormDefinition,
} from "@programflow/database";
import { and, asc, count, desc, eq, inArray, max, ne, or, sql, type SQL } from "drizzle-orm";
import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";
import {
  deriveRoutingKey,
  formAvailability,
  toPublishedDefinition,
  validateSubmission,
  type FormConfigurationInput,
  type SubmissionInput,
} from "./domain";

type ErrorCode =
  | "event_not_found"
  | "form_not_found"
  | "form_not_published"
  | "submission_not_found"
  | "forbidden"
  | "conflict"
  | "form_closed"
  | "form_not_open"
  | "drafts_disabled"
  | "multiple_drafts_disabled"
  | "submission_limit_reached"
  | "editing_locked"
  | "invalid_form_configuration"
  | "invalid_submission";

export class FormsSubmissionsError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly fields?: Record<string, string[]>) {
    super(message);
  }
}

export type FormWorkspace = {
  event: { id: string; slug: string; name: string; timezone: string };
  form: null | {
    id: string;
    name: string;
    status: "draft" | "published" | "closed";
    target: "abstract" | "session";
    opensAt: string | null;
    closesAt: string | null;
    welcomeCopy: string;
    instructionsCopy: string;
    successCopy: string;
    allowDrafts: boolean;
    allowMultipleDrafts: boolean;
    draftsCountTowardLimit: boolean;
    allowSubmittedEdits: boolean;
    confirmationEmailEnabled: boolean;
    draftReminderEnabled: boolean;
    draftReminderLeadHours: number;
    maxSubmissionsPerPerson: number | null;
    minimumParticipants: number;
    maximumParticipants: number;
    participantRoleLabels: Record<"author" | "co_author" | "presenter", string>;
    revision: number;
    publishedVersion: number | null;
    fields: FormFieldDefinition[];
  };
};

export type PublicForm = {
  event: {
    slug: string;
    name: string;
    location: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
    primaryColor: string;
    tracks: string[];
    formats: string[];
  };
  form: {
    id: string;
    versionId: string;
    version: number;
    name: string;
    availability: "upcoming" | "open" | "closed";
    definition: PublishedFormDefinition;
  };
};

export type SubmissionRecord = {
  id: string;
  eventId: string;
  formId: string;
  formVersion: number;
  submitterPersonId: string | null;
  title: string;
  state: "draft" | "submitted";
  triageState: "unreviewed" | "maybe";
  decision: "accepted" | "rejected" | null;
  decisionId: string | null;
  decisionReleasedAt: string | null;
  decisionNotification: {
    id: string;
    status: "draft" | "reviewed" | "queued" | "handed_off";
    revision: number;
    subjectTemplate: string;
    htmlTemplate: string;
    textTemplate: string;
    communicationId: string | null;
  } | null;
  acceptedSession: { id: string; title: string; abstract: string } | null;
  changeRequests: Array<{
    id: string;
    proposedTitle: string;
    proposedAbstract: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    resolutionNote: string | null;
    createdAt: string;
  }>;
  routingKey: string | null;
  version: number;
  answers: Record<string, unknown>;
  participants: Array<{
    id: string;
    personId: string | null;
    name: string;
    email: string;
    role: "author" | "co_author" | "presenter";
    sortOrder: number;
  }>;
  submittedAt: string | null;
  updatedAt: string;
};

export async function getFormWorkspace(database: Database, actor: Actor, eventSlug: string): Promise<FormWorkspace> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  const [form] = await database.select().from(cfpForms)
    .where(eq(cfpForms.eventId, event.id))
    .orderBy(desc(cfpForms.updatedAt))
    .limit(1);
  if (!form) return { event: pickEvent(event), form: null };

  const [fields, versions] = await Promise.all([
    database.select().from(formFields).where(eq(formFields.formId, form.id)).orderBy(asc(formFields.sortOrder)),
    database.select({ version: cfpFormVersions.version }).from(cfpFormVersions)
      .where(eq(cfpFormVersions.formId, form.id)).orderBy(desc(cfpFormVersions.version)).limit(1),
  ]);

  return {
    event: pickEvent(event),
    form: {
      ...form,
      opensAt: dateToJson(form.opensAt),
      closesAt: dateToJson(form.closesAt),
      publishedVersion: versions[0]?.version ?? null,
      fields: fields.map(toFieldDefinition),
    },
  };
}

export async function createForm(
  database: Database,
  actor: Actor,
  eventSlug: string,
  input: FormConfigurationInput,
): Promise<FormWorkspace> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  await database.transaction(async (transaction) => {
    const [form] = await transaction.insert(cfpForms).values({
      eventId: event.id,
      ...configurationColumns(input),
    }).returning({ id: cfpForms.id });
    if (!form) throw new Error("The CFP form could not be created.");
    if (input.fields.length > 0) {
      await transaction.insert(formFields).values(input.fields.map((field, sortOrder) => ({
        formId: form.id,
        ...field,
        sortOrder,
      })));
    }
  });
  return getFormWorkspace(database, actor, eventSlug);
}

export async function updateForm(
  database: Database,
  actor: Actor,
  eventSlug: string,
  formId: string,
  input: FormConfigurationInput,
): Promise<FormWorkspace> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  const form = await requireForm(database, formId, event.id);
  if (input.revision !== undefined && input.revision !== form.revision) {
    throw new FormsSubmissionsError("conflict", "This form changed after it was loaded. Refresh before saving.");
  }

  await database.transaction(async (transaction) => {
    const updated = await transaction.update(cfpForms).set({
      ...configurationColumns(input),
      revision: form.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(cfpForms.id, form.id), eq(cfpForms.revision, form.revision))).returning({ id: cfpForms.id });
    if (updated.length === 0) {
      throw new FormsSubmissionsError("conflict", "This form changed while it was being saved. Refresh before trying again.");
    }
    await transaction.delete(formFields).where(eq(formFields.formId, form.id));
    if (input.fields.length > 0) {
      await transaction.insert(formFields).values(input.fields.map((field, sortOrder) => ({
        formId: form.id,
        ...field,
        sortOrder,
      })));
    }
  });
  return getFormWorkspace(database, actor, eventSlug);
}

export async function publishForm(
  database: Database,
  actor: Actor,
  eventSlug: string,
  formId: string,
): Promise<FormWorkspace> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  const form = await requireForm(database, formId, event.id);
  const fields = await database.select().from(formFields)
    .where(eq(formFields.formId, form.id)).orderBy(asc(formFields.sortOrder));
  const publishableFields = fields.map(({ key, label, type, required, settings, condition }) => {
    if (type === "file") {
      throw new FormsSubmissionsError("invalid_form_configuration", "File questions belong to the Files & Deliverables workflow and cannot be published on a CFP form.");
    }
    return { key, label, type, required, settings, condition };
  });
  const definition = toPublishedDefinition({
    ...form,
    opensAt: dateToJson(form.opensAt),
    closesAt: dateToJson(form.closesAt),
    fields: publishableFields,
  });
  const latestRows = await database.select({ latest: max(cfpFormVersions.version) })
    .from(cfpFormVersions).where(eq(cfpFormVersions.formId, form.id));
  const version = (latestRows[0]?.latest ?? 0) + 1;

  await database.transaction(async (transaction) => {
    await transaction.insert(cfpFormVersions).values({
      formId: form.id,
      version,
      definition,
      publishedByPersonId: actor.personId,
    });
    await transaction.update(cfpForms).set({
      status: "published",
      revision: form.revision + 1,
      updatedAt: new Date(),
    }).where(eq(cfpForms.id, form.id));
  });
  return getFormWorkspace(database, actor, eventSlug);
}

export async function closeForm(
  database: Database,
  actor: Actor,
  eventSlug: string,
  formId: string,
): Promise<FormWorkspace> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  const form = await requireForm(database, formId, event.id);
  await database.update(cfpForms).set({ status: "closed", revision: form.revision + 1, updatedAt: new Date() })
    .where(eq(cfpForms.id, form.id));
  return getFormWorkspace(database, actor, eventSlug);
}

export async function getPublicForm(database: Database, eventSlug: string, now = new Date()): Promise<PublicForm> {
  const event = await requireEvent(database, eventSlug);
  const [form] = await database.select().from(cfpForms)
    .where(and(eq(cfpForms.eventId, event.id), or(eq(cfpForms.status, "published"), eq(cfpForms.status, "closed"))))
    .orderBy(desc(cfpForms.updatedAt)).limit(1);
  if (!form) throw new FormsSubmissionsError("form_not_published", "This event has not published a call for speakers.");
  const [version] = await database.select().from(cfpFormVersions)
    .where(eq(cfpFormVersions.formId, form.id)).orderBy(desc(cfpFormVersions.version)).limit(1);
  if (!version) throw new FormsSubmissionsError("form_not_published", "This event has not published a call for speakers.");
  const [tracks, formats] = await Promise.all([
    database.select({ name: eventTracks.name }).from(eventTracks).where(eq(eventTracks.eventId, event.id)).orderBy(asc(eventTracks.sortOrder)),
    database.select({ name: eventFormats.name, durationMinutes: eventFormats.durationMinutes }).from(eventFormats).where(eq(eventFormats.eventId, event.id)).orderBy(asc(eventFormats.sortOrder)),
  ]);
  const availability = formAvailability(form.status, version.definition, now);
  if (availability === "draft") throw new FormsSubmissionsError("form_not_published", "This event has not published a call for speakers.");
  return {
    event: {
      slug: event.slug,
      name: event.name,
      location: event.location,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      timezone: event.timezone,
      primaryColor: event.branding.primaryColor,
      tracks: tracks.map((track) => track.name),
      formats: formats.map(formatLabel),
    },
    form: { id: form.id, versionId: version.id, version: version.version, name: form.name, availability, definition: version.definition },
  };
}

export async function createSpeakerSubmission(
  database: Database,
  actor: Actor,
  eventSlug: string,
  formId: string,
  input: SubmissionInput,
  now = new Date(),
): Promise<SubmissionRecord> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "speaker");
  const form = await requireForm(database, formId, event.id);
  const formVersion = await requireLatestFormVersion(database, form.id);
  assertSubmissionOperationAllowed(form.status, formVersion.definition, input.saveAsDraft, now);
  await assertSubmissionLimit(database, actor.personId, form, formVersion.definition);
  const catalogs = await getCatalogs(database, event.id);
  assertValidSubmission(formVersion.definition, input, catalogs);
  const routingKey = deriveRoutingKey(formVersion.definition, input.answers);
  const participantPersonIds = await resolveParticipantPeople(database, input.participants.map((participant) => participant.email));
  const state = input.saveAsDraft ? "draft" : "submitted";

  const id = await database.transaction(async (transaction) => {
    const [submission] = await transaction.insert(submissions).values({
      eventId: event.id,
      formId: form.id,
      formVersionId: formVersion.id,
      submitterPersonId: actor.personId,
      title: input.title,
      state,
      routingKey,
      submittedAt: state === "submitted" ? now : null,
    }).returning({ id: submissions.id });
    if (!submission) throw new Error("The submission could not be created.");
    await transaction.insert(submissionVersions).values({
      submissionId: submission.id,
      version: 1,
      title: input.title,
      answers: input.answers,
      createdByPersonId: actor.personId,
    });
    if (input.participants.length > 0) {
      await transaction.insert(submissionParticipants).values(input.participants.map((participant, sortOrder) => ({
        submissionId: submission.id,
        personId: participantPersonIds.get(normalizeEmail(participant.email)) ?? null,
        name: participant.name,
        email: normalizeEmail(participant.email),
        role: participant.role,
        sortOrder,
      })));
    }
    if (state === "submitted") {
      await insertSubmissionOutbox(transaction, submission.id, event.id, actor.personId, formVersion.definition.confirmationEmailEnabled, "submitted", 1);
    } else {
      await scheduleDraftReminder(transaction, submission.id, event.id, actor.personId, formVersion.definition, now);
    }
    return submission.id;
  });
  return requireSubmissionRecord(database, id);
}

export async function createManualSubmission(
  database: Database,
  actor: Actor,
  eventSlug: string,
  formId: string,
  input: SubmissionInput,
  now = new Date(),
): Promise<SubmissionRecord> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  const form = await requireForm(database, formId, event.id);
  const formVersion = await requireLatestFormVersion(database, form.id);
  const catalogs = await getCatalogs(database, event.id);
  const submittedInput = { ...input, saveAsDraft: false };
  assertValidSubmission(formVersion.definition, submittedInput, catalogs);
  const participantPersonIds = await resolveParticipantPeople(database, input.participants.map((participant) => participant.email));
  const primary = input.participants.find((participant) => participant.role === "author") ?? input.participants[0];

  const id = await database.transaction(async (transaction) => {
    const [submission] = await transaction.insert(submissions).values({
      eventId: event.id,
      formId: form.id,
      formVersionId: formVersion.id,
      submitterPersonId: primary ? participantPersonIds.get(normalizeEmail(primary.email)) ?? null : null,
      title: input.title,
      state: "submitted",
      routingKey: deriveRoutingKey(formVersion.definition, input.answers),
      submittedAt: now,
    }).returning({ id: submissions.id });
    if (!submission) throw new Error("The submission could not be created.");
    await transaction.insert(submissionVersions).values({
      submissionId: submission.id,
      version: 1,
      title: input.title,
      answers: input.answers,
      createdByPersonId: actor.personId,
    });
    if (input.participants.length > 0) {
      await transaction.insert(submissionParticipants).values(input.participants.map((participant, sortOrder) => ({
        submissionId: submission.id,
        personId: participantPersonIds.get(normalizeEmail(participant.email)) ?? null,
        name: participant.name,
        email: normalizeEmail(participant.email),
        role: participant.role,
        sortOrder,
      })));
    }
    await insertSubmissionOutbox(transaction, submission.id, event.id, actor.personId, false, "manually_entered", 1);
    return submission.id;
  });
  return requireSubmissionRecord(database, id);
}

export async function updateSpeakerSubmission(
  database: Database,
  actor: Actor,
  eventSlug: string,
  submissionId: string,
  input: SubmissionInput,
  now = new Date(),
): Promise<SubmissionRecord> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "speaker");
  const [submission] = await database.select().from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.eventId, event.id))).limit(1);
  if (!submission) throw new FormsSubmissionsError("submission_not_found", "Submission not found.");
  if (submission.submitterPersonId !== actor.personId) throw new FormsSubmissionsError("forbidden", "You can only edit your own submissions.");
  const [decision] = await database.select({ id: decisions.id }).from(decisions)
    .where(eq(decisions.submissionId, submission.id)).limit(1);
  if (decision) {
    throw new FormsSubmissionsError(
      "editing_locked",
      "A final Decision locks the proposal snapshot. Request an audited change to the linked Session instead.",
    );
  }
  const [form, version, activeVersion] = await Promise.all([
    requireForm(database, submission.formId, event.id),
    requireFormVersion(database, submission.formVersionId),
    requireLatestFormVersion(database, submission.formId),
  ]);
  if (formAvailability(form.status, activeVersion.definition, now) !== "open") {
    throw new FormsSubmissionsError("editing_locked", "Submissions cannot be edited after the call closes.");
  }
  if (submission.state === "submitted" && !activeVersion.definition.allowSubmittedEdits) {
    throw new FormsSubmissionsError("editing_locked", "Submitted proposals are locked by the organizer.");
  }
  if (submission.state === "submitted" && input.saveAsDraft) {
    throw new FormsSubmissionsError("conflict", "A submitted proposal cannot return to draft state.");
  }
  const catalogs = await getCatalogs(database, event.id);
  assertValidSubmission(version.definition, input, catalogs);
  const participantPersonIds = await resolveParticipantPeople(database, input.participants.map((participant) => participant.email));
  const nextState = input.saveAsDraft ? "draft" : "submitted";
  const firstSubmission = submission.state === "draft" && nextState === "submitted";
  if (firstSubmission) await assertSubmissionLimit(database, actor.personId, form, activeVersion.definition, submission.id);
  const nextVersion = submission.currentVersion + 1;

  await database.transaction(async (transaction) => {
    await transaction.update(submissions).set({
      title: input.title,
      state: nextState,
      routingKey: deriveRoutingKey(version.definition, input.answers),
      currentVersion: nextVersion,
      submittedAt: firstSubmission ? now : submission.submittedAt,
      updatedAt: now,
    }).where(and(eq(submissions.id, submission.id), eq(submissions.currentVersion, submission.currentVersion)));
    await transaction.insert(submissionVersions).values({
      submissionId: submission.id,
      version: nextVersion,
      title: input.title,
      answers: input.answers,
      createdByPersonId: actor.personId,
    });
    await transaction.delete(submissionParticipants).where(eq(submissionParticipants.submissionId, submission.id));
    if (input.participants.length > 0) {
      await transaction.insert(submissionParticipants).values(input.participants.map((participant, sortOrder) => ({
        submissionId: submission.id,
        personId: participantPersonIds.get(normalizeEmail(participant.email)) ?? null,
        name: participant.name,
        email: normalizeEmail(participant.email),
        role: participant.role,
        sortOrder,
      })));
    }
    if (firstSubmission) {
      await insertSubmissionOutbox(transaction, submission.id, event.id, actor.personId, version.definition.confirmationEmailEnabled, "submitted", nextVersion);
    } else if (nextState === "submitted") {
      await insertSubmissionOutbox(transaction, submission.id, event.id, actor.personId, false, "updated", nextVersion);
    } else {
      await scheduleDraftReminder(transaction, submission.id, event.id, actor.personId, activeVersion.definition, now);
    }
  });
  return requireSubmissionRecord(database, submission.id);
}

export async function listOrganizerSubmissions(database: Database, actor: Actor, eventSlug: string): Promise<SubmissionRecord[]> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  return listSubmissionRecords(database, eq(submissions.eventId, event.id), true);
}

export async function setSubmissionTriage(
  database: Database,
  actor: Actor,
  eventSlug: string,
  submissionId: string,
  triageState: "unreviewed" | "maybe",
): Promise<SubmissionRecord> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "organizer");
  const [submission] = await database.select({ id: submissions.id, eventId: submissions.eventId, state: submissions.state })
    .from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!submission || submission.eventId !== event.id) throw new FormsSubmissionsError("submission_not_found", "Submission not found.");
  if (submission.state !== "submitted") throw new FormsSubmissionsError("conflict", "Only submitted proposals can enter the decision queue.");
  const [decision] = await database.select({ id: decisions.id }).from(decisions).where(eq(decisions.submissionId, submissionId)).limit(1);
  if (decision) throw new FormsSubmissionsError("conflict", "A final decision already exists for this proposal.");
  await database.update(submissions).set({ triageState, updatedAt: new Date() }).where(eq(submissions.id, submissionId));
  return requireSubmissionRecord(database, submissionId);
}

export async function listSpeakerSubmissions(database: Database, actor: Actor, eventSlug: string): Promise<SubmissionRecord[]> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "speaker");
  return listSubmissionRecords(database, and(eq(submissions.eventId, event.id), eq(submissions.submitterPersonId, actor.personId))!, false);
}

export async function getSpeakerSubmission(
  database: Database,
  actor: Actor,
  eventSlug: string,
  submissionId: string,
): Promise<SubmissionRecord> {
  const event = await requireEvent(database, eventSlug);
  requireRole(actor, event.id, "speaker");
  const record = await requireSubmissionRecord(database, submissionId, false);
  if (record.eventId !== event.id || record.submitterPersonId !== actor.personId) {
    throw new FormsSubmissionsError("forbidden", "You can only view your own submissions.");
  }
  return record;
}

async function listSubmissionRecords(database: Database, where: SQL<unknown>, includePrivateDecisions: boolean): Promise<SubmissionRecord[]> {
  const result = await database.execute(sql`
    select
      ${submissions.id} as id,
      ${submissions.eventId} as event_id,
      ${submissions.formId} as form_id,
      ${submissions.submitterPersonId} as submitter_person_id,
      ${submissions.state} as state,
      ${submissions.triageState} as triage_state,
      ${submissions.routingKey} as routing_key,
      ${submissions.submittedAt} as submitted_at,
      ${submissions.updatedAt} as updated_at,
      current_version.version as content_version,
      current_version.title as title,
      current_version.answers as answers,
      form_version.version as form_version,
      decision.id as decision_id,
      decision.outcome as decision,
      decision.released_at as decision_released_at,
      notification.id as notification_id,
      notification.status as notification_status,
      notification.revision as notification_revision,
      notification.subject_template as notification_subject,
      notification.html_template as notification_html,
      notification.text_template as notification_text,
      notification.communication_id as notification_communication_id,
      coalesce(
        json_agg(
          json_build_object(
            'id', participant.id,
            'personId', participant.person_id,
            'name', participant.name,
            'email', participant.email,
            'role', participant.role,
            'sortOrder', participant.sort_order
          ) order by participant.sort_order
        ) filter (where participant.id is not null),
        '[]'::json
      ) as participants
    from ${submissions}
    inner join ${submissionVersions} as current_version
      on current_version.submission_id = ${submissions.id}
      and current_version.version = ${submissions.currentVersion}
    inner join ${cfpFormVersions} as form_version on form_version.id = ${submissions.formVersionId}
    left join ${decisions} as decision
      on decision.submission_id = ${submissions.id}
      and (${includePrivateDecisions} or decision.released_at is not null)
    left join ${decisionNotifications} as notification on notification.decision_id = decision.id
    left join ${submissionParticipants} as participant on participant.submission_id = ${submissions.id}
    where ${where}
    group by
      ${submissions.id}, current_version.id, form_version.id, decision.id, notification.id
    order by ${submissions.updatedAt} desc
  `);
  const rows = rowsFromExecuteResult<{
    id: string; event_id: string; form_id: string; submitter_person_id: string | null;
    state: "draft" | "submitted"; triage_state: "unreviewed" | "maybe"; routing_key: string | null;
    submitted_at: Date | string | null; updated_at: Date | string; content_version: number; title: string;
    answers: Record<string, unknown>; form_version: number; decision_id: string | null; decision: "accepted" | "rejected" | null;
    decision_released_at: Date | string | null; notification_id: string | null;
    notification_status: "draft" | "reviewed" | "queued" | "handed_off" | null; notification_revision: number | null;
    notification_subject: string | null; notification_html: string | null; notification_text: string | null;
    notification_communication_id: string | null;
    participants: SubmissionRecord["participants"];
  }>(result);
  const submissionIds = rows.map((row) => row.id);
  const eventIds = [...new Set(rows.map((row) => row.event_id))];
  const acceptedSessions = submissionIds.length > 0
    ? await database.select({ id: sessions.id, sourceSubmissionId: sessions.sourceSubmissionId, title: sessions.title, abstract: sessions.abstract })
      .from(sessions).where(and(inArray(sessions.sourceSubmissionId, submissionIds), inArray(sessions.eventId, eventIds)))
    : [];
  const acceptedSessionBySubmission = new Map(acceptedSessions.flatMap((session) => session.sourceSubmissionId
    ? [[session.sourceSubmissionId, { id: session.id, title: session.title, abstract: session.abstract }] as const]
    : []));
  const acceptedSessionIds = acceptedSessions.map((session) => session.id);
  const changeRequestRows = acceptedSessionIds.length
    ? await database.select().from(sessionChangeRequests)
      .where(inArray(sessionChangeRequests.sessionId, acceptedSessionIds))
      .orderBy(desc(sessionChangeRequests.createdAt))
    : [];
  return rows.map((row) => {
    return {
      id: row.id,
      eventId: row.event_id,
      formId: row.form_id,
      formVersion: row.form_version,
      submitterPersonId: row.submitter_person_id,
      title: row.title,
      state: row.state,
      triageState: row.triage_state,
      decision: row.decision,
      decisionId: row.decision_id,
      decisionReleasedAt: row.decision_released_at ? new Date(row.decision_released_at).toISOString() : null,
      decisionNotification: row.notification_id && row.notification_status && row.notification_revision !== null
        ? {
          id: row.notification_id,
          status: row.notification_status,
          revision: row.notification_revision,
          subjectTemplate: row.notification_subject ?? "",
          htmlTemplate: row.notification_html ?? "",
          textTemplate: row.notification_text ?? "",
          communicationId: row.notification_communication_id,
        }
        : null,
      acceptedSession: row.decision === "accepted" ? acceptedSessionBySubmission.get(row.id) ?? null : null,
      changeRequests: row.decision === "accepted"
        ? changeRequestRows.filter((request) => request.sessionId === acceptedSessionBySubmission.get(row.id)?.id).map((request) => ({
          id: request.id,
          proposedTitle: request.proposedTitle,
          proposedAbstract: request.proposedAbstract,
          reason: request.reason,
          status: request.status,
          resolutionNote: request.resolutionNote,
          createdAt: request.createdAt.toISOString(),
        }))
        : [],
      routingKey: row.routing_key,
      version: row.content_version,
      answers: row.answers,
      participants: row.participants,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

async function requireSubmissionRecord(database: Database, id: string, includePrivateDecision = true): Promise<SubmissionRecord> {
  const [root] = await database.select().from(submissions).where(eq(submissions.id, id)).limit(1);
  if (!root) throw new FormsSubmissionsError("submission_not_found", "Submission not found.");
  const [current, participants, formVersion, decision, acceptedSession] = await Promise.all([
    database.select().from(submissionVersions).where(and(eq(submissionVersions.submissionId, root.id), eq(submissionVersions.version, root.currentVersion))).limit(1),
    database.select().from(submissionParticipants).where(eq(submissionParticipants.submissionId, root.id)).orderBy(asc(submissionParticipants.sortOrder)),
    requireFormVersion(database, root.formVersionId),
    database.select({
      id: decisions.id,
      outcome: decisions.outcome,
      releasedAt: decisions.releasedAt,
    }).from(decisions).where(and(
      eq(decisions.submissionId, root.id),
      includePrivateDecision ? sql`true` : sql`${decisions.releasedAt} is not null`,
    )).limit(1),
    database.select({ id: sessions.id, title: sessions.title, abstract: sessions.abstract }).from(sessions).where(and(eq(sessions.sourceSubmissionId, root.id), eq(sessions.eventId, root.eventId))).limit(1),
  ]);
  if (!current[0]) throw new Error(`Submission ${root.id} has no current version.`);
  const visibleDecision = decision[0] ?? null;
  const [notification, changeRequests] = visibleDecision
    ? await Promise.all([
      database.select().from(decisionNotifications).where(eq(decisionNotifications.decisionId, visibleDecision.id)).limit(1),
      acceptedSession[0]
        ? database.select().from(sessionChangeRequests).where(eq(sessionChangeRequests.sessionId, acceptedSession[0].id)).orderBy(desc(sessionChangeRequests.createdAt))
        : Promise.resolve([]),
    ])
    : [[], []];
  return toSubmissionRecord(
    root,
    current[0],
    participants,
    formVersion.version,
    visibleDecision,
    notification[0] ?? null,
    visibleDecision?.outcome === "accepted" ? acceptedSession[0] ?? null : null,
    changeRequests,
  );
}

function toSubmissionRecord(
  root: typeof submissions.$inferSelect,
  current: typeof submissionVersions.$inferSelect,
  participants: Array<typeof submissionParticipants.$inferSelect>,
  formVersion: number,
  decision: { id: string; outcome: "accepted" | "rejected"; releasedAt: Date | null } | null,
  notification: typeof decisionNotifications.$inferSelect | null,
  acceptedSession: { id: string; title: string; abstract: string } | null,
  changeRequests: Array<typeof sessionChangeRequests.$inferSelect>,
): SubmissionRecord {
  return {
    id: root.id,
    eventId: root.eventId,
    formId: root.formId,
    formVersion,
    submitterPersonId: root.submitterPersonId,
    title: current.title,
    state: root.state,
    triageState: root.triageState,
    decision: decision?.outcome ?? null,
    decisionId: decision?.id ?? null,
    decisionReleasedAt: decision?.releasedAt?.toISOString() ?? null,
    decisionNotification: notification ? {
      id: notification.id,
      status: notification.status,
      revision: notification.revision,
      subjectTemplate: notification.subjectTemplate,
      htmlTemplate: notification.htmlTemplate,
      textTemplate: notification.textTemplate,
      communicationId: notification.communicationId,
    } : null,
    acceptedSession,
    changeRequests: changeRequests.map((request) => ({
      id: request.id,
      proposedTitle: request.proposedTitle,
      proposedAbstract: request.proposedAbstract,
      reason: request.reason,
      status: request.status,
      resolutionNote: request.resolutionNote,
      createdAt: request.createdAt.toISOString(),
    })),
    routingKey: root.routingKey,
    version: current.version,
    answers: current.answers,
    participants: participants.map((participant) => ({
      id: participant.id,
      personId: participant.personId,
      name: participant.name,
      email: participant.email,
      role: participant.role,
      sortOrder: participant.sortOrder,
    })),
    submittedAt: dateToJson(root.submittedAt),
    updatedAt: root.updatedAt.toISOString(),
  };
}

async function requireEvent(database: Database, eventSlug: string) {
  const [event] = await database.select().from(events).where(eq(events.slug, eventSlug)).limit(1);
  if (!event) throw new FormsSubmissionsError("event_not_found", "Event not found.");
  return event;
}

async function requireForm(database: Database, formId: string, eventId: string) {
  const [form] = await database.select().from(cfpForms)
    .where(and(eq(cfpForms.id, formId), eq(cfpForms.eventId, eventId))).limit(1);
  if (!form) throw new FormsSubmissionsError("form_not_found", "CFP form not found.");
  return form;
}

async function requireLatestFormVersion(database: Database, formId: string) {
  const [version] = await database.select().from(cfpFormVersions)
    .where(eq(cfpFormVersions.formId, formId)).orderBy(desc(cfpFormVersions.version)).limit(1);
  if (!version) throw new FormsSubmissionsError("form_not_published", "Publish the form before collecting submissions.");
  return version;
}

async function requireFormVersion(database: Database, id: string) {
  const [version] = await database.select().from(cfpFormVersions).where(eq(cfpFormVersions.id, id)).limit(1);
  if (!version) throw new FormsSubmissionsError("form_not_published", "The published form version is unavailable.");
  return version;
}

function requireRole(actor: Actor, eventId: string, role: "organizer" | "speaker") {
  if (!actorCanAccessEvent(actor, eventId, role)) {
    throw new FormsSubmissionsError("forbidden", `${role === "organizer" ? "Organizer" : "Speaker"} access is required for this event.`);
  }
}

function assertSubmissionOperationAllowed(
  status: "draft" | "published" | "closed",
  definition: PublishedFormDefinition,
  draft: boolean,
  now: Date,
) {
  const availability = formAvailability(status, definition, now);
  if (availability === "closed") throw new FormsSubmissionsError("form_closed", "The call for speakers is closed.");
  if (availability !== "open") throw new FormsSubmissionsError("form_not_open", "The call for speakers is not open yet.");
  if (draft && !definition.allowDrafts) throw new FormsSubmissionsError("drafts_disabled", "This form does not allow drafts.");
}

async function assertSubmissionLimit(
  database: Database,
  personId: string,
  form: typeof cfpForms.$inferSelect,
  definition: PublishedFormDefinition,
  excludeId?: string,
) {
  if (!definition.allowMultipleDrafts) {
    const conditions = [eq(submissions.formId, form.id), eq(submissions.submitterPersonId, personId), eq(submissions.state, "draft")];
    if (excludeId) conditions.push(ne(submissions.id, excludeId));
    const countRows = await database.select({ total: count() }).from(submissions).where(and(...conditions));
    const total = countRows[0]?.total ?? 0;
    if (total > 0) throw new FormsSubmissionsError("multiple_drafts_disabled", "Resume your existing draft before starting another.");
  }
  if (definition.maxSubmissionsPerPerson === null) return;
  const conditions = [eq(submissions.formId, form.id), eq(submissions.submitterPersonId, personId)];
  if (!definition.draftsCountTowardLimit) conditions.push(eq(submissions.state, "submitted"));
  if (excludeId) conditions.push(ne(submissions.id, excludeId));
  const countRows = await database.select({ total: count() }).from(submissions).where(and(...conditions));
  const total = countRows[0]?.total ?? 0;
  if (total >= definition.maxSubmissionsPerPerson) {
    throw new FormsSubmissionsError("submission_limit_reached", `This call allows ${definition.maxSubmissionsPerPerson} submission(s) per person.`);
  }
}

async function getCatalogs(database: Database, eventId: string) {
  const [tracks, formats] = await Promise.all([
    database.select({ name: eventTracks.name }).from(eventTracks).where(eq(eventTracks.eventId, eventId)),
    database.select({ name: eventFormats.name, durationMinutes: eventFormats.durationMinutes }).from(eventFormats).where(eq(eventFormats.eventId, eventId)),
  ]);
  return { tracks: new Set(tracks.map((track) => track.name)), formats: new Set(formats.map(formatLabel)) };
}

function formatLabel(format: { name: string; durationMinutes: number }): string {
  return `${format.name} (${format.durationMinutes} min)`;
}

function assertValidSubmission(
  definition: PublishedFormDefinition,
  input: SubmissionInput,
  catalogs: { tracks: ReadonlySet<string>; formats: ReadonlySet<string> },
) {
  const issues = validateSubmission(definition, input, catalogs);
  if (issues.length > 0) {
    const fields: Record<string, string[]> = {};
    for (const issue of issues) (fields[issue.field] ??= []).push(issue.message);
    throw new FormsSubmissionsError("invalid_submission", "Complete the required submission fields.", fields);
  }
}

async function resolveParticipantPeople(database: Database, emails: string[]): Promise<Map<string, string>> {
  const normalized = [...new Set(emails.map(normalizeEmail))];
  if (normalized.length === 0) return new Map();
  const [aliases, canonicalPeople] = await Promise.all([
    database.select({ email: personEmailAliases.normalizedEmail, personId: personEmailAliases.personId })
      .from(personEmailAliases).where(inArray(personEmailAliases.normalizedEmail, normalized)),
    database.select({ email: people.canonicalEmail, personId: people.id })
      .from(people).where(inArray(people.canonicalEmail, normalized)),
  ]);
  return new Map([...canonicalPeople, ...aliases].flatMap((row) => row.email ? [[normalizeEmail(row.email), row.personId] as const] : []));
}

function configurationColumns(input: FormConfigurationInput) {
  return {
    name: input.name,
    target: input.target,
    opensAt: input.opensAt ? new Date(input.opensAt) : null,
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
    welcomeCopy: input.welcomeCopy,
    instructionsCopy: input.instructionsCopy,
    successCopy: input.successCopy,
    allowDrafts: input.allowDrafts,
    allowMultipleDrafts: input.allowMultipleDrafts,
    draftsCountTowardLimit: input.draftsCountTowardLimit,
    allowSubmittedEdits: input.allowSubmittedEdits,
    confirmationEmailEnabled: input.confirmationEmailEnabled,
    draftReminderEnabled: input.draftReminderEnabled,
    draftReminderLeadHours: input.draftReminderLeadHours,
    maxSubmissionsPerPerson: input.maxSubmissionsPerPerson,
    minimumParticipants: input.minimumParticipants,
    maximumParticipants: input.maximumParticipants,
    participantRoleLabels: input.participantRoleLabels,
  };
}

function toFieldDefinition(field: typeof formFields.$inferSelect): FormFieldDefinition {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    sortOrder: field.sortOrder,
    settings: field.settings,
    condition: field.condition,
  };
}

function pickEvent(event: typeof events.$inferSelect) {
  return { id: event.id, slug: event.slug, name: event.name, timezone: event.timezone };
}

function dateToJson(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function insertSubmissionOutbox(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  submissionId: string,
  eventId: string,
  personId: string,
  confirmation: boolean,
  action: "submitted" | "updated" | "manually_entered",
  version: number,
) {
  const eventType = action === "submitted" && confirmation ? "submission.confirmation_requested" : `submission.${action}`;
  await transaction.insert(outboxEvents).values({
    aggregateType: "submission",
    aggregateId: submissionId,
    eventType,
    payload: { submissionId, eventId, submitterPersonId: personId, confirmationRequested: confirmation },
    idempotencyKey: `submission:${submissionId}:${action}:v${version}`,
  });
}

async function scheduleDraftReminder(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  submissionId: string,
  eventId: string,
  personId: string,
  definition: PublishedFormDefinition,
  now: Date,
) {
  if (!definition.draftReminderEnabled || !definition.closesAt) return;
  const scheduledFor = new Date(new Date(definition.closesAt).getTime() - definition.draftReminderLeadHours * 60 * 60 * 1_000);
  await transaction.insert(outboxEvents).values({
    aggregateType: "submission",
    aggregateId: submissionId,
    eventType: "submission.draft_reminder_requested",
    payload: { submissionId, eventId, submitterPersonId: personId, verifyStillDraft: true },
    idempotencyKey: `submission:${submissionId}:draft-reminder`,
    availableAt: scheduledFor > now ? scheduledFor : now,
  }).onConflictDoNothing({ target: outboxEvents.idempotencyKey });
}
