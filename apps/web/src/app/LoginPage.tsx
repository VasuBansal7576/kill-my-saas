import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "./auth-client";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const signingUp = searchParams.get("mode") === "signup";
  const eventSlug = searchParams.get("event") ?? "devflow-conf-2027";
  const next = searchParams.get("next") ?? (signingUp ? `/cfp/${eventSlug}` : "/organizer/events/devflow-conf-2027/dashboard");
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
    navigate(next, { replace: true });
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand"><span>PF</span>ProgramFlow</div>
        <p className="eyebrow">{signingUp ? "Speaker account" : "Welcome back"}</p>
        <h1>{signingUp ? "Create your speaker account." : "Sign in to your program."}</h1>
        <p>{signingUp ? "Create an account to save proposals and return to them later." : "Use the credentials assigned to your event role."}</p>
        <form onSubmit={submit}>
          {signingUp ? <label>Name<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></label> : null}
          <label>Email<input autoComplete="username" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input autoComplete={signingUp ? "new-password" : "current-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button type="submit" disabled={submitting}>{submitting ? (signingUp ? "Creating account…" : "Signing in…") : (signingUp ? "Create account" : "Sign in")}</button>
        </form>
        <p>{signingUp
          ? <>Already have an account? <Link to={`/login?event=${encodeURIComponent(eventSlug)}&next=${encodeURIComponent(next)}`}>Sign in</Link></>
          : <>Submitting a proposal? <Link to={`/login?mode=signup&event=${encodeURIComponent(eventSlug)}&next=${encodeURIComponent(next)}`}>Create a speaker account</Link></>}
        </p>
      </section>
    </main>
  );
}
