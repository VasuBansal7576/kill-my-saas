import type { ReadinessResponse } from "@programflow/contracts";
import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

const LoginPage = lazy(async () => ({ default: (await import("./app/LoginPage")).LoginPage }));
const EventSettingsPage = lazy(async () => ({ default: (await import("./features/event-configuration/EventSettingsPage")).EventSettingsPage }));

const navigation = [
  ["Dashboard", "/organizer/events/devflow-conf-2027/dashboard"],
  ["Event", "/organizer/events/devflow-conf-2027/settings"],
  ["Call for speakers", "/organizer/events/devflow-conf-2027/cfp"],
  ["Submissions", "/organizer/events/devflow-conf-2027/submissions"],
  ["Evaluations", "/organizer/events/devflow-conf-2027/evaluations"],
  ["Speakers", "/organizer/events/devflow-conf-2027/speakers"],
  ["Agenda", "/organizer/events/devflow-conf-2027/agenda"],
  ["Publish", "/organizer/events/devflow-conf-2027/publish"],
] as const;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Suspense fallback={<div className="login-page">Loading sign in…</div>}><LoginPage /></Suspense>} />
      <Route path="*" element={<ProductShell />} />
    </Routes>
  );
}

function ProductShell() {
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);

  useEffect(() => {
    void fetch("/api/v1/health/ready")
      .then((response) => response.json())
      .then((data: ReadinessResponse) => setReadiness(data))
      .catch(() => setReadiness(null));
  }, []);

  return (
    <div className="product-shell">
      <aside className="sidebar">
        <div className="brand"><span>PF</span>ProgramFlow</div>
        <div className="event-card">
          <strong>DevFlow Conf 2027</strong>
          <small>12–14 May · San Francisco</small>
          <i><b /></i>
        </div>
        <nav aria-label="Organizer navigation">
          <p>Program lifecycle</p>
          {navigation.map(([label, to]) => (
            <NavLink key={to} to={to}>{label}</NavLink>
          ))}
        </nav>
        <div className="account"><span>JA</span><div><strong>Jordan Alvarez</strong><small>Event organizer</small></div></div>
      </aside>
      <header className="topbar">
        <span>DevFlow Conf 2027</span>
        <div className="command">Search or jump to… <kbd>⌘ K</kbd></div>
        <button type="button">Help</button>
      </header>
      <main>
        <Routes>
          <Route path="/organizer/events/:eventSlug/settings" element={<Suspense fallback={<p className="muted">Loading event settings…</p>}><EventSettingsPage /></Suspense>} />
          <Route path="*" element={<FoundationPage readiness={readiness} />} />
        </Routes>
      </main>
    </div>
  );
}

function FoundationPage({ readiness }: { readiness: ReadinessResponse | null }) {
  const configured = readiness
    ? Object.entries(readiness.dependencies).filter(([, value]) => value.configured).length
    : 0;

  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Foundation</p><h1>Build the program with confidence.</h1><p>One canonical lifecycle from submissions to a published agenda.</p></div>
        <div className={`readiness ${readiness?.status === "ready" ? "ready" : "pending"}`}>
          <span />
          <div><strong>{readiness?.status === "ready" ? "Environment ready" : "Configuration required"}</strong><small>{configured} of 6 service boundaries configured</small></div>
        </div>
      </div>
      <section className="workspace-grid">
        <article className="primary-panel">
          <div className="section-head"><h2>Program lifecycle</h2><span>Canonical state</span></div>
          {["Call for speakers", "Reviews and decisions", "Speaker onboarding", "Program content", "Agenda", "Publication"].map((label, index) => (
            <div className="stage" key={label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{label}</strong><small>{index === 0 ? "Foundation interface established" : "Unlocked by the preceding verified handoff"}</small></div>
              <em>{index === 0 ? "In progress" : "Waiting"}</em>
            </div>
          ))}
        </article>
        <aside className="status-panel">
          <div className="section-head"><h2>Service readiness</h2><span>Live</span></div>
          {readiness ? Object.entries(readiness.dependencies).map(([name, value]) => (
            <div className="service" key={name}><i className={value.configured ? "ok" : "missing"} /><div><strong>{name}</strong><small>{value.detail}</small></div></div>
          )) : <p className="muted">Waiting for the Worker health endpoint…</p>}
        </aside>
      </section>
    </>
  );
}
