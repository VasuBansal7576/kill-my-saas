import type { Database } from "@programflow/database";
import { eventMemberships, eventSpeakers, events, organizations, people, personEmailAliases, speakerProfiles } from "@programflow/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolingDatabase } from "../../../../../packages/database/src/tooling-client";
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
} from "../../../../../packages/database/src/schema/speaker-crm";
import type { Actor } from "../identity-access/actor";
import {
  createCrmOutreachHandoff,
  getCrmContact,
  getCrmMetrics,
  getCrmPipeline,
  importCrmContacts,
  listCrmDirectory,
  listDuplicateCandidates,
  mergeCrmContacts,
  moveCrmPipelineContact,
  openCrmSegment,
  pushCrmContactToEvent,
  saveCrmSegment,
  enrollCrmContact,
} from "./service";

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("organization Speaker CRM persisted round trip", () => {
  const ids = { organization: crypto.randomUUID(), event: crypto.randomUUID(), organizer: crypto.randomUUID() };
  const tooling = createToolingDatabase(databaseUrl!);
  const database = tooling.database as unknown as Database;
  const actor: Actor = { identityId: `crm-${ids.organizer}`, personId: ids.organizer, organizationRoles: [{ organizationId: ids.organization, role: "organizer" }], eventRoles: [] };

  beforeAll(async () => {
    await tooling.database.insert(organizations).values({ id: ids.organization, slug: `crm-${ids.organization}`, name: "CRM Test" });
    await tooling.database.insert(events).values({ id: ids.event, organizationId: ids.organization, slug: `crm-event-${ids.event}`, name: "CRM Event", startsOn: "2027-05-12", endsOn: "2027-05-14", timezone: "America/Los_Angeles", location: "San Francisco" });
    await tooling.database.insert(people).values({ id: ids.organizer, stableKey: `crm-organizer-${ids.organizer}`, displayName: "CRM Organizer" });
  });

  afterAll(async () => {
    const contacts = await tooling.database.select({ id: crmContacts.id, personId: crmContacts.personId }).from(crmContacts).where(eq(crmContacts.organizationId, ids.organization));
    const contactIds = contacts.map((contact) => contact.id);
    const pipelines = await tooling.database.select({ id: crmPipelines.id }).from(crmPipelines).where(eq(crmPipelines.organizationId, ids.organization));
    const pipelineIds = pipelines.map((pipeline) => pipeline.id);
    const enrollments = pipelineIds.length ? await tooling.database.select({ id: crmPipelineEnrollments.id }).from(crmPipelineEnrollments).where(inArray(crmPipelineEnrollments.pipelineId, pipelineIds)) : [];
    if (enrollments.length) await tooling.database.delete(crmPipelineStageTransitions).where(inArray(crmPipelineStageTransitions.enrollmentId, enrollments.map((row) => row.id)));
    if (pipelineIds.length) await tooling.database.delete(crmPipelineEnrollments).where(inArray(crmPipelineEnrollments.pipelineId, pipelineIds));
    if (pipelineIds.length) await tooling.database.delete(crmPipelineStages).where(inArray(crmPipelineStages.pipelineId, pipelineIds));
    await tooling.database.delete(crmPipelines).where(eq(crmPipelines.organizationId, ids.organization));
    await tooling.database.delete(crmOutreachRequests).where(eq(crmOutreachRequests.organizationId, ids.organization));
    await tooling.database.delete(crmEventSpeakerHandoffs).where(eq(crmEventSpeakerHandoffs.organizationId, ids.organization));
    await tooling.database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event));
    await tooling.database.delete(eventSpeakers).where(eq(eventSpeakers.eventId, ids.event));
    await tooling.database.delete(crmSavedSegments).where(eq(crmSavedSegments.organizationId, ids.organization));
    await tooling.database.delete(crmContactMerges).where(eq(crmContactMerges.organizationId, ids.organization));
    if (contactIds.length) await tooling.database.delete(crmContactNotes).where(inArray(crmContactNotes.contactId, contactIds));
    await tooling.database.delete(crmContacts).where(eq(crmContacts.organizationId, ids.organization));
    const personIds = contacts.map((contact) => contact.personId);
    if (personIds.length) {
      await tooling.database.delete(speakerProfiles).where(inArray(speakerProfiles.personId, personIds));
      await tooling.database.delete(personEmailAliases).where(inArray(personEmailAliases.personId, personIds));
      await tooling.database.delete(people).where(inArray(people.id, personIds));
    }
    await tooling.database.delete(events).where(eq(events.id, ids.event));
    await tooling.database.delete(people).where(eq(people.id, ids.organizer));
    await tooling.database.delete(organizations).where(eq(organizations.id, ids.organization));
    await tooling.close();
  });

  it("covers CRM-01–12 transitions and both frozen handoff boundaries", async () => {
    const result = await importCrmContacts(database, actor, ids.organization, [
      "name,email,company,job title,tags,notes,custom.Topic",
      "Priya Raman,priya.one@example.com,Northstar,Staff Engineer,AI|Platform,Met at DevFlow,Agents",
      "Priya Raman,priya.two@example.com,Latticework,Principal Engineer,AI,Duplicate candidate,Infra",
      "Mina Patel,mina@example.com,Basis,Research Lead,Evaluation,High priority,Evals",
    ].join("\n"));
    expect(result.imported).toBe(3);
    const filtered = await listCrmDirectory(database, actor, ids.organization, { search: "Priya", companies: [], jobTitles: ["Staff Engineer"], tags: ["AI"], metadata: {}, company: undefined, jobTitle: undefined, tag: undefined });
    expect(filtered).toHaveLength(1);
    const duplicates = await listDuplicateCandidates(database, actor, ids.organization);
    expect(duplicates[0]?.contacts).toHaveLength(2);
    const primaryContactId = duplicates[0]!.contacts[0]!.contactId;
    const duplicateContactId = duplicates[0]!.contacts[1]!.contactId;
    const merged = await mergeCrmContacts(database, actor, ids.organization, { primaryContactId, duplicateContactId, reason: "Confirmed same person" });
    expect(merged.mergedSources).toHaveLength(1);
    expect(merged.aliases).toEqual(expect.arrayContaining(["priya.one@example.com", "priya.two@example.com"]));

    await saveCrmSegment(database, actor, ids.organization, { name: "AI speakers", filters: { search: "", companies: [], jobTitles: [], tags: ["AI"], metadata: {}, company: undefined, jobTitle: undefined, tag: undefined } });
    const segments = await tooling.database.select({ id: crmSavedSegments.id }).from(crmSavedSegments).where(eq(crmSavedSegments.organizationId, ids.organization));
    expect((await openCrmSegment(database, actor, ids.organization, segments[0]!.id)).members).toHaveLength(1);
    await enrollCrmContact(database, actor, ids.organization, primaryContactId);
    const board = await getCrmPipeline(database, actor, ids.organization);
    const wonStage = board.stages.find((stage) => stage.outcome === "won")!;
    await moveCrmPipelineContact(database, actor, ids.organization, primaryContactId, wonStage.id, "Confirmed for DevFlow");
    expect((await getCrmContact(database, actor, ids.organization, primaryContactId)).stageHistory[0]).toMatchObject({ toStage: "Confirmed", note: "Confirmed for DevFlow" });

    const command = { organizationId: ids.organization, contactId: primaryContactId, eventId: ids.event, idempotencyKey: `crm-event:${crypto.randomUUID()}` };
    const handoff = await pushCrmContactToEvent(database, actor, command);
    expect((await pushCrmContactToEvent(database, actor, command))).toMatchObject({ eventSpeakerId: handoff.eventSpeakerId, idempotent: true });
    expect((await getCrmContact(database, actor, ids.organization, primaryContactId)).eventHistory[0]?.eventName).toBe("CRM Event");

    const outreach = await createCrmOutreachHandoff(database, actor, ids.organization, {
      name: "Invite AI speakers", contactIds: [primaryContactId], subjectTemplate: "Hello {{recipient_name}}", htmlTemplate: "<p>Invitation</p>", textTemplate: "Invitation", idempotencyKey: `crm-outreach:${crypto.randomUUID()}`,
    });
    expect(outreach.recipientPersonIds).toEqual([handoff.personId]);
    expect((await getCrmMetrics(database, actor, ids.organization))).toMatchObject({ totalContacts: 2, representedEvents: 1, pipelineWon: 1, pendingOutreachHandoffs: 1 });
  });
});
