import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionUserFromAuth } from "./resolve-actor";

const clientRecoveryBoundaryMs = 8_000;
const authColdRoundTripMs = 2_900;
const databaseColdBootstrapMs = 2_300;

describe("protected workspace cold bootstrap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["organizer", "reviewer", "speaker"] as const)("keeps the %s workspace below the client recovery boundary when only the durable session token is cached", async (role) => {
    let deployedEquivalentDurationMs = 0;
    const upstreamAuth = vi.fn(async () => {
      deployedEquivalentDurationMs += authColdRoundTripMs;
      const now = new Date().toISOString();
      return Response.json({
        session: {
          id: "session-1",
          token: "bearer-token-value-12345",
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        user: {
          id: `${role}-auth-user`,
          email: `${role}@example.com`,
          name: `${role[0]?.toUpperCase()}${role.slice(1)} Persona`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      });
    });
    vi.stubGlobal("fetch", upstreamAuth);
    const coldDatabaseBootstrap = vi.fn(async () => {
      deployedEquivalentDurationMs += databaseColdBootstrapMs;
      return { role };
    });

    const request = new Request("https://programflow.example/api/v1/session", {
      headers: {
        cookie: `__Secure-neon-auth.session_token=${role}-bearer-token-value.signature`,
      },
    });
    const user = await sessionUserFromAuth(
      request,
      "https://auth.example.com",
      "x".repeat(32),
    );
    const workspace = await coldDatabaseBootstrap();

    expect(user).toMatchObject({ id: `${role}-auth-user` });
    expect(workspace).toEqual({ role });
    expect(deployedEquivalentDurationMs).toBe(5_200);
    expect(deployedEquivalentDurationMs).toBeLessThan(clientRecoveryBoundaryMs);
    expect(upstreamAuth).toHaveBeenCalledTimes(1);
    expect(coldDatabaseBootstrap).toHaveBeenCalledTimes(1);
  });
});
