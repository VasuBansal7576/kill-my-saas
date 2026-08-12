import { lazy, Suspense, useEffect, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { organizerNavigation } from "./app/organizer-navigation";

const LoginPage = lazy(async () => ({
  default: (await import("./app/LoginPage")).LoginPage,
}));
const EventSettingsPage = lazy(async () => ({
  default: (await import("./features/event-configuration/EventSettingsPage"))
    .EventSettingsPage,
}));
const CfpBuilderPage = lazy(async () => ({
  default: (await import("./features/forms-submissions")).CfpBuilderPage,
}));
const PublicCfpPage = lazy(async () => ({
  default: (await import("./features/forms-submissions")).PublicCfpPage,
}));
const SpeakerSubmissionsPage = lazy(async () => ({
  default: (await import("./features/forms-submissions"))
    .SpeakerSubmissionsPage,
}));
const SubmissionsPage = lazy(async () => ({
  default: (await import("./features/forms-submissions")).SubmissionsPage,
}));
const ReviewerQueuePage = lazy(async () => ({
  default: (await import("./features/reviews-decisions")).ReviewerQueuePage,
}));
const ReviewsDecisionsPage = lazy(async () => ({
  default: (await import("./features/reviews-decisions")).ReviewsDecisionsPage,
}));
const SpeakerPortalPage = lazy(async () => ({
  default: (await import("./features/speaker-operations")).SpeakerPortalPage,
}));
const SpeakerResourcesPage = lazy(async () => ({
  default: (await import("./features/speaker-operations")).SpeakerResourcesPage,
}));
const SpeakerTasksPage = lazy(async () => ({
  default: (await import("./features/speaker-operations")).SpeakerTasksPage,
}));
const SpeakersPage = lazy(async () => ({
  default: (await import("./features/speaker-operations")).SpeakersPage,
}));
const OrganizerFilesPage = lazy(async () => ({
  default: (await import("./features/files-deliverables")).OrganizerFilesPage,
}));
const SpeakerFilesPage = lazy(async () => ({
  default: (await import("./features/files-deliverables")).SpeakerFilesPage,
}));
const CommunicationsPage = lazy(async () => ({
  default: (await import("./features/communications")).CommunicationsPage,
}));
const AgendaPage = lazy(async () => ({
  default: (await import("./features/scheduling")).AgendaPage,
}));
const SpeakerCrmPage = lazy(async () => ({
  default: (await import("./features/speaker-crm")).SpeakerCrmPage,
}));
const AirtableIntegrationPage = lazy(async () => ({
  default: (await import("./features/integrations")).AirtableIntegrationPage,
}));
const AcceleventsIntegrationPage = lazy(async () => ({
  default: (await import("./features/integrations")).AcceleventsIntegrationPage,
}));
const PublishProgramPage = lazy(async () => ({
  default: (await import("./features/public-program")).PublishProgramPage,
}));
const PublicSessionsPage = lazy(async () => ({
  default: (await import("./features/public-program")).PublicSessionsPage,
}));
const PublicSpeakersPage = lazy(async () => ({
  default: (await import("./features/public-program")).PublicSpeakersPage,
}));
const PublicAgendaPage = lazy(async () => ({
  default: (await import("./features/public-program")).PublicAgendaPage,
}));
const PublicItineraryPage = lazy(async () => ({
  default: (await import("./features/public-program")).PublicItineraryPage,
}));
const PublicSpeakerGalleryPage = lazy(async () => ({
  default: (await import("./features/public-program")).PublicSpeakerGalleryPage,
}));
const DashboardPage = lazy(async () => ({
  default: (await import("./features/dashboard")).DashboardPage,
}));
const DeveloperApiPage = lazy(async () => ({
  default: (await import("./features/api-docs")).DeveloperApiPage,
}));
const WorkspaceOnboardingPage = lazy(async () => ({
  default: (await import("./app/WorkspaceOnboardingPage"))
    .WorkspaceOnboardingPage,
}));

type SessionResponse = {
  person: { id: string; displayName: string; email: string | null };
  organizationMemberships: Array<{
    id: string;
    slug: string;
    name: string;
    roles: string[];
  }>;
  eventMemberships: Array<{
    id: string;
    organizationId: string;
    slug: string;
    name: string;
    startsOn: string;
    endsOn: string;
    location: string;
    roles: string[];
  }>;
  recommendedPath: string;
};

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/login"
        element={
          <Suspense
            fallback={<div className="login-page">Loading sign in…</div>}
          >
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/signup"
        element={
          <Suspense
            fallback={<div className="login-page">Loading account setup…</div>}
          >
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/onboarding"
        element={
          <Suspense
            fallback={
              <div className="login-page">Loading workspace setup…</div>
            }
          >
            <WorkspaceOnboardingPage />
          </Suspense>
        }
      />
      <Route
        path="/cfp/:eventSlug"
        element={
          <StandalonePage>
            <PublicCfpPage />
          </StandalonePage>
        }
      />
      <Route
        path="/reviewer/events/:eventSlug/reviews"
        element={
          <RolePage label="Reviewer workspace">
            <ReviewerQueuePage />
          </RolePage>
        }
      />
      <Route
        path="/speaker/events/:eventSlug/submissions"
        element={
          <RolePage label="Speaker submissions">
            <SpeakerSubmissionsPage />
          </RolePage>
        }
      />
      <Route
        path="/speaker/events/:eventSlug/files"
        element={
          <RolePage label="Speaker files">
            <SpeakerFilesPage />
          </RolePage>
        }
      />
      <Route
        path="/speaker/events/:eventSlug"
        element={
          <RolePage label="Speaker workspace">
            <SpeakerPortalPage />
          </RolePage>
        }
      />
      <Route
        path="/program/:eventSlug/sessions"
        element={
          <StandalonePage>
            <PublicSessionsPage />
          </StandalonePage>
        }
      />
      <Route
        path="/program/:eventSlug/speakers"
        element={
          <StandalonePage>
            <PublicSpeakersPage />
          </StandalonePage>
        }
      />
      <Route
        path="/program/:eventSlug/agenda"
        element={
          <StandalonePage>
            <PublicAgendaPage />
          </StandalonePage>
        }
      />
      <Route
        path="/program/:eventSlug/itinerary"
        element={
          <StandalonePage>
            <PublicItineraryPage />
          </StandalonePage>
        }
      />
      <Route
        path="/program/:eventSlug/speaker-gallery"
        element={
          <StandalonePage>
            <PublicSpeakerGalleryPage />
          </StandalonePage>
        }
      />
      <Route
        path="/events/:eventSlug/sessions"
        element={
          <StandalonePage>
            <PublicSessionsPage />
          </StandalonePage>
        }
      />
      <Route
        path="/events/:eventSlug/speakers"
        element={
          <StandalonePage>
            <PublicSpeakersPage />
          </StandalonePage>
        }
      />
      <Route
        path="/events/:eventSlug/agenda"
        element={
          <StandalonePage>
            <PublicAgendaPage />
          </StandalonePage>
        }
      />
      <Route
        path="/events/:eventSlug/itinerary"
        element={
          <StandalonePage>
            <PublicItineraryPage />
          </StandalonePage>
        }
      />
      <Route
        path="/events/:eventSlug/gallery"
        element={
          <StandalonePage>
            <PublicSpeakerGalleryPage />
          </StandalonePage>
        }
      />
      <Route path="/organizer/*" element={<ProductShell />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function HomePage() {
  return (
    <main className="home-page">
      <section className="home-card">
        <div className="brand">
          <span>PF</span>ProgramFlow
        </div>
        <p className="eyebrow">Conference program operations</p>
        <h1>Build the program. Share the experience.</h1>
        <p>
          Run submissions, reviews, speaker onboarding, content, scheduling, and
          publication from one connected workspace.
        </p>
        <div className="home-actions">
          <NavLink className="home-primary" to="/signup">
            Create your workspace
          </NavLink>
          <NavLink to="/login">Sign in</NavLink>
        </div>
        <small className="home-proof">
          Real accounts · saved event data · separate workspaces for every role
        </small>
      </section>
    </main>
  );
}

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="muted">Loading ProgramFlow…</p>}>
      {children}
    </Suspense>
  );
}

export function RolePage({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const [personName, setPersonName] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/v1/session")
      .then((response) =>
        response.ok ? (response.json() as Promise<SessionResponse>) : null,
      )
      .then((session) => setPersonName(session?.person.displayName ?? null))
      .catch(() => setPersonName(null));
  }, []);
  return (
    <div className="role-page">
      <header className="role-topbar">
        <div className="brand">
          <span>PF</span>ProgramFlow
        </div>
        <strong>
          {label}
          {personName ? ` · ${personName}` : ""}
        </strong>
        <SignOutButton />
      </header>
      <main className="role-content">
        <StandalonePage>{children}</StandalonePage>
      </main>
    </div>
  );
}

function ProductShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/session")
      .then(async (response) => {
        if (response.status === 401) {
          navigate(`/login?next=${encodeURIComponent(location.pathname)}`, {
            replace: true,
          });
          return;
        }
        if (!response.ok) throw new Error("Session could not be loaded.");
        const current = (await response.json()) as SessionResponse;
        if (!current.organizationMemberships.length) {
          navigate(current.recommendedPath, { replace: true });
          return;
        }
        if (/^\/organizer\/?$/.test(location.pathname)) {
          navigate(current.recommendedPath, { replace: true });
          return;
        }
        setSession(current);
      })
      .catch(() => navigate("/login", { replace: true }));
  }, [location.pathname, navigate]);

  if (!session)
    return <div className="product-shell-loading">Loading your workspace…</div>;

  const routeEventSlug = /^\/organizer\/events\/([^/]+)/.exec(
    location.pathname,
  )?.[1];
  const activeEvent =
    session.eventMemberships.find((event) => event.slug === routeEventSlug) ??
    session.eventMemberships.find((event) => event.roles.includes("organizer"));
  const activeOrganization =
    session.organizationMemberships.find(
      (organization) => organization.id === activeEvent?.organizationId,
    ) ?? session.organizationMemberships[0];
  const navigation =
    activeEvent && activeOrganization
      ? organizerNavigation(activeEvent.slug, activeOrganization.id)
      : [];
  const initials = session.person.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("en-US");

  return (
    <div className="product-shell">
      <aside
        id="organizer-navigation"
        className={`sidebar${mobileNavigationOpen ? " mobile-open" : ""}`}
      >
        <div className="brand">
          <span>PF</span>ProgramFlow
        </div>
        {activeEvent ? (
          <div className="event-card">
            <strong>{activeEvent.name}</strong>
            <small>
              {activeEvent.startsOn}–{activeEvent.endsOn} ·{" "}
              {activeEvent.location}
            </small>
            <i>
              <b />
            </i>
          </div>
        ) : null}
        {session.eventMemberships.filter((event) =>
          event.roles.includes("organizer"),
        ).length > 1 ? (
          <select
            className="event-switcher"
            aria-label="Switch event"
            value={activeEvent?.slug ?? ""}
            onChange={(event) => {
              setMobileNavigationOpen(false);
              navigate(`/organizer/events/${event.target.value}/dashboard`);
            }}
          >
            {session.eventMemberships
              .filter((event) => event.roles.includes("organizer"))
              .map((event) => (
                <option key={event.id} value={event.slug}>
                  {event.name}
                </option>
              ))}
          </select>
        ) : null}
        <nav aria-label="Organizer navigation">
          <p>Program lifecycle</p>
          {navigation.map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileNavigationOpen(false)}
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/organizer/new-event"
            onClick={() => setMobileNavigationOpen(false)}
          >
            + New event
          </NavLink>
        </nav>
        <div className="account">
          <span>{initials}</span>
          <div>
            <strong>{session.person.displayName}</strong>
            <small>Event organizer</small>
          </div>
        </div>
      </aside>
      {mobileNavigationOpen ? (
        <button
          className="mobile-nav-backdrop"
          type="button"
          aria-label="Close organizer navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      ) : null}
      <header className="topbar">
        <button
          className="mobile-nav-toggle"
          type="button"
          aria-controls="organizer-navigation"
          aria-expanded={mobileNavigationOpen}
          onClick={() => setMobileNavigationOpen((open) => !open)}
        >
          {mobileNavigationOpen ? "Close menu" : "Menu"}
        </button>
        <span>
          {activeEvent?.name ?? activeOrganization?.name ?? "ProgramFlow"}
        </span>
        <SignOutButton />
      </header>
      <main>
        <Routes>
          <Route
            path="new-event"
            element={
              <Suspense
                fallback={<p className="muted">Loading event setup…</p>}
              >
                <WorkspaceOnboardingPage additionalEvent />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/dashboard"
            element={
              <Suspense fallback={<p className="muted">Loading dashboard…</p>}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/settings"
            element={
              <Suspense
                fallback={<p className="muted">Loading event settings…</p>}
              >
                <EventSettingsPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/cfp"
            element={
              <Suspense
                fallback={<p className="muted">Loading CFP builder…</p>}
              >
                <CfpBuilderPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/submissions"
            element={
              <Suspense
                fallback={<p className="muted">Loading submissions…</p>}
              >
                <SubmissionsPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/evaluations"
            element={
              <Suspense
                fallback={<p className="muted">Loading evaluations…</p>}
              >
                <ReviewsDecisionsPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/speakers/:eventSpeakerId"
            element={
              <Suspense
                fallback={<p className="muted">Loading speaker details…</p>}
              >
                <SpeakersPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/speakers"
            element={
              <Suspense fallback={<p className="muted">Loading speakers…</p>}>
                <SpeakersPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/tasks"
            element={
              <Suspense
                fallback={<p className="muted">Loading speaker tasks…</p>}
              >
                <SpeakerTasksPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/resources"
            element={
              <Suspense
                fallback={<p className="muted">Loading portal resources…</p>}
              >
                <SpeakerResourcesPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/speakers/tasks"
            element={
              <Suspense
                fallback={<p className="muted">Loading speaker tasks…</p>}
              >
                <SpeakerTasksPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/speakers/resources"
            element={
              <Suspense
                fallback={<p className="muted">Loading speaker resources…</p>}
              >
                <SpeakerResourcesPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/files"
            element={
              <Suspense fallback={<p className="muted">Loading files…</p>}>
                <OrganizerFilesPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/communications"
            element={
              <Suspense
                fallback={<p className="muted">Loading communications…</p>}
              >
                <CommunicationsPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/agenda"
            element={
              <Suspense fallback={<p className="muted">Loading agenda…</p>}>
                <AgendaPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/publish"
            element={
              <Suspense fallback={<p className="muted">Loading publishing…</p>}>
                <PublishProgramPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/integrations/airtable"
            element={
              <Suspense fallback={<p className="muted">Loading Airtable…</p>}>
                <AirtableIntegrationPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/integrations/accelevents"
            element={
              <Suspense
                fallback={<p className="muted">Loading Accelevents…</p>}
              >
                <AcceleventsIntegrationPage />
              </Suspense>
            }
          />
          <Route
            path="events/:eventSlug/api"
            element={
              <Suspense
                fallback={<p className="muted">Loading API documentation…</p>}
              >
                <DeveloperApiPage />
              </Suspense>
            }
          />
          <Route
            path="organizations/:organizationId/speaker-crm"
            element={
              <Suspense
                fallback={<p className="muted">Loading speaker CRM…</p>}
              >
                <SpeakerCrmRoute />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <NotFoundPage
                dashboardPath={
                  activeEvent
                    ? `/organizer/events/${activeEvent.slug}/dashboard`
                    : "/"
                }
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void import("./app/auth-client")
          .then(({ authClient }) => authClient.signOut())
          .finally(() => navigate("/login", { replace: true }));
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

function SpeakerCrmRoute() {
  const { organizationId = "" } = useParams();
  return <SpeakerCrmPage organizationId={organizationId} />;
}

export function NotFoundPage({ dashboardPath }: { dashboardPath?: string }) {
  const Landmark = dashboardPath ? "section" : "main";
  return (
    <Landmark className="not-found" aria-labelledby="not-found-title">
      <p className="eyebrow">404 · Page not found</p>
      <h1 id="not-found-title">This page doesn’t exist.</h1>
      <p>The link may be out of date, or the page may have moved.</p>
      <div className="not-found-actions">
        {dashboardPath ? (
          <NavLink className="primary-action" to={dashboardPath}>
            Back to dashboard
          </NavLink>
        ) : null}
        <NavLink to="/">ProgramFlow home</NavLink>
      </div>
    </Landmark>
  );
}
