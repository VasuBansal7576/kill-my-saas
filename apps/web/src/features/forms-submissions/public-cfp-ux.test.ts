import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answersWithCanonicalTitle,
  canonicalTitleField,
  cfpAvailabilityLabel,
  ensurePrimaryParticipant,
  participantLimitGuidance,
  participantValidationMessage,
  removeAdditionalParticipant,
} from "./presentation";
import type { FormField } from "./model";

describe("public CFP participant experience", () => {
  it("always creates and preserves the primary participant", () => {
    expect(ensurePrimaryParticipant([])).toEqual([{ name: "", email: "", role: "author" }]);

    const participants = [
      { name: "Priya", email: "priya@example.com", role: "author" as const },
      { name: "Morgan", email: "morgan@example.com", role: "co_author" as const },
    ];
    expect(removeAdditionalParticipant(participants, 0)).toEqual(participants);
    expect(removeAdditionalParticipant(participants, 1)).toEqual([participants[0]]);
  });

  it("explains limits and submission corrections in participant language", () => {
    expect(participantLimitGuidance(1, 4)).toBe("Add 1 to 4 participants. The primary participant is required and cannot be removed.");
    expect(participantValidationMessage([{ name: "", email: "", role: "author" }], 1, 4)).toBe(
      "Add the primary participant’s name and email before submitting.",
    );
    expect(participantValidationMessage([
      { name: "Priya", email: "same@example.com", role: "author" },
      { name: "Morgan", email: "same@example.com", role: "co_author" },
    ], 1, 4)).toBe("Use a different email address for each participant.");
  });

  it("uses explicit removal text, field error relationships, and busy feedback", () => {
    const page = readFileSync(new URL("./PublicCfpPage.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("./CfpBuilderPage.tsx", import.meta.url), "utf8");

    expect(page).toContain(">Remove participant</button>");
    expect(page).not.toMatch(/>\s*[×✕]\s*<\/button>/);
    expect(builder).toContain("Remove question");
    expect(builder).not.toMatch(/>\s*[×✕]\s*<\/button>/);
    expect(page).toContain('aria-describedby={`participant-guidance${fieldErrors.participants ? " participant-error" : ""}`}');
    expect(page).toContain('aria-busy={state === "saving"}');
    expect(page).toContain("Submitting proposal…");
  });

  it("uses a configured session title as the one visible canonical title", () => {
    const fields = [
      { key: "session_title", label: "Session title", type: "short_text", required: true, sortOrder: 0, settings: {}, condition: null },
      { key: "abstract", label: "Abstract", type: "long_text", required: true, sortOrder: 1, settings: {}, condition: null },
    ] satisfies FormField[];
    const titleField = canonicalTitleField(fields);
    expect(titleField?.key).toBe("session_title");
    expect(answersWithCanonicalTitle({ abstract: "Details" }, titleField, "Canonical talk")).toEqual({
      abstract: "Details",
      session_title: "Canonical talk",
    });
  });

  it("states when an open CFP has no deadline", () => {
    expect(cfpAvailabilityLabel("open", null, null, "America/Los_Angeles", () => "unused")).toBe("Open-ended / no deadline set");
    expect(cfpAvailabilityLabel("open", null, "2027-01-30T20:00:00Z", "America/Los_Angeles", () => "Jan 30, noon PST")).toBe("Open until Jan 30, noon PST");
  });

  it("keeps the builder scannable and explains destructive and disabled actions", () => {
    const page = readFileSync(new URL("./PublicCfpPage.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("./CfpBuilderPage.tsx", import.meta.url), "utf8");

    expect(builder).toContain("Question label");
    expect(builder).toContain("Answer type");
    expect(builder).toContain("Advanced · display and reviewer routing");
    expect(builder).toContain("Internal question ID");
    expect(builder).toContain("Only show this question when");
    expect(builder).toContain("Send answers to reviewer groups");
    expect(builder).toContain("Confirm question removal");
    expect(builder).toContain("Other questions depend on its answer.");
    expect(builder).toContain("aria-label={`Remove question ${field.label}`}");
    expect(page).toContain('aria-describedby={draftDisabledReason ? "save-draft-reason" : undefined}');
    expect(page).toContain("Enter at least 3 characters in Proposal title to save a draft.");
  });
});
