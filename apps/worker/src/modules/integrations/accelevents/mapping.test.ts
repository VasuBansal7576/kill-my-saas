import { describe, expect, it } from "vitest";
import { defaultAcceleventsMappings, mapCanonicalRecord } from "./mapping";
import type {
  AcceleventsConfiguration,
  AcceleventsRecordLink,
  CanonicalAcceleventsSession,
  CanonicalAcceleventsSpeaker,
} from "./types";

const ids = {
  organization: crypto.randomUUID(),
  event: crypto.randomUUID(),
  speaker: crypto.randomUUID(),
  session: crypto.randomUUID(),
  track: crypto.randomUUID(),
  format: crypto.randomUUID(),
  room: crypto.randomUUID(),
};

describe("canonical Accelevents mapping", () => {
  it("maps an approved scheduled session through explicit references and linked speakers", async () => {
    const links = new Map<string, AcceleventsRecordLink>([[`speaker:${ids.speaker}`, {
      entityType: "speaker",
      canonicalId: ids.speaker,
      externalId: "4516",
      canonicalFingerprint: "speaker-fingerprint",
    }]]);
    const mapped = await mapCanonicalRecord(session(), configuration(), links, "America/Los_Angeles");

    expect(mapped.errors).toEqual([]);
    expect(mapped.operation).toBe("create");
    expect(mapped.payload).toMatchObject({
      title: "Stateful systems",
      description: "Durable handoffs without re-entry.",
      startTime: "2027/05/12 10:00",
      endTime: "2027/05/12 10:45",
      location: "Main Stage",
      format: "MAIN_STAGE",
      tracks: [812],
      speakerList: [{ speakerId: 4516 }],
      status: "VISIBLE",
      sessionVisibilityType: "PUBLIC",
    });
  });

  it("reports missing track/format/speaker references instead of producing a fake-ready session", async () => {
    const mapped = await mapCanonicalRecord(session(), { ...configuration(), referenceMappings: [] }, new Map(), "UTC");

    expect(mapped.operation).toBe("validate");
    expect(mapped.errors.map((error) => error.code)).toEqual([
      "required_mapping_value_missing",
      "required_mapping_value_missing",
      "required_mapping_value_missing",
    ]);
    expect(mapped.payload).not.toHaveProperty("tracks");
    expect(mapped.payload).not.toHaveProperty("speakerList");
  });

  it("uses a stable payload fingerprint to skip an unchanged linked speaker", async () => {
    const config = configuration();
    const record = speaker();
    const first = await mapCanonicalRecord(record, config, new Map(), "UTC");
    const links = new Map<string, AcceleventsRecordLink>([[`speaker:${ids.speaker}`, {
      entityType: "speaker",
      canonicalId: ids.speaker,
      externalId: "4516",
      canonicalFingerprint: first.fingerprint,
    }]]);

    const second = await mapCanonicalRecord(record, config, links, "UTC");

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.operation).toBe("skip");
    expect(second.externalId).toBe("4516");
  });
});

function configuration(): AcceleventsConfiguration {
  return {
    id: crypto.randomUUID(),
    organizationId: ids.organization,
    eventId: ids.event,
    externalEventUrl: "devflow-conf-2027",
    apiBaseUrl: "https://api.accelevents.com",
    credentialBinding: "ACCELEVENTS_API_TOKEN",
    authorizationHeader: "Authorization",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    mappings: defaultAcceleventsMappings.map((mapping) => ({ ...mapping })),
    referenceMappings: [
      { referenceType: "track", canonicalId: ids.track, canonicalLabel: "Platform", externalValue: "812" },
      { referenceType: "format", canonicalId: ids.format, canonicalLabel: "Talk", externalValue: "MAIN_STAGE" },
    ],
  };
}

function speaker(): CanonicalAcceleventsSpeaker {
  return {
    entityType: "speaker",
    canonicalId: ids.speaker,
    displayName: "Priya Raman",
    email: "priya@example.com",
    biography: "Staff engineer and systems speaker.",
    company: "Northstar",
    jobTitle: "Staff Engineer",
    updatedAt: new Date("2027-05-01T10:00:00Z"),
  };
}

function session(): CanonicalAcceleventsSession {
  return {
    entityType: "session",
    canonicalId: ids.session,
    title: "Stateful systems",
    abstract: "Durable handoffs without re-entry.",
    track: { id: ids.track, name: "Platform" },
    format: { id: ids.format, name: "Talk" },
    placement: {
      startsAt: new Date("2027-05-12T17:00:00Z"),
      endsAt: new Date("2027-05-12T17:45:00Z"),
      room: { id: ids.room, name: "Main Stage" },
    },
    speakerIds: [ids.speaker],
    updatedAt: new Date("2027-05-02T10:00:00Z"),
  };
}
