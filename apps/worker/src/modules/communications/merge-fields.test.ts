import { describe, expect, it } from "vitest";
import { findMergeFields, MergeFieldError, renderMergeFields } from "./merge-fields";

describe("communications merge fields", () => {
  it("renders a durable recipient-specific snapshot and inventories fields", () => {
    const subject = "Welcome, {{ first_name }}";
    const body = "{{recipient_name}} is joining {{ event_name }}.";
    expect(findMergeFields(subject, body)).toEqual(["event_name", "first_name", "recipient_name"]);
    expect(renderMergeFields(body, { recipient_name: "Priya Raman", event_name: "DevFlow Conf 2027" }))
      .toBe("Priya Raman is joining DevFlow Conf 2027.");
  });

  it("refuses to imply personalization when a recipient value is missing", () => {
    expect(() => renderMergeFields("Hello {{first_name}}", {})).toThrow(MergeFieldError);
  });
});
