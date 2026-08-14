import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NotFoundPage, RolePage } from "./App";

describe("application shell semantics", () => {
  it("renders a real 404 with dashboard and public-home recovery paths", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter><NotFoundPage dashboardPath="/organizer/events/devflow/dashboard" /></MemoryRouter>,
    );
    expect(markup).toContain("404 · Page not found");
    expect(markup).toContain('href="/organizer/events/devflow/dashboard"');
    expect(markup).toContain('href="/"');
    expect(markup).not.toContain("Workspace setup");
    const publicMarkup = renderToStaticMarkup(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    expect(publicMarkup).toContain("<main");
  });

  it("keeps role content inside the main landmark below one banner", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter><RolePage label="Reviewer workspace"><section><h1>Assignments</h1></section></RolePage></MemoryRouter>,
    );
    expect(markup.match(/<header/g)).toHaveLength(1);
    expect(markup.match(/<main/g)).toHaveLength(1);
    expect(markup.indexOf("<header")).toBeLessThan(markup.indexOf("<main"));
  });
});
