import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { describe, expect, it } from "vitest";
import { externalStyledEmbedHeaders } from "./external-styled-embed";

const styledEmbedPath = "/api/v1/public/program/devflow-conf-2027/embeds/sessions/styled";

describe("public styled embed security headers", () => {
  it("allows a successful styled embed to be framed by a genuine different origin", async () => {
    const app = currentSecurityPolicyApp();
    const response = await app.request(styledEmbedPath, {
      headers: { origin: "https://conference-host.example" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors *");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });

  it("does not grant the framing exception to invalid embed output or private HTML", async () => {
    const app = currentSecurityPolicyApp();
    const [invalidEmbed, privatePage] = await Promise.all([
      app.request("/api/v1/public/program/devflow-conf-2027/embeds/missing/styled"),
      app.request("/private-preview"),
    ]);

    expect(invalidEmbed.status).toBe(404);
    expect(invalidEmbed.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(invalidEmbed.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(invalidEmbed.headers.get("content-security-policy")).toBeNull();

    expect(privatePage.status).toBe(200);
    expect(privatePage.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(privatePage.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(privatePage.headers.get("content-security-policy")).toBeNull();
  });

  it.each([
    ["basic", "text/html; charset=utf-8"],
    ["json", "application/json; charset=utf-8"],
    ["xml", "application/xml; charset=utf-8"],
    ["ical", "text/calendar; charset=utf-8"],
  ])("preserves public %s export CORS without granting framing", async (format, contentType) => {
    const response = await currentSecurityPolicyApp().request(
      `/api/v1/public/program/devflow-conf-2027/embeds/sessions/${format}`,
      { headers: { origin: "https://conference-host.example" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(contentType);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
});

function currentSecurityPolicyApp() {
  const app = new Hono();
  app.use(
    "/api/v1/public/program/:eventSlug/embeds/:widgetSlug/styled",
    externalStyledEmbedHeaders,
  );
  app.use("*", secureHeaders());
  app.get("/api/v1/public/program/:eventSlug/embeds/:widgetSlug/:format", (context) => {
    if (context.req.param("widgetSlug") !== "sessions") return context.json({
      error: { code: "widget_not_found", message: "That widget does not exist." },
    }, 404);

    const format = context.req.param("format");
    const contentTypes: Record<string, string> = {
      styled: "text/html; charset=utf-8",
      basic: "text/html; charset=utf-8",
      json: "application/json; charset=utf-8",
      xml: "application/xml; charset=utf-8",
      ical: "text/calendar; charset=utf-8",
    };
    const contentType = contentTypes[format];
    if (!contentType) return context.json({
      error: { code: "output_not_found", message: "That widget output format does not exist." },
    }, 404);

    return new Response(format === "styled" ? "<!doctype html><title>Program</title>" : format, {
      headers: {
        "content-type": contentType,
        "access-control-allow-origin": "*",
      },
    });
  });
  app.get("/private-preview", () => new Response("<!doctype html><title>Private</title>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  }));
  return app;
}
