import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pause public access confirmation", () => {
  it("opens a focus-managed confirmation before invoking the persisted pause", () => {
    const page = readFileSync(new URL("./PublishProgramPage.tsx", import.meta.url), "utf8");
    const trigger = page.indexOf("onClick={() => setPauseConfirmationOpen(true)}");
    const dialog = page.indexOf("pauseConfirmationOpen ? <AccessibleDialog");

    expect(trigger).toBeGreaterThan(-1);
    expect(dialog).toBeGreaterThan(trigger);
    expect(page).toContain('initialFocus="[data-pause-cancel]"');
    expect(page).toContain("Cancel — keep live");
    expect(page).toContain("All five public views, saved share links, and website embeds");
    expect(page).toContain("Public update {workspace.publication?.publicRevision ?? 0}");
    expect(page).toContain("schedule version {selectedRevision?.version ?? \"none\"}");
  });

  it("keeps the pause API call inside the confirm action only", () => {
    const page = readFileSync(new URL("./PublishProgramPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('onClick={() => { void pause(); }}');
    expect(page).not.toContain('onClick={() => { void pause(); }}>Pause public access</button>');
  });
});
