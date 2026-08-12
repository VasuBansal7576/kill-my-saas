import type { ReadinessResponse } from "@programflow/contracts";
import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";

const LoginPage = lazy(async () => ({ default: (await import("./app/LoginPage")).LoginPage }));
const EventSettingsPage = lazy(async () => ({ default: (await import("./features/event-configuration/EventSettingsPage")).EventSettingsPage }));
const CfpBuilderPage = lazy(async () => ({ default: (await import("./features/forms-submissions")).CfpBuilderPage }));
const PublicCfpPage = lazy(async () => ({ default: (await import("./features/forms-submissions")).PublicCfpPage }));
const SpeakerSubmissionsPage = lazy(async () => ({ default: (await import("./features/forms-submissions")).SpeakerSubmissionsPage }));
const SubmissionsPage = lazy(async () => ({ default: (await import("./features/forms-submissions")).SubmissionsPage }));
const ReviewerQueuePage = lazy(async () => ({ default: (await import("./features/reviews-decisions")).ReviewerQueuePage }));
const ReviewsDecisionsPage = lazy(async () => ({ default: (await import("./features/reviews-decisions")).ReviewsDecisionsPage }));
const SpeakerPortalPage = lazy(async () => ({ default: (await import("./features/speaker-operations")).SpeakerPortalPage }));
const SpeakerResourcesPage = lazy(async () => ({ default: (await import("./features/speaker-operations")).SpeakerResourcesPage }));
const SpeakerTasksPage = lazy(async () => ({ default: (await import("./features/speaker-operations")).SpeakerTasksPage }));
const SpeakersPage = lazy(async () => ({ default: (await import("./features/speaker-operations")).SpeakersPage }));
const OrganizerFilesPage = lazy(async () => ({ default: (await import("./features/files-deliverables")).OrganizerFilesPage }));
const SpeakerFilesPage = lazy(async () => ({ default: (await import("./features/files-deliverables")).SpeakerFilesPage }));
const CommunicationsPage = lazy(async () => ({ default: (await import("./features/communications")).CommunicationsPage }));
const AgendaPage = lazy(async () => ({ default: (await import("./features/scheduling")).AgendaPage }));
const SpeakerCrmPage = lazy(async () => ({ default: (await import("./features/speaker-crm")).SpeakerCrmPage }));
const AirtableIntegrationPage = lazy(async () => ({ default: (await import("./features/integrations")).AirtableIntegrationPage }));
const AcceleventsIntegrationPage = lazy(async () => ({ default: (await import("./features/integrations")).AcceleventsIntegrationPage }));
const PublishProgramPage = lazy(async () => ({ default: (await import("./features/public-program")).PublishProgramPage }));
const PublicSessionsPage = lazy(async () => ({ default: (await import("./features/public-program")).PublicSessionsPage }));
const PublicSpeakersPage = lazy(async () => ({ default: (await import("./features/public-program")).PublicSpeakersPage }));
const PublicAgendaPage = lazy(async () => ({ default: (await import("./features/public-program")).PublicAgendaPage }));
const PublicItineraryPage = lazy(async () => ({ default: (await import("./features/public-program")).PublicItineraryPage }));
const PublicSpeakerGalleryPage = lazy(async () => ({ default: (await import("./features/public-program")).PublicSpeakerGalleryPage }));
const DashboardPage = lazy(async () => ({ default: (await import("./features/dashboard")).DashboardPage }));
const DeveloperApiPage = lazy(async () => ({ default: (await import("./features/api-docs")).DeveloperApiPage }));

const navigation = [
  ["Dashboard", "/organizer/events/devflow-conf-2027/dashboard"],
  ["Event", "/organizer/events/devflow-conf-2027/settings"],
  ["Call for speakers", "/organizer/events/devflow-conf-2027/cfp"],
  ["Submissions", "/organizer/events/devflow-conf-2027/submissions"],
  ["Evaluations", "/organizer/events/devflow-conf-2027/evaluations"],
  ["Speakers", "/organizer/events/devflow-conf-2027/speakers"],
  ["Files", "/organizer/events/devflow-conf-2027/files"],
  ["Communications", "/organizer/events/devflow-conf-2027/communications"],
  ["Agenda", "/organizer/events/devflow-conf-2027/agenda"],
  ["Publish", "/organizer/events/devflow-conf-2027/publish"],
  ["Speaker CRM", "/organizer/organizations/314a7cef-1e90-4413-80cd-6e1cd0212cdd/speaker-crm"],
  ["Integrations", "/organizer/events/devflow-conf-2027/integrations/airtable"],
  ["Accelevents", "/organizer/events/devflow-conf-2027/integrations/accelevents"],
  ["API", "/organizer/events/devflow-conf-2027/api"],
] as const;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<Suspense fallback={<div className="login-page">Loading sign in…</div>}><LoginPage /></Suspense>} />
      <Route path="/cfp/:eventSlug" element={<StandalonePage><PublicCfpPage /></StandalonePage>} />
      <Route path="/reviewer/events/:eventSlug/reviews" element={<RolePage label="Reviewer workspace"><ReviewerQueuePage /></RolePage>} />
      <Route path="/speaker/events/:eventSlug/submissions" element={<RolePage label="Speaker submissions"><SpeakerSubmissionsPage /></RolePage>} />
      <Route path="/speaker/events/:eventSlug/files" element={<RolePage label="Speaker files"><SpeakerFilesPage /></RolePage>} />
      <Route path="/speaker/events/:eventSlug" element={<RolePage label="Speaker workspace"><SpeakerPortalPage /></RolePage>} />
      <Route path="/program/:eventSlug/sessions" element={<StandalonePage><PublicSessionsPage /></StandalonePage>} />
      <Route path="/program/:eventSlug/speakers" element={<StandalonePage><PublicSpeakersPage /></StandalonePage>} />
      <Route path="/program/:eventSlug/agenda" element={<StandalonePage><PublicAgendaPage /></StandalonePage>} />
      <Route path="/program/:eventSlug/itinerary" element={<StandalonePage><PublicItineraryPage /></StandalonePage>} />
      <Route path="/program/:eventSlug/speaker-gallery" element={<StandalonePage><PublicSpeakerGalleryPage /></StandalonePage>} />
      <Route path="/events/:eventSlug/sessions" element={<StandalonePage><PublicSessionsPage /></StandalonePage>} />
      <Route path="/events/:eventSlug/speakers" element={<StandalonePage><PublicSpeakersPage /></StandalonePage>} />
      <Route path="/events/:eventSlug/agenda" element={<StandalonePage><PublicAgendaPage /></StandalonePage>} />
      <Route path="/events/:eventSlug/itinerary" element={<StandalonePage><PublicItineraryPage /></StandalonePage>} />
      <Route path="/events/:eventSlug/gallery" element={<StandalonePage><PublicSpeakerGalleryPage /></StandalonePage>} />
      <Route path="/organizer/*" element={<ProductShell />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}

function HomePage() {
  const eventSlug = "devflow-conf-2027";
  return <main className="home-page"><section className="home-card"><div className="brand"><span>PF</span>ProgramFlow</div><p className="eyebrow">DevFlow Conf 2027</p><h1>Build the program. Share the experience.</h1><p>Submit a session, manage the conference, or explore the published agenda from one canonical program.</p><div className="home-actions"><NavLink className="home-primary" to="/login">Sign in to your workspace</NavLink><NavLink to={`/cfp/${eventSlug}`}>Call for speakers</NavLink><NavLink to={`/program/${eventSlug}/sessions`}>Browse sessions</NavLink><NavLink to={`/program/${eventSlug}/speakers`}>Meet the speakers</NavLink><NavLink to={`/program/${eventSlug}/agenda`}>View agenda</NavLink><NavLink to={`/program/${eventSlug}/itinerary`}>Build an itinerary</NavLink></div></section></main>;
}

function StandalonePage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="muted">Loading ProgramFlow…</p>}>{children}</Suspense>;
}

function RolePage({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="role-page"><header className="role-topbar"><div className="brand"><span>PF</span>ProgramFlow</div><strong>{label}</strong><SignOutButton /></header><StandalonePage>{children}</StandalonePage></div>;
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
        <SignOutButton />
      </header>
      <main>
        <Routes>
          <Route path="events/:eventSlug/dashboard" element={<Suspense fallback={<p className="muted">Loading dashboard…</p>}><DashboardPage /></Suspense>} />
          <Route path="events/:eventSlug/settings" element={<Suspense fallback={<p className="muted">Loading event settings…</p>}><EventSettingsPage /></Suspense>} />
          <Route path="events/:eventSlug/cfp" element={<Suspense fallback={<p className="muted">Loading CFP builder…</p>}><CfpBuilderPage /></Suspense>} />
          <Route path="events/:eventSlug/submissions" element={<Suspense fallback={<p className="muted">Loading submissions…</p>}><SubmissionsPage /></Suspense>} />
          <Route path="events/:eventSlug/evaluations" element={<Suspense fallback={<p className="muted">Loading evaluations…</p>}><ReviewsDecisionsPage /></Suspense>} />
          <Route path="events/:eventSlug/speakers" element={<Suspense fallback={<p className="muted">Loading speakers…</p>}><SpeakersPage /></Suspense>} />
          <Route path="events/:eventSlug/speakers/tasks" element={<Suspense fallback={<p className="muted">Loading speaker tasks…</p>}><SpeakerTasksPage /></Suspense>} />
          <Route path="events/:eventSlug/speakers/resources" element={<Suspense fallback={<p className="muted">Loading speaker resources…</p>}><SpeakerResourcesPage /></Suspense>} />
          <Route path="events/:eventSlug/files" element={<Suspense fallback={<p className="muted">Loading files…</p>}><OrganizerFilesPage /></Suspense>} />
          <Route path="events/:eventSlug/communications" element={<Suspense fallback={<p className="muted">Loading communications…</p>}><CommunicationsPage /></Suspense>} />
          <Route path="events/:eventSlug/agenda" element={<Suspense fallback={<p className="muted">Loading agenda…</p>}><AgendaPage /></Suspense>} />
          <Route path="events/:eventSlug/publish" element={<Suspense fallback={<p className="muted">Loading publishing…</p>}><PublishProgramPage /></Suspense>} />
          <Route path="events/:eventSlug/integrations/airtable" element={<Suspense fallback={<p className="muted">Loading Airtable…</p>}><AirtableIntegrationPage /></Suspense>} />
          <Route path="events/:eventSlug/integrations/accelevents" element={<Suspense fallback={<p className="muted">Loading Accelevents…</p>}><AcceleventsIntegrationPage /></Suspense>} />
          <Route path="events/:eventSlug/api" element={<Suspense fallback={<p className="muted">Loading API documentation…</p>}><DeveloperApiPage /></Suspense>} />
          <Route path="organizations/:organizationId/speaker-crm" element={<Suspense fallback={<p className="muted">Loading speaker CRM…</p>}><SpeakerCrmRoute /></Suspense>} />
          <Route path="*" element={<FoundationPage readiness={readiness} />} />
        </Routes>
      </main>
    </div>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return <button type="button" disabled={busy} onClick={() => {
    setBusy(true);
    void import("./app/auth-client")
      .then(({ authClient }) => authClient.signOut())
      .finally(() => navigate("/login", { replace: true }));
  }}>{busy ? "Signing out…" : "Sign out"}</button>;
}

function SpeakerCrmRoute() {
  const { organizationId = "" } = useParams();
  return <SpeakerCrmPage organizationId={organizationId} />;
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
