import { describe, expect, it } from "vitest";
import { friendlyValidationFields } from "./validation-copy";

describe("forms validation copy", () => {
  it("replaces Zod schema diagnostics with participant-facing submission guidance", () => {
    const fields = friendlyValidationFields("invalid_submission", {
      title: ["Too small: expected string to have >=3 characters"],
      participants: ["Invalid input: expected array, received undefined"],
    });

    expect(fields).toEqual({
      title: ["Enter a proposal title between 3 and 180 characters."],
      participants: ["Add each participant’s name, a valid email address, and a role."],
    });
    expect(JSON.stringify(fields)).not.toMatch(/expected|received|Too small/i);
  });

  it("preserves intentional domain guidance", () => {
    expect(friendlyValidationFields("invalid_submission", {
      participants: ["Add at least 2 participants before submitting."],
    })).toEqual({ participants: ["Add at least 2 participants before submitting."] });
  });
});
