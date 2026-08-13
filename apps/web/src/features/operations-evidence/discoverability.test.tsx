import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { organizerNavigation } from "../../app/organizer-navigation";
import { EvaluationEntryPage, HelpPage } from "./EvaluationEntryPage";

describe("evaluation route discoverability", () => {
  it("puts public DevFlow routes, private persona paths, and help on the deployed root", () => {
    const markup = renderToStaticMarkup(<MemoryRouter><EvaluationEntryPage /></MemoryRouter>);
    expect(markup).toContain('href="/cfp/devflow-conf-2027"');
    expect(markup).toContain('href="/events/devflow-conf-2027/sessions"');
    expect(markup).toContain('href="/events/devflow-conf-2027/agenda"');
    expect(markup).toContain("From first proposal to the published program. No re-entry.");
    expect(markup).toContain("Public product tour");
    expect(markup).toContain("Provider success is shown only when a real provider returns it.");
    expect(markup).toContain("Privately supplied credentials");
    expect(markup).toContain('href="/help"');
    expect(markup.toLowerCase()).not.toContain("password=");
    expect(markup).not.toContain("Live public program");
    expect(markup).not.toMatch(/100\s*\/\s*100/);
  });

  it("keeps help and the evidence center in conventional organizer navigation", () => {
    const navigation = organizerNavigation("devflow-conf-2027", "organization-programflow");
    expect(navigation).toContainEqual(["Evaluation evidence", "/organizer/events/devflow-conf-2027/evaluation-evidence"]);
    expect(navigation).toContainEqual(["Help", "/help"]);
  });

  it("explains evidence, reload persistence, roles, and controlled reset to nontechnical evaluators", () => {
    const markup = renderToStaticMarkup(<MemoryRouter><HelpPage /></MemoryRouter>);
    expect(markup).toContain("A plain-language guide to ProgramFlow");
    expect(markup).toContain("Reload after changes");
    expect(markup).toContain("Use the Evidence Center");
    expect(markup).toContain("There is no anonymous reset action");
  });
});
