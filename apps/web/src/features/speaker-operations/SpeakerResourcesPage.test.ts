import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markdownToSafeHtml } from "./resource-markdown";

describe("portal resource authoring", () => {
  it("renders useful Markdown while escaping organizer-entered HTML", () => {
    const html = markdownToSafeHtml("# Arrival guide\n\n- Bring slides\n- Check in\n\n**Important** <script>alert(1)</script>");
    expect(html).toContain("<h1>Arrival guide</h1>");
    expect(html).toContain("<ul><li>Bring slides</li><li>Check in</li></ul>");
    expect(html).toContain("<strong>Important</strong>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("offers first-resource guidance, explicit HTML, preview, and save/publish states", () => {
    const page = readFileSync(new URL("./SpeakerResourcesPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("Create first resource");
    expect(page).toContain("Simple formatting");
    expect(page).toContain("Advanced HTML");
    expect(page).toContain("existing server sanitizer");
    expect(page).toContain("Live authoring preview");
    expect(page).toContain("Save private draft");
    expect(page).toContain("Publish to speakers");
    expect(page).toContain('sandbox=""');
  });
});
