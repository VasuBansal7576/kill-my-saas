import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyPersonaEmailOverrides,
  buildEvaluatorAuthLogins,
  ensureEvaluatorAuthLogins,
  normalizeEmail,
} from "./evaluation-fixture";

const fixture = {
  schema_version: 1,
  live_evaluator_contract: {
    total_items: 98,
    total_scenarios: 20,
    required_items: 86,
    required_weighted_points: 183,
    crm_items: 12,
    crm_weighted_points: 19,
    public_widgets_weighted_points: 35,
    added_required_ids: ["CFP-17", "CFP-18"],
    embed_share: { id: "EMB-15", weight: 3 },
  },
  ordered_scenario_start: {
    precreated_cfp_forms: 0,
    precreated_submissions: 0,
    precreated_decisions: 0,
    precreated_sessions: 0,
    precreated_publications: 0,
    decision_ownership: {
      taming_ci: { scenario: "CFP-S4", outcome: "accepted" },
      ai_pair: { scenario: "CFP-S4", outcome: "rejected" },
    },
  },
  event: {
    name: "DevFlow Conf 2027",
    starts_on: "2027-05-12",
    ends_on: "2027-05-14",
    location: "San Francisco",
    timezone: "America/Los_Angeles",
    tracks: [],
    formats: [],
    rooms: [],
  },
  personas: [
    { persona: "organizer", canonical_person_key: "jordan", name: "Jordan", canonical_email: "jordan@example.com", aliases: ["sbek-organizer@example.com"], memberships: [{ scope: "event", role: "organizer" }], login_required: true },
    { persona: "speaker", canonical_person_key: "priya", name: "Priya", canonical_email: "priya@example.com", aliases: [], memberships: [{ scope: "event", role: "speaker" }], login_required: true },
  ],
  required_evaluator_config_personas: ["organizer", "speaker"],
};

describe("evaluator identity overrides", () => {
  it("normalizes compatibility addresses before uniqueness checks", () => {
    expect(normalizeEmail("  JORDAN＠EXAMPLE.COM  ")).toBe("jordan@example.com");
  });

  it("preserves the previous address as an alias and rejects cross-person collisions", () => {
    const overridden = applyPersonaEmailOverrides(fixture, { organizer: "live@example.com" });
    expect(overridden.personas[0]?.canonical_email).toBe("live@example.com");
    expect(overridden.personas[0]?.aliases).toContain("jordan@example.com");
    expect(() => applyPersonaEmailOverrides(fixture, { organizer: "priya@example.com" })).toThrow(/resolves to both/);
  });

  it("builds canonical and legacy logins with one persona password", () => {
    const logins = buildEvaluatorAuthLogins(fixture, {}, {
      organizer: "organizer-test-password",
      speaker: "speaker-test-password",
    });

    expect(logins.filter((login) => login.persona === "organizer")).toEqual([
      expect.objectContaining({ email: "jordan@example.com", password: "organizer-test-password", canonicalPersonKey: "jordan" }),
      expect.objectContaining({ email: "sbek-organizer@example.com", password: "organizer-test-password", canonicalPersonKey: "jordan" }),
    ]);
  });

  it("adds a runtime evaluator override without dropping canonical or legacy addresses", () => {
    const logins = buildEvaluatorAuthLogins(fixture, { organizer: "jordan+eval@example.net" }, {
      organizer: "organizer-test-password",
      speaker: "speaker-test-password",
    });

    expect(logins.filter((login) => login.persona === "organizer").map((login) => login.email)).toEqual([
      "jordan+eval@example.net",
      "jordan@example.com",
      "sbek-organizer@example.com",
    ]);
  });

  it("covers every documented canonical and legacy login for the four evaluator personas", () => {
    const registry = JSON.parse(readFileSync(
      new URL("../../../docs/fixtures/evaluator-personas.json", import.meta.url),
      "utf8",
    )) as unknown;
    const logins = buildEvaluatorAuthLogins(registry, {}, {
      organizer: "organizer-test-password",
      speaker: "speaker-test-password",
      speaker2: "speaker-two-test-password",
      reviewer: "reviewer-test-password",
    });

    expect(logins.map((login) => login.email)).toEqual([
      "jordan.organizer@sbek-test.example.com",
      "sbek-organizer@example.com",
      "priya.speaker@sbek-test.example.com",
      "sbek-speaker@example.com",
      "marcus.speaker@sbek-test.example.com",
      "sbek-speaker2@example.com",
      "sam.reviewer@sbek-test.example.com",
      "sbek-reviewer@example.com",
    ]);
  });

  it("idempotently creates a missing canonical Neon Auth login and verifies every password", async () => {
    const existing = new Map([["sbek-organizer@example.com", "organizer-test-password"]]);
    const logins = buildEvaluatorAuthLogins(fixture, {}, {
      organizer: "organizer-test-password",
      speaker: "speaker-test-password",
    }).filter((login) => login.persona === "organizer");

    const result = await ensureEvaluatorAuthLogins(logins, {
      async signUp(login) {
        if (existing.has(login.email)) return "existing";
        existing.set(login.email, login.password);
        return "created";
      },
      async verify(login) {
        return existing.get(login.email) === login.password;
      },
    });

    expect(result).toEqual({ created: 1, existing: 1, verified: 2 });
    expect(existing.get("jordan@example.com")).toBe("organizer-test-password");
  });

  it("paces auth requests and resumes after a bounded provider rate limit", async () => {
    const [login] = buildEvaluatorAuthLogins(fixture, {}, {
      organizer: "organizer-test-password",
      speaker: "speaker-test-password",
    }).filter((candidate) => candidate.email === "jordan@example.com");
    if (!login) throw new Error("Organizer login fixture is missing.");

    let now = 0;
    const sleeps: number[] = [];
    let verifyAttempts = 0;
    let created = false;
    const result = await ensureEvaluatorAuthLogins([login], {
      async signUp() {
        created = true;
      },
      async verify() {
        verifyAttempts += 1;
        if (verifyAttempts === 1) throw Object.assign(new Error("rate limited"), { status: 429 });
        return created;
      },
    }, {
      minIntervalMs: 100,
      maxRateLimitRetries: 2,
      rateLimitBackoffMs: () => 1_000,
      isRateLimitError: (error) => (error as { status?: number }).status === 429,
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
      },
    });

    expect(result).toEqual({ created: 1, existing: 0, verified: 1 });
    expect(verifyAttempts).toBe(3);
    expect(sleeps).toEqual([1_000, 100, 100]);
  });
});
