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
