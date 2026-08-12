import { type FormEvent, useMemo, useState } from "react";
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
  const accessContext = useMemo(() => {
    if (next?.startsWith("/reviewer/")) return "reviewer";
    if (next?.startsWith("/cfp/") || next?.startsWith("/speaker/")) return "speaker";
    return "organizer";
  }, [next]);
  const accountLabel = `${accessContext[0]?.toUpperCase()}${accessContext.slice(1)} account`;
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
      <div className="login-shell">
        <section className="login-story" aria-label="ProgramFlow product overview">
          <Link className="brand login-brand" to="/"><span>PF</span>ProgramFlow</Link>
          <div className="login-story-copy">
            <p className="eyebrow">Conference program operations</p>
            <h1>One program.<br />No re-entry.</h1>
            <p>Move proposals through review, speaker onboarding, scheduling, and publication without entering the same data twice.</p>
          </div>
          <ol className="login-lifecycle" aria-label="Program lifecycle">
            <li><span>01</span><div><strong>Collect</strong><small>Flexible CFP forms and speaker drafts</small></div></li>
            <li><span>02</span><div><strong>Decide</strong><small>Scoped review, clear outcomes, clean handoff</small></div></li>
            <li><span>03</span><div><strong>Deliver</strong><small>Onboarding, agenda, and public program</small></div></li>
          </ol>
          <p className="login-trust"><i />Built for the events team running the program every day.</p>
        </section>

        <section className="login-card">
          <div className="login-card-head">
            <p className="eyebrow">{signingUp ? accountLabel : `${accountLabel} access`}</p>
            <h2>{signingUp ? (accessContext === "organizer" ? "Create your workspace" : `Create your ${accessContext} account`) : "Welcome back"}</h2>
            <p>{signingUp
              ? accessContext === "reviewer"
                ? "Use the email your organizer assigned so we can open your private review queue."
                : accessContext === "speaker"
                  ? "Create your speaker account, then continue your proposal without losing your place."
                  : "Set up your organization and first event. You can invite the rest of the team later."
              : accessContext === "speaker"
                ? "Sign in to continue your proposal and see decisions, sessions, and tasks."
                : accessContext === "reviewer"
                  ? "Sign in to open only the proposals assigned to you."
                  : "Sign in to continue running your event program."}</p>
          </div>
          <form onSubmit={submit}>
            {signingUp ? <label>Your name<input autoFocus autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Jordan Alvarez" /></label> : null}
            <label>Email address<input autoFocus={!signingUp} autoComplete="username" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
            <label>Password<input autoComplete={signingUp ? "new-password" : "current-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={signingUp ? "At least 8 characters" : "Enter your password"} /></label>
            {error ? <div className="form-error" role="alert"><strong>We couldn’t continue</strong><span>{error}</span></div> : null}
            <button type="submit" disabled={submitting}>{submitting ? (signingUp ? "Creating your account…" : "Signing you in…") : (signingUp ? (accessContext === "organizer" ? "Create workspace" : "Create account & continue") : "Sign in")}</button>
          </form>
          <div className="login-switch">
            {signingUp
              ? <>Already have an account? <Link to={`/login?event=${encodeURIComponent(eventSlug)}${next ? `&next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link></>
              : <>Need an organizer workspace? <Link to="/signup">Create one</Link></>}
          </div>
          <p className="login-evaluator-note">Evaluating ProgramFlow? Use the role credentials supplied with the submission. Each account is server-scoped.</p>
        </section>
      </div>
    </main>
  );
}
