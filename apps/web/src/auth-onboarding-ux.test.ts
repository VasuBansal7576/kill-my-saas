import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authFailureMessage } from "./app/auth-messages";
import { brandColorChoices, friendlyTimezoneLabel } from "./app/onboarding-options";

describe("account access affordances", () => {
  it("turns provider failures into helpful messages without leaking provider detail", () => {
    expect(authFailureMessage("Invalid credentials", false)).toBe("That email and password don’t match. Check both fields and try again.");
    expect(authFailureMessage("database adapter exploded", false)).toBe("Sign in failed. Check the email and password, then try again.");
    expect(authFailureMessage("Email already registered", true)).toContain("already exists");
  });

  it("provides password visibility, rules, Caps Lock feedback, and a supported recovery route", () => {
    const login = readFileSync(new URL("./app/LoginPage.tsx", import.meta.url), "utf8");
    const passwordInput = readFileSync(new URL("./app/PasswordInput.tsx", import.meta.url), "utf8");
    expect(passwordInput).toContain('aria-label={visible ? "Hide password" : "Show password"}');
    expect(login).toContain("Use at least 8 characters.");
    expect(passwordInput).toContain("Caps Lock is on.");
    expect(login).toContain('<Link to="/forgot-password">Forgot password?</Link>');
    expect(login).toContain('<Link to="/help">Get account access help</Link>');
  });
});

describe("event creation choices", () => {
  it("uses event-mode copy, readable timezones, and named color choices", () => {
    const source = readFileSync(new URL("./app/WorkspaceOnboardingPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('additionalEvent ? "Event details" : "First event details"');
    expect(source).toContain("Event timezone");
    expect(source).toContain("Used for deadlines, agenda times, and calendar exports.");
    expect(source).toContain("Choose a custom brand color");
    expect(source).toContain("Suggested brand colors");
    expect(brandColorChoices).toHaveLength(5);
    expect(friendlyTimezoneLabel("Asia/Kolkata")).toBe("Kolkata · Asia");
    expect(friendlyTimezoneLabel("UTC")).toContain("Coordinated Universal Time");
  });
});

describe("public speaker surfaces", () => {
  it("distinguishes the compact directory from the photo-first gallery", () => {
    const source = readFileSync(new URL("./features/public-program/PublicProgramPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('label: "Speaker directory"');
    expect(source).toContain("compact alphabetical index");
    expect(source).toContain("photo-first grid");
    expect(source).toContain("Prefer photos? Open speaker gallery");
    expect(source).toContain("Need a compact index? Open speaker directory");
  });
});
