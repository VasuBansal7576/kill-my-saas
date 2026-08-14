import { readFile } from "node:fs/promises";
import { and, count, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { createToolingDatabase } from "../packages/database/src/tooling-client";
import {
  cfpForms,
  decisions,
  eventFormats,
  eventMemberships,
  eventRooms,
  eventSpeakers,
  events,
  eventTracks,
  organizationMemberships,
  organizations,
  people,
  personEmailAliases,
  placements,
  publications,
  reviewAssignments,
  reviewPlans,
  reviewRounds,
  scheduleRevisions,
  sessions,
  speakerTasks,
  submissions,
  widgetConfigurations,
} from "../packages/database/src/schema";
import {
  applyPersonaEmailOverrides,
  assertCleanEvaluationWorkflowState,
  assertGoldenPathSeedViability,
  deterministicEvaluationUuid,
  normalizeEmail,
  readEvaluationEnvironmentConfig,
  type EvaluationWorkflowState,
} from "../packages/testkit/src";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const configuration = readEvaluationEnvironmentConfig(process.env, "seed");
const fixtureJson = JSON.parse(await readFile("docs/fixtures/evaluator-personas.json", "utf8")) as unknown;
const overrides = process.env.EVALUATOR_PERSONA_EMAILS_JSON
  ? JSON.parse(process.env.EVALUATOR_PERSONA_EMAILS_JSON) as Record<string, string>
  : {};
const fixture = applyPersonaEmailOverrides(fixtureJson, overrides);
const { database, close } = createToolingDatabase(databaseUrl);

try {
  const result = await database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`evaluation-seed:${configuration.runId}`}, 0))`);

    const [existingOrganization] = await transaction.select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, configuration.organizationId))
      .limit(1);
    if (existingOrganization && existingOrganization.slug !== configuration.organizationSlug) {
      throw new Error("The deterministic evaluation organization ID is already used by a different scope.");
    }
    const existingRunEvents = existingOrganization
      ? await transaction.select({ id: events.id }).from(events)
        .where(eq(events.organizationId, configuration.organizationId))
      : [];
    if (existingRunEvents.some((event) => event.id !== configuration.eventId)) {
      throw new Error(
        "Evaluation run contains additional events and will not be reseeded. Use the explicit isolated-run reset or a fresh run ID/Neon branch.",
      );
    }

    const [existingEvent] = await transaction.select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, configuration.eventId), eq(events.organizationId, configuration.organizationId)))
      .limit(1);
    if (existingEvent) {
      assertCleanEvaluationWorkflowState(await readWorkflowState(transaction, configuration.eventId));
    }

    await transaction.insert(organizations).values({
      id: configuration.organizationId,
      slug: configuration.organizationSlug,
      name: `ProgramFlow Evaluation (${configuration.runId})`,
    }).onConflictDoUpdate({
      target: organizations.id,
      set: { name: `ProgramFlow Evaluation (${configuration.runId})`, updatedAt: new Date() },
    });

    await transaction.insert(events).values({
      id: configuration.eventId,
      organizationId: configuration.organizationId,
      slug: configuration.eventSlug,
      name: fixture.event.name,
      startsOn: fixture.event.starts_on,
      endsOn: fixture.event.ends_on,
      timezone: fixture.event.timezone,
      location: fixture.event.location,
    }).onConflictDoUpdate({
      target: events.id,
      set: {
        name: fixture.event.name,
        startsOn: fixture.event.starts_on,
        endsOn: fixture.event.ends_on,
        timezone: fixture.event.timezone,
        location: fixture.event.location,
        updatedAt: new Date(),
      },
    });

    await transaction.delete(eventTracks).where(eq(eventTracks.eventId, configuration.eventId));
    await transaction.delete(eventFormats).where(eq(eventFormats.eventId, configuration.eventId));
    await transaction.delete(eventRooms).where(eq(eventRooms.eventId, configuration.eventId));
    await transaction.insert(eventTracks).values(fixture.event.tracks.map((name, sortOrder) => ({
      id: deterministicEvaluationUuid(`run:${configuration.runId}:track:${normalizeEmail(name)}`),
      eventId: configuration.eventId,
      name,
      sortOrder,
    })));
    await transaction.insert(eventFormats).values(fixture.event.formats.map((label, sortOrder) => {
      const match = label.match(/^(.*) \((\d+) min\)$/);
      if (!match) throw new Error(`Evaluator format is invalid: ${label}`);
      return {
        id: deterministicEvaluationUuid(`run:${configuration.runId}:format:${normalizeEmail(label)}`),
        eventId: configuration.eventId,
        name: match[1] ?? label,
        durationMinutes: Number(match[2]),
        sortOrder,
      };
    }));
    await transaction.insert(eventRooms).values(fixture.event.rooms.map((name, sortOrder) => ({
      id: deterministicEvaluationUuid(`run:${configuration.runId}:room:${normalizeEmail(name)}`),
      eventId: configuration.eventId,
      name,
      sortOrder,
    })));

    for (const persona of fixture.personas) {
      if (!persona.canonical_person_key) continue;
      const personId = deterministicEvaluationUuid(`person:${persona.canonical_person_key}`);
      await transaction.insert(people).values({
        id: personId,
        stableKey: persona.canonical_person_key,
        displayName: persona.name,
        canonicalEmail: persona.canonical_email,
      }).onConflictDoUpdate({
        target: people.stableKey,
        set: { displayName: persona.name, canonicalEmail: persona.canonical_email, updatedAt: new Date() },
      });

      for (const [index, email] of [persona.canonical_email, ...persona.aliases]
        .filter((value): value is string => Boolean(value)).entries()) {
        const normalizedEmail = normalizeEmail(email);
        const [existingAlias] = await transaction.select({ personId: personEmailAliases.personId })
          .from(personEmailAliases)
          .where(eq(personEmailAliases.normalizedEmail, normalizedEmail))
          .limit(1);
        if (existingAlias && existingAlias.personId !== personId) {
          throw new Error(`Evaluator email ${email} is already linked to a different canonical person.`);
        }
        await transaction.insert(personEmailAliases).values({
          id: deterministicEvaluationUuid(`person:${persona.canonical_person_key}:email:${normalizedEmail}`),
          personId,
          email,
          normalizedEmail,
          isCanonical: index === 0,
        }).onConflictDoUpdate({
          target: personEmailAliases.normalizedEmail,
          set: { email, personId, isCanonical: index === 0, updatedAt: new Date() },
        });
      }

      for (const membership of persona.memberships) {
        if (membership.scope === "organization" && membership.role === "organizer") {
          await transaction.insert(organizationMemberships).values({
            id: deterministicEvaluationUuid(`run:${configuration.runId}:person:${persona.canonical_person_key}:organization:organizer`),
            organizationId: configuration.organizationId,
            personId,
            role: "organizer",
          }).onConflictDoNothing();
        }
        if (membership.scope === "event") {
          await transaction.insert(eventMemberships).values({
            id: deterministicEvaluationUuid(`run:${configuration.runId}:person:${persona.canonical_person_key}:event:${membership.role}`),
            eventId: configuration.eventId,
            personId,
            role: membership.role,
          }).onConflictDoNothing();
        }
      }
    }

    const workflowState = await readWorkflowState(transaction, configuration.eventId);
    const [eventCount, trackCount, formatCount, roomCount, membershipRows] = await Promise.all([
      countRows(transaction, events, eq(events.id, configuration.eventId)),
      countRows(transaction, eventTracks, eq(eventTracks.eventId, configuration.eventId)),
      countRows(transaction, eventFormats, eq(eventFormats.eventId, configuration.eventId)),
      countRows(transaction, eventRooms, eq(eventRooms.eventId, configuration.eventId)),
      transaction.select({ stableKey: people.stableKey, role: eventMemberships.role })
        .from(eventMemberships)
        .innerJoin(people, eq(people.id, eventMemberships.personId))
        .where(eq(eventMemberships.eventId, configuration.eventId)),
    ]);
    const personaByStableKey = new Map(fixture.personas.map((persona) => [persona.canonical_person_key, persona.persona]));
    const personaEventRoles: Record<string, string[]> = {};
    for (const membership of membershipRows) {
      const persona = personaByStableKey.get(membership.stableKey);
      if (!persona) continue;
      (personaEventRoles[persona] ??= []).push(membership.role);
    }
    assertGoldenPathSeedViability({ eventCount, trackCount, formatCount, roomCount, personaEventRoles, workflowState });
    return { workflowState, personaEventRoles };
  });

  console.info(JSON.stringify({
    fixtureVersion: fixture.schema_version,
    runId: configuration.runId,
    databaseScope: configuration.databaseScope,
    organizationId: configuration.organizationId,
    organizationSlug: configuration.organizationSlug,
    eventId: configuration.eventId,
    eventSlug: configuration.eventSlug,
    personas: Object.keys(result.personaEventRoles).length,
    workflowState: result.workflowState,
  }));
} finally {
  await close();
}

type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
async function countRows(transaction: Transaction, table: AnyPgTable, where: SQL<unknown>): Promise<number> {
  const [row] = await transaction.select({ value: count() }).from(table).where(where);
  return Number(row?.value ?? 0);
}

async function readWorkflowState(transaction: Transaction, eventId: string): Promise<EvaluationWorkflowState> {
  const [
    cfpFormsCount,
    submissionsCount,
    decisionsCount,
    sessionsCount,
    reviewPlansCount,
    reviewAssignmentsCount,
    eventSpeakersCount,
    speakerTasksCount,
    scheduleRevisionsCount,
    placementsCount,
    publicationsCount,
    widgetConfigurationsCount,
  ] = await Promise.all([
    countRows(transaction, cfpForms, eq(cfpForms.eventId, eventId)),
    countRows(transaction, submissions, eq(submissions.eventId, eventId)),
    transaction.select({ value: count() }).from(decisions)
      .innerJoin(submissions, eq(submissions.id, decisions.submissionId))
      .where(eq(submissions.eventId, eventId)).then((rows) => Number(rows[0]?.value ?? 0)),
    countRows(transaction, sessions, eq(sessions.eventId, eventId)),
    countRows(transaction, reviewPlans, eq(reviewPlans.eventId, eventId)),
    transaction.select({ value: count() }).from(reviewAssignments)
      .innerJoin(reviewRounds, eq(reviewRounds.id, reviewAssignments.roundId))
      .where(eq(reviewRounds.eventId, eventId)).then((rows) => Number(rows[0]?.value ?? 0)),
    countRows(transaction, eventSpeakers, eq(eventSpeakers.eventId, eventId)),
    countRows(transaction, speakerTasks, eq(speakerTasks.eventId, eventId)),
    countRows(transaction, scheduleRevisions, eq(scheduleRevisions.eventId, eventId)),
    transaction.select({ value: count() }).from(placements)
      .innerJoin(scheduleRevisions, eq(scheduleRevisions.id, placements.revisionId))
      .where(eq(scheduleRevisions.eventId, eventId)).then((rows) => Number(rows[0]?.value ?? 0)),
    countRows(transaction, publications, eq(publications.eventId, eventId)),
    countRows(transaction, widgetConfigurations, eq(widgetConfigurations.eventId, eventId)),
  ]);
  return {
    cfpForms: cfpFormsCount,
    submissions: submissionsCount,
    decisions: decisionsCount,
    sessions: sessionsCount,
    reviewPlans: reviewPlansCount,
    reviewAssignments: reviewAssignmentsCount,
    eventSpeakers: eventSpeakersCount,
    speakerTasks: speakerTasksCount,
    scheduleRevisions: scheduleRevisionsCount,
    placements: placementsCount,
    publications: publicationsCount,
    widgetConfigurations: widgetConfigurationsCount,
  };
}
