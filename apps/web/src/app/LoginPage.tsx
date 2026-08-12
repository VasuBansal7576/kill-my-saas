import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "./auth-client";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const signingUp = location.pathname === "/signup" || searchParams.get("mode") === "signup";
  const eventSlug = searchParams.get("event") ?? "devflow-conf-2027";
  const roleSignup = searchParams.get("mode") === "signup";
  const next = searchParams.get("next") ?? (signingUp ? (roleSignup ? `/cfp/${eventSlug}` : "/onboarding") : null);
  const accountLabel = !roleSignup ? "Organizer account" : next?.startsWith("/reviewer/") ? "Reviewer account" : "Speaker account";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = signingUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message ?? (signingUp ? "Account creation failed." : "Sign in failed."));
      return;
    }
    if (next) {
      navigate(next, { replace: true });
      return;
    }
    const session = await fetch("/api/v1/session");
    if (!session.ok) {
      setError("Signed in, but ProgramFlow could not resolve an event role for this account.");
      return;
    }
    const landing = await session.json() as { recommendedPath: string };
    navigate(landing.recommendedPath, { replace: true });
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand"><span>PF</span>ProgramFlow</div>
        <p className="eyebrow">{signingUp ? accountLabel : "Welcome back"}</p>
        <h1>{signingUp ? `Create your ${accountLabel.toLocaleLowerCase()}.` : "Sign in to your program."}</h1>
        <p>{signingUp ? (accountLabel === "Reviewer account" ? "Link your assigned reviewer identity and open only your evaluation queue." : "Create an account to save proposals and return to them later.") : "Use the credentials assigned to your event role."}</p>
        <form onSubmit={submit}>
          {signingUp ? <label>Name<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></label> : null}
          <label>Email<input autoComplete="username" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input autoComplete={signingUp ? "new-password" : "current-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button type="submit" disabled={submitting}>{submitting ? (signingUp ? "Creating account…" : "Signing in…") : (signingUp ? "Create account" : "Sign in")}</button>
        </form>
        <p>{signingUp
          ? <>Already have an account? <Link to={`/login?event=${encodeURIComponent(eventSlug)}`}>Sign in</Link></>
          : <>New to ProgramFlow? <Link to="/signup">Create an organizer workspace</Link></>}
        </p>
      </section>
    </main>
  );
}
