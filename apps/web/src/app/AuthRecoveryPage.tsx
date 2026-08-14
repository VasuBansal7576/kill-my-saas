import { type FormEvent, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { authClient } from "./auth-client";
import { PasswordInput } from "./PasswordInput";

export function AuthRecoveryPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const resetting = location.pathname === "/reset-password";
  const token = searchParams.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("error") ? "This recovery link is invalid or has expired. Request a new one." : null);
  const [complete, setComplete] = useState(false);
  const missingResetToken = resetting && !token;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (resetting && !token) {
      setError("This recovery link is missing its security token. Request a new one.");
      return;
    }
    if (resetting && password !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = resetting
        ? await authClient.resetPassword({ newPassword: password, token: token! })
        : await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
      if (result.error) {
        setError(result.error.message ?? (resetting ? "Your password could not be reset." : "The recovery email could not be requested."));
        return;
      }
      setComplete(true);
    } catch {
      setError(resetting ? "Your password could not be reset. Request a new recovery link and try again." : "The recovery request could not be sent. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main id="main-content" className="login-page"><section className="login-card recovery-card"><Link className="brand login-brand" to="/"><span>PF</span>ProgramFlow</Link><div className="login-card-head"><p className="eyebrow">Account recovery</p><h2>{missingResetToken ? "Request a new recovery link" : resetting ? "Choose a new password" : "Reset your password"}</h2><p>{missingResetToken ? "This password-reset page needs the secure token from your email link." : resetting ? "Use the secure link from your email to replace your account password." : "Enter your account email. For privacy, we show the same confirmation whether or not an account exists."}</p></div>{missingResetToken ? <div className="recovery-success" role="alert"><strong>This recovery link is incomplete.</strong><p>Request a fresh link, then open it from the same browser where you want to set your new password.</p><Link className="primary-action" to="/forgot-password">Request a new link</Link><Link className="recovery-cancel" to="/login">Back to sign in</Link></div> : complete ? <div className="recovery-success" role="status"><strong>{resetting ? "Password updated." : "Check your email."}</strong><p>{resetting ? "You can now sign in with your new password." : "If an account exists for that address, its recovery link is on the way."}</p><Link className="primary-action" to="/login">Return to sign in</Link></div> : <form onSubmit={submit}>{resetting ? <><PasswordInput label="New password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} help="Use at least 8 characters." /><PasswordInput label="Confirm new password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></> : <label htmlFor="recovery-email">Email address<input id="recovery-email" autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}{error ? <div className="form-error" role="alert"><strong>We couldn’t continue</strong><span>{error}</span></div> : null}<button type="submit" disabled={submitting}>{submitting ? "Working…" : resetting ? "Save new password" : "Send recovery link"}</button><Link className="recovery-cancel" to="/login">Back to sign in</Link></form>}</section></main>;
}
