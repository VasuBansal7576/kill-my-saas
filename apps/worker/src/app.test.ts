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
});

