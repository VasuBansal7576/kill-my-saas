import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AccessibleDialog } from "./app/AccessibleDialog";
import { RolePage } from "./App";

describe("release accessibility hardening", () => {
  it("renders shared modal semantics and an explicit initial-focus target", () => {
    const markup = renderToStaticMarkup(
      <AccessibleDialog
        close={() => undefined}
        label="Session details: Reliable systems"
        backdropClassName="backdrop"
        dialogClassName="dialog"
      >
        <button data-dialog-initial-focus>Close</button>
        <a href="/sessions">Back to sessions</a>
      </AccessibleDialog>,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Session details: Reliable systems"');
    expect(markup).toContain("data-dialog-initial-focus");
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('class="accessible-dialog-backdrop backdrop"');
    const dialogSource = readFileSync(new URL("./app/AccessibleDialog.tsx", import.meta.url), "utf8");
    expect(dialogSource).toContain('document.addEventListener("keydown", closeOnEscape, true)');
    expect(dialogSource).toContain("useLayoutEffect");
    expect(dialogSource).toContain(".filter((candidate) => candidate !== dialog)");
    const publicProgram = readFileSync(new URL("./features/public-program/PublicProgramPage.tsx", import.meta.url), "utf8");
    expect(publicProgram).toContain("<button autoFocus className=\"modal-close\"");
    expect(markup).toContain('class="accessible-dialog-surface dialog"');
  });

  it("keeps shared keyboard focus, validation, tap-target, and reduced-motion rules", () => {
    const globalCss = readFileSync(new URL("./styles/global.css", import.meta.url), "utf8");
    const onboarding = readFileSync(new URL("./app/WorkspaceOnboardingPage.tsx", import.meta.url), "utf8");
    const eventSettings = readFileSync(new URL("./features/event-configuration/EventSettingsPage.tsx", import.meta.url), "utf8");
    expect(globalCss).toContain('--control-height: 44px');
    expect(globalCss).toContain('[aria-invalid="true"]');
    expect(globalCss).toContain(":focus-visible");
    expect(globalCss).toContain("prefers-reduced-motion: reduce");
    expect(globalCss).toContain(".accessible-dialog-surface");
    expect(onboarding).toContain("validationAttributes(Boolean(errors.endsOn)");
    expect(eventSettings).toContain("validationAttributes(Boolean(errors.formats)");
  });

  it("keeps all speaker portal destinations in persistent role navigation", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/speaker/events/devflow/sessions"]}>
        <RolePage label="Speaker sessions"><section>Sessions</section></RolePage>
      </MemoryRouter>,
    );
    expect(markup).toContain('aria-label="Speaker portal"');
    for (const destination of ["Overview", "Proposals", "Decisions", "Sessions", "Tasks", "Files", "Profile", "Resources"]) {
      expect(markup).toContain(`>${destination}</a>`);
    }
    expect(markup).toContain('id="main-content"');
  });

  it("exposes connected evaluation tabs and preserves mobile CFP reordering", () => {
    const reviews = readFileSync(new URL("./features/reviews-decisions/ReviewsDecisionsPage.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("./features/forms-submissions/CfpBuilderPage.tsx", import.meta.url), "utf8");
    const cfpCss = readFileSync(new URL("./features/forms-submissions/forms-submissions.css", import.meta.url), "utf8");

    expect(reviews).toContain('role="tab"');
    expect(reviews).toContain('role="tabpanel"');
    expect(reviews).toContain("aria-selected={tab === value}");
    expect(reviews).toContain("ArrowRight");
    expect(builder).toContain("Move ${field.label} up");
    expect(builder).toContain("Move ${field.label} down");
    expect(builder).toContain("${field.label} routing rules");
    expect(cfpCss).toContain(".cfp-field-order { display: grid; grid-row: 1; }");
    expect(cfpCss).not.toMatch(/@media \(max-width: 640px\)[\s\S]*?\.cfp-field-order\s*\{\s*display:\s*none/);
  });

  it("gives each upload workflow a purpose-specific accessible name", () => {
    const portal = readFileSync(new URL("./features/speaker-operations/SpeakerPortalPage.tsx", import.meta.url), "utf8");
    const speakerFiles = readFileSync(new URL("./features/files-deliverables/SpeakerFilesPage.tsx", import.meta.url), "utf8");
    const organizerFiles = readFileSync(new URL("./features/files-deliverables/OrganizerFilesPage.tsx", import.meta.url), "utf8");
    expect(portal).toContain("Upload a profile headshot for");
    expect(speakerFiles).toContain("Upload a file for ${row.taskTitle}");
    expect(organizerFiles).toContain("Upload a replacement headshot for ${active.speakerName}");
  });

  it("routes organizer workflow dialogs through the focus-safe shared primitive", () => {
    const submissions = readFileSync(new URL("./features/forms-submissions/SubmissionsPage.tsx", import.meta.url), "utf8");
    const reviews = readFileSync(new URL("./features/reviews-decisions/ReviewsDecisionsPage.tsx", import.meta.url), "utf8");
    const crm = readFileSync(new URL("./features/speaker-crm/SpeakerCrmPage.tsx", import.meta.url), "utf8");
    for (const source of [submissions, reviews, crm]) {
      expect(source).toContain("AccessibleDialog");
    }
    expect(submissions.match(/<AccessibleDialog/g)).toHaveLength(3);
    expect(reviews.match(/<AccessibleDialog/g)).toHaveLength(2);
    expect(crm.match(/<AccessibleDialog/g)).toHaveLength(2);
    expect(submissions).not.toContain('role="dialog"');
  });

  it("protects dirty organizer speaker edits and gives criterion removals context", () => {
    const speakers = readFileSync(new URL("./features/speaker-operations/SpeakersPage.tsx", import.meta.url), "utf8");
    const reviews = readFileSync(new URL("./features/reviews-decisions/ReviewsDecisionsPage.tsx", import.meta.url), "utf8");
    expect(speakers).toContain("Discard unsaved profile edits?");
    expect(speakers).toContain("Keep editing");
    expect(speakers).toContain("Discard changes");
    expect(speakers).toContain("setDirty(false)");
    expect(reviews).toContain("Remove ${criterion.label");
    expect(reviews).toContain("from Round ${roundIndex + 1}");
    expect(reviews).toContain("nextRemoves[Math.min(criterionIndex");
  });
});
