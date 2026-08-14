export function authFailureMessage(cause: unknown, signingUp: boolean): string {
  const fallback = signingUp ? "Account creation failed. Please try again." : "Sign in failed. Check the email and password, then try again.";
  const message = (typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "").trim();
  if (signingUp && /already|duplicate|exists|registered/i.test(message)) {
    return "An account already exists for this email. Sign in instead, or get account access help.";
  }
  if (!signingUp && /invalid|credential|password|unauthori[sz]ed|not found|email/i.test(message)) {
    return "That email and password don’t match. Check both fields and try again.";
  }
  return fallback;
}
