import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("organizer files interaction semantics", () => {
  const page = readFileSync(new URL("./OrganizerFilesPage.tsx", import.meta.url), "utf8");

  it("keeps bulk selection independent from the row detail button", () => {
    expect(page).toContain('<div className={styles.tableRow} key={row.id}>');
    expect(page).toContain('className={styles.tableRowOpen}');
    expect(page).toContain('aria-label={`Open ${row.taskTitle} for ${row.speakerName}`}');
    expect(page).not.toContain('<button\n                  className={styles.tableRow}');
  });

  it("requires feedback or an explicit no-note confirmation and previews speaker copy", () => {
    expect(page).toContain("Actionable feedback");
    expect(page).toContain("Speaker preview");
    expect(page).toContain("Request a new version without adding actionable feedback");
    expect(page).toContain('disabled={!changeRequestReason.trim() && !confirmWithoutNote}');
    expect(page).toContain('initialFocus="[data-change-feedback]"');
  });

  it("renders the persisted change-request reason in the speaker workspace", () => {
    const speakerPage = readFileSync(new URL("./SpeakerFilesPage.tsx", import.meta.url), "utf8");
    expect(speakerPage).toContain('row.status === "changes_requested"');
    expect(speakerPage).toContain("row.changeRequest?.reason");
    expect(speakerPage).toContain("Organizer requested a new version");
  });
});
