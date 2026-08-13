import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CommunicationsPage } from "./CommunicationsPage";

describe("communications route shell", () => {
  it("renders the summary shell and independent loading states before any history response", () => {
    const route = createElement(Route, {
      path: "/organizer/events/:eventSlug/communications",
      element: createElement(CommunicationsPage),
    });
    const markup = renderToStaticMarkup(createElement(
      MemoryRouter,
      { initialEntries: ["/organizer/events/devflow-conf-2027/communications"] },
      createElement(Routes, null, route),
    ));

    expect(markup).toContain("<h1>Communications</h1>");
    expect(markup).toContain("Truthful delivery tracking");
    expect(markup).toContain("Loading communication tools");
    expect(markup).toContain("Loading the first bounded history page");
    expect(markup).not.toContain("No communications have been queued");
  });
});
