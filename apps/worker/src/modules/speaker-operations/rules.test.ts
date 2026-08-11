import { describe, expect, it } from "vitest";
import { parseSpeakerCsv } from "./csv";
import { sanitizeSpeakerResourceHtml } from "./resource-sanitizer";

describe("speaker CSV import", () => {
  it("parses quoted fixture fields without splitting embedded punctuation", () => {
    const rows = parseSpeakerCsv('name,email,title,company,bio\nPriya Raman,priya@example.com,Principal Engineer,Latticework,"Builds tools; writes \"\"Fast CI\"\"."');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.input).toMatchObject({ displayName: "Priya Raman", email: "priya@example.com", biography: 'Builds tools; writes "Fast CI".' });
  });

  it("rejects incomplete import shapes before persistence", () => {
    expect(() => parseSpeakerCsv("name,email\nPriya Raman,priya@example.com")).toThrow("required title column");
  });
});

describe("speaker resource sanitizer", () => {
  it("keeps allowlisted HTTPS embeds with a restrictive browser policy", () => {
    const sanitized = sanitizeSpeakerResourceHtml(
      '<h2 onclick="steal()">AV scheduler</h2><iframe src="https://scheduler.example.com/book" onload="steal()"></iframe>',
      ["https://scheduler.example.com"],
    );
    expect(sanitized).toContain('<iframe src="https://scheduler.example.com/book" sandbox="allow-forms allow-popups allow-same-origin" referrerpolicy="no-referrer">');
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("onload");
  });

  it("removes scripts and embeds from unapproved or insecure origins", () => {
    const sanitized = sanitizeSpeakerResourceHtml(
      '<script>alert(1)</script><iframe src="http://scheduler.example.com"></iframe><iframe src="https://evil.example.com"></iframe><p>Safe</p>',
      ["https://scheduler.example.com"],
    );
    expect(sanitized).toBe("<p>Safe</p>");
  });
});
