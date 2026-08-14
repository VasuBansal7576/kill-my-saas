import { and, eq, sql } from "drizzle-orm";
import { createToolingDatabase } from "../packages/database/src/tooling-client";
import {
  eventMemberships,
  events,
  evidenceRecords,
  organizationMemberships,
  organizations,
  providerConfigurations,
} from "../packages/database/src/schema";
import { readEvaluationEnvironmentConfig } from "../packages/testkit/src";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const configuration = readEvaluationEnvironmentConfig(process.env, "reset");
const { database, close } = createToolingDatabase(databaseUrl);

try {
  const result = await database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`evaluation-reset:${configuration.runId}`}, 0))`);
    const [organization] = await transaction.select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(and(
        eq(organizations.id, configuration.organizationId),
        eq(organizations.slug, configuration.organizationSlug),
      ))
      .limit(1);
    if (!organization) return { removed: false, eventIds: [] as string[] };

    const runEvents = await transaction.select({ id: events.id, slug: events.slug })
      .from(events)
      .where(eq(events.organizationId, organization.id));
    for (const event of runEvents) {
      await transaction.execute(sql`
        delete from outbox_events
        where payload ->> 'eventId' = ${event.id}
           or payload ->> 'organizationId' = ${organization.id}
           or (aggregate_type = 'submission' and aggregate_id in (
             select id from submissions where event_id = ${event.id}
           ))
           or (aggregate_type = 'decision' and aggregate_id in (
             select decision.id
             from decisions decision
             join submissions submission on submission.id = decision.submission_id
             where submission.event_id = ${event.id}
           ))
           or (aggregate_type = 'publication' and aggregate_id in (
             select id from publications where event_id = ${event.id}
           ))
           or (aggregate_type = 'communication_delivery' and aggregate_id in (
             select recipient.id
             from communication_recipients recipient
             join communications communication on communication.id = recipient.communication_id
             where communication.event_id = ${event.id}
           ))
      `);
    }

    if (configuration.databaseScope === "disposable_neon_branch") {
      const isolatedOrganizations = await transaction.select({ id: organizations.id, slug: organizations.slug })
        .from(organizations);
      if (isolatedOrganizations.length !== 1 || isolatedOrganizations[0]?.id !== organization.id) {
        throw new Error("A disposable evaluation branch must contain exactly the confirmed evaluation organization before reset.");
      }
      // The product schema intentionally keeps several operational cross-links restrictive
      // (room placements, calendar recipients, published revisions, and CRM stages). PostgreSQL
      // may visit the parent cascades in any order, so a populated disposable branch is cleared
      // with one database-native truncate cascade after the exact single-organization guard.
      // Canonical people, aliases, identities, and external Auth accounts are not descendants of
      // organizations and remain intact for persona synchronization.
      await transaction.execute(sql`truncate table organizations cascade`);
      return { removed: true, eventIds: runEvents.map((event) => event.id) };
    }

    for (const event of runEvents) {
      // Run-scoped databases cannot truncate neighboring runs. Remove the known restrictive
      // placement edge explicitly before deleting this run's event.
      await transaction.execute(sql`
        update communication_recipients
        set calendar_artifact_id = null
        where calendar_artifact_id in (
          select id from calendar_artifacts where event_id = ${event.id}
        )
      `);
      await transaction.execute(sql`
        delete from placements
        where revision_id in (
          select id from schedule_revisions where event_id = ${event.id}
        )
           or room_id in (
             select id from event_rooms where event_id = ${event.id}
           )
      `);
      await transaction.delete(eventMemberships).where(eq(eventMemberships.eventId, event.id));
      await transaction.delete(evidenceRecords).where(eq(evidenceRecords.eventId, event.id));
      await transaction.delete(events).where(and(
        eq(events.id, event.id),
        eq(events.organizationId, organization.id),
      ));
    }

    await transaction.delete(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, organization.id));
    await transaction.delete(providerConfigurations)
      .where(eq(providerConfigurations.organizationId, organization.id));
    await transaction.delete(organizations).where(and(
      eq(organizations.id, organization.id),
      eq(organizations.slug, configuration.organizationSlug),
    ));
    return { removed: true, eventIds: runEvents.map((event) => event.id) };
  });

  console.info(JSON.stringify({
    runId: configuration.runId,
    databaseScope: configuration.databaseScope,
    organizationId: configuration.organizationId,
    removed: result.removed,
    removedEventIds: result.eventIds,
    preservedCanonicalPeopleAndAuth: true,
  }));
} finally {
  await close();
}
