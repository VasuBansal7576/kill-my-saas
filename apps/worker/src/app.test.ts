import { ReadinessResponseSchema } from "@programflow/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { Env } from "./env";

describe("health boundary", () => {
  it("reports missing external configuration without claiming readiness", async () => {
    const app = createApp();
    const response = await app.request("/api/v1/health/ready", {}, {
      APP_ENV: "local",
    } as Env);
    const body = ReadinessResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.status).toBe("needs_configuration");
    expect(body.dependencies.database.configured).toBe(false);
    expect(body.dependencies.auth.configured).toBe(false);
  });

  it("retains restrictive framing and resource headers on global, private, and invalid embed responses", async () => {
    const app = createApp();
    const environment = { APP_ENV: "local" } as Env;
    const [globalRoute, privateRoute, invalidEmbed] = await Promise.all([
      app.request("/api/v1/health/live", {}, environment),
      app.request("/api/v1/organizer/events/devflow-conf-2027/publish", {}, environment),
      app.request("/api/v1/public/program/devflow-conf-2027/embeds/missing/styled", {}, environment),
    ]);

    expect(globalRoute.status).toBe(200);
    expect(privateRoute.status).toBe(503);
    expect(invalidEmbed.status).toBe(503);

    for (const response of [globalRoute, privateRoute, invalidEmbed]) {
      expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      expect(response.headers.get("content-security-policy")).toBeNull();
    }
  });
});
