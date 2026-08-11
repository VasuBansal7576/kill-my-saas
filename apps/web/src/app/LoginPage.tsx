import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "./auth-client";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) {
      setError("Neon Auth is not configured for this environment.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message ?? "Sign in failed.");
      return;
    }
    navigate("/organizer/events/devflow-conf-2027/dashboard", { replace: true });
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand"><span>PF</span>ProgramFlow</div>
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your program.</h1>
        <p>Use the credentials assigned to your event role.</p>
        <form onSubmit={submit}>
          <label>Email<input autoComplete="username" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}

