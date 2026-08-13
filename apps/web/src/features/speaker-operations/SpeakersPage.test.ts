import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeakerDetailPanel } from "./SpeakersPage";
import type { SpeakerDetail } from "./types";

describe("organizer speaker detail", () => {
  it("makes canonical headshot replacement directly reachable from the profile", () => {
    const markup = renderToStaticMarkup(createElement(SpeakerDetailPanel, { eventSlug: "devflow", speaker, onClose: () => undefined, onSaved: () => undefined }));
    expect(markup).toContain("Replace headshot");
    expect(markup).toContain("image/png,image/jpeg,image/webp");
    expect(markup).toContain("Profile headshot");
  });
});

const speaker: SpeakerDetail = {
  eventSpeakerId: "speaker-1", personId: "person-1", displayName: "Priya Raman", email: "priya@example.com", status: "onboarding",
  biography: "Biography", company: "Northstar", jobTitle: "Principal Engineer", headshotFileId: null, socialLinks: {}, logistics: {},
  taskProgress: { complete: 0, total: 0, overdue: 0 }, sessionCount: 0, tasks: [], assignedSessions: [],
};
