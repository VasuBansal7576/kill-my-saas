import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ensurePrimaryParticipant,
  participantLimitGuidance,
  participantValidationMessage,
  removeAdditionalParticipant,
} from "./presentation";

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
});
