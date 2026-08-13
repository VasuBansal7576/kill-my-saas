import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hiddenSessionFileCount, speakerPortalHeading, speakerPortalSection } from "./presentation";
import { speakerFileWorkspaceState } from "../files-deliverables/presentation";
import { speakerSubmissionWorkspace, submissionsForWorkspace } from "../forms-submissions/presentation";
import type { SubmissionRecord } from "../forms-submissions/model";

describe("speaker portal route presentation", () => {
  it.each([
    ["/speaker/events/devflow-conf-2027", "overview", "Welcome, Priya"],
    ["/speaker/events/devflow-conf-2027/sessions", "sessions", "Your sessions"],
    ["/speaker/events/devflow-conf-2027/tasks", "tasks", "Your tasks"],
    ["/speaker/events/devflow-conf-2027/profile", "profile", "Your speaker profile"],
    ["/speaker/events/devflow-conf-2027/resources", "resources", "Speaker resources"],
  ] as const)("gives %s a distinct workspace heading", (path, section, title) => {
    expect(speakerPortalSection(path)).toBe(section);
    expect(speakerPortalHeading(section, "Priya").title).toBe(title);
  });

  it("flags files tied to a session missing from the released speaker projection", () => {
    expect(hiddenSessionFileCount([], [{ sessionId: "session-1" }, { sessionId: "session-1" }, { sessionId: null }])).toBe(1);
    expect(hiddenSessionFileCount([{ id: "session-1" }], [{ sessionId: "session-1" }])).toBe(0);
  });

  it("distinguishes an incomplete file handoff from a legitimate empty workspace", () => {
    expect(speakerFileWorkspaceState(0, 2)).toBe("handoff_pending");
    expect(speakerFileWorkspaceState(0, 0)).toBe("empty");
    expect(speakerFileWorkspaceState(1, 2)).toBe("ready");
  });

  it("does not let optional cross-workspace projection checks block primary content", () => {
    const portalPage = readFileSync(new URL("./SpeakerPortalPage.tsx", import.meta.url), "utf8");
    const filesPage = readFileSync(new URL("../files-deliverables/SpeakerFilesPage.tsx", import.meta.url), "utf8");
    expect(portalPage).not.toContain("Promise.allSettled");
    expect(filesPage).not.toContain("Promise.allSettled");
    expect(portalPage).toContain("void filesRequest.then");
    expect(filesPage).toContain("void portalRequest.then");
  });
});

describe("speaker proposal and decision workspaces", () => {
  const pending = { decision: null } as SubmissionRecord;
  const accepted = { decision: "accepted" } as SubmissionRecord;

  it("uses decision-specific copy and only released decisions on the decisions route", () => {
    const workspace = speakerSubmissionWorkspace("/speaker/events/devflow-conf-2027/decisions");
    expect(workspace.title).toBe("Your decisions");
    expect(submissionsForWorkspace([pending, accepted], workspace.decisions)).toEqual([accepted]);
  });

  it("keeps proposals authoring-focused", () => {
    const workspace = speakerSubmissionWorkspace("/speaker/events/devflow-conf-2027/proposals");
    expect(workspace.title).toBe("Your proposals");
    expect(submissionsForWorkspace([pending, accepted], workspace.decisions)).toEqual([pending, accepted]);
  });
});
