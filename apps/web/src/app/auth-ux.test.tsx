import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./PasswordInput";

describe("authentication interaction affordances", () => {
  it("renders an explicit accessible password visibility control and visible requirements", () => {
    const markup = renderToStaticMarkup(<PasswordInput label="Password" minLength={8} help="Use at least 8 characters." />);
    expect(markup).toContain('type="password"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-controls=');
    expect(markup).toContain("Use at least 8 characters.");
  });

  it("connects sign-in to provider-backed request and reset routes", () => {
    const login = readFileSync(new URL("./LoginPage.tsx", import.meta.url), "utf8");
    const recovery = readFileSync(new URL("./AuthRecoveryPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(login).toContain('to="/forgot-password"');
    expect(recovery).toContain("authClient.requestPasswordReset");
    expect(recovery).toContain("authClient.resetPassword");
    expect(app).toContain('path="/reset-password"');
  });
});
