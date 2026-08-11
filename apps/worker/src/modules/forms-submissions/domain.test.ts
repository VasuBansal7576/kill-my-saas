import type { PublishedFormDefinition } from "@programflow/database";
import { describe, expect, it } from "vitest";
import {
  deriveRoutingKey,
  FormConfigurationInputSchema,
  formAvailability,
  isFieldVisible,
  validateSubmission,
  type SubmissionInput,
} from "./domain";

const definition: PublishedFormDefinition = {
  target: "abstract",
  opensAt: "2027-01-01T00:00:00.000Z",
  closesAt: "2027-02-01T00:00:00.000Z",
  welcomeCopy: "Share your work.",
  instructionsCopy: "Be specific.",
  successCopy: "We received your proposal.",
  allowDrafts: true,
  allowMultipleDrafts: true,
  draftsCountTowardLimit: false,
  allowSubmittedEdits: true,
  confirmationEmailEnabled: true,
  draftReminderEnabled: true,
  draftReminderLeadHours: 48,
  maxSubmissionsPerPerson: 3,
  minimumParticipants: 1,
  maximumParticipants: 4,
  participantRoleLabels: { author: "Lead", co_author: "Co-author", presenter: "Presenter" },
  fields: [
    { key: "abstract", label: "Abstract", type: "long_text", required: true, sortOrder: 0, settings: {}, condition: null },
    {
      key: "track",
      label: "Track",
      type: "select",
      required: true,
      sortOrder: 1,
      settings: { catalog: "track", routeByValue: { Platform: "platform-reviewers" } },
      condition: null,
    },
    { key: "format", label: "Format", type: "select", required: true, sortOrder: 2, settings: { catalog: "format" }, condition: null },
    {
      key: "workshop_requirements",
      label: "Workshop requirements",
      type: "long_text",
      required: true,
      sortOrder: 3,
      settings: {},
      condition: { fieldKey: "format", operator: "equals", value: "Workshop" },
    },
  ],
};

const complete: SubmissionInput = {
  title: "Reliable agent systems",
  answers: { abstract: "A concrete reliability playbook.", track: "Platform", format: "Talk" },
  participants: [{ name: "Priya Raman", email: "PRIYA@example.com", role: "author" }],
  saveAsDraft: false,
};

describe("CFP form and submission rules", () => {
  it("rejects invalid form ordering dependencies and participant bounds", () => {
    const parsed = FormConfigurationInputSchema.safeParse({
      name: "Call for speakers",
      target: "abstract",
      opensAt: "2027-02-01T00:00:00.000Z",
      closesAt: "2027-01-01T00:00:00.000Z",
      minimumParticipants: 3,
      maximumParticipants: 2,
      participantRoleLabels: definition.participantRoleLabels,
      maxSubmissionsPerPerson: null,
      fields: [
        { key: "topic", label: "Topic", type: "select", settings: { options: [] }, condition: { fieldKey: "missing", operator: "equals", value: "AI" } },
      ],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message);
      expect(messages).toContain("The close time must be after the open time.");
      expect(messages).toContain("Maximum participants must be at least the minimum.");
      expect(messages).toContain("Select fields need at least one option or an event catalog.");
      expect(messages).toContain("Conditions must reference another field in this form.");
    }
  });

  it("enforces the server-side window including the exact close instant", () => {
    expect(formAvailability("published", definition, new Date("2026-12-31T23:59:59.000Z"))).toBe("upcoming");
    expect(formAvailability("published", definition, new Date("2027-01-01T00:00:00.000Z"))).toBe("open");
    expect(formAvailability("published", definition, new Date("2027-02-01T00:00:00.000Z"))).toBe("closed");
    expect(formAvailability("closed", definition, new Date("2027-01-15T00:00:00.000Z"))).toBe("closed");
  });

  it("requires only visible fields and validates event catalog selections", () => {
    const catalogs = { tracks: new Set(["Platform", "AI"]), formats: new Set(["Talk", "Workshop"]) };
    expect(validateSubmission(definition, complete, catalogs)).toEqual([]);

    const workshop = { ...complete, answers: { ...complete.answers, format: "Workshop" } };
    expect(validateSubmission(definition, workshop, catalogs)).toContainEqual({
      field: "workshop_requirements",
      message: "Workshop requirements is required.",
    });
    expect(validateSubmission(definition, { ...complete, answers: { ...complete.answers, track: "Unknown" } }, catalogs)).toContainEqual({
      field: "track",
      message: "Choose a valid Track option.",
    });
  });

  it("allows an incomplete draft but rejects unknown answers", () => {
    const draft: SubmissionInput = { ...complete, saveAsDraft: true, answers: { unexpected: "value" } };
    expect(validateSubmission(definition, draft, { tracks: new Set(), formats: new Set() })).toEqual([
      { field: "unexpected", message: "This answer is not part of the published form." },
    ]);
  });

  it("persists conditional routing semantics independently of the UI", () => {
    const workshopField = definition.fields[3]!;
    expect(isFieldVisible(workshopField, complete.answers)).toBe(false);
    expect(isFieldVisible(workshopField, { ...complete.answers, format: "Workshop" })).toBe(true);
    expect(deriveRoutingKey(definition, complete.answers)).toBe("platform-reviewers");
  });

  it("enforces participant bounds, primary role, and unique contact emails", () => {
    const invalid: SubmissionInput = {
      ...complete,
      participants: [
        { name: "Priya", email: "speaker@example.com", role: "presenter" },
        { name: "Pat", email: "SPEAKER@example.com", role: "co_author" },
      ],
    };
    const issues = validateSubmission(definition, invalid, { tracks: new Set(["Platform"]), formats: new Set(["Talk"]) });
    expect(issues).toContainEqual({ field: "participants", message: "At least one participant must be the primary author." });
    expect(issues).toContainEqual({ field: "participants", message: "Participant email speaker@example.com is duplicated." });
  });
});
