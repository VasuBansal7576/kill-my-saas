import { Link } from "react-router-dom";
import styles from "./operations-evidence.module.css";

const eventSlug = "devflow-conf-2027";

export function EvaluationEntryPage() {
  return <main id="main-content" className={styles.entryPage}>
    <header className={styles.entryNav}>
      <div className={styles.brand}><span>PF</span>ProgramFlow</div>
      <nav aria-label="Evaluation entry shortcuts"><Link to="/help">How to evaluate</Link><Link to="/evaluation-scorecard">98-item scorecard</Link><Link className={styles.navDemo} to={`/events/${eventSlug}/sessions`}>Open public demo →</Link></nav>
    </header>

    <section className={styles.entryHero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>Conference program operations · Live evaluation</p>
        <h1>From first proposal to the published program. No re‑entry.</h1>
        <p className={styles.entryLead}>ProgramFlow carries the same conference data through review, decisions, speaker onboarding, content, scheduling, and every attendee view.</p>
        <div className={styles.primaryEntryActions}>
          <Link className={styles.primaryAction} to={`/events/${eventSlug}/sessions`}>Explore the live program</Link>
          <Link to={`/cfp/${eventSlug}`}>Submit a proposal</Link>
        </div>
        <ul className={styles.heroProof} aria-label="Public demo proof">
          <li><strong>5 public views</strong><span>No account required</span></li>
          <li><strong>1 canonical program</strong><span>Sessions stay consistent</span></li>
          <li><strong>4 scoped roles</strong><span>Permissions enforced upstream</span></li>
        </ul>
      </div>
      <aside className={styles.programPreview} aria-labelledby="public-tour-title">
        <div className={styles.previewHead}><span><small>Public product tour</small><strong id="public-tour-title">DevFlow Conf 2027</strong></span><em>No account required</em></div>
        <div className={styles.previewRoutes}>
          <Link to={`/events/${eventSlug}/sessions`}><span>01</span><strong>Browse the published sessions</strong><small>Search, filters, details, and itinerary actions</small></Link>
          <Link to={`/events/${eventSlug}/speakers`}><span>02</span><strong>Follow the speaker directory</strong><small>Public profiles linked to approved sessions</small></Link>
          <Link to={`/events/${eventSlug}/agenda`}><span>03</span><strong>Inspect the current agenda</strong><small>Published dates, rooms, and times from program state</small></Link>
        </div>
        <Link className={styles.previewCta} to={`/events/${eventSlug}/agenda`}>Open the public agenda →</Link>
      </aside>
    </section>

    <section className={styles.lifecycleSection} aria-labelledby="lifecycle-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>One connected lifecycle</p><h2 id="lifecycle-title">Every handoff stays inspectable.</h2><small>Operational state moves forward; canonical people and program data do not get copied into parallel tools.</small></div></div>
      <ol className={styles.lifecycleRail}>
        <li><span>01</span><strong>Call</strong><small>Public form &amp; drafts</small></li>
        <li><span>02</span><strong>Review</strong><small>Scoped assignments</small></li>
        <li><span>03</span><strong>Decide</strong><small>Authoritative outcome</small></li>
        <li><span>04</span><strong>Onboard</strong><small>Tasks &amp; files</small></li>
        <li><span>05</span><strong>Schedule</strong><small>Conflicts &amp; revisions</small></li>
        <li><span>06</span><strong>Publish</strong><small>Agenda &amp; embeds</small></li>
      </ol>
    </section>

    <section className={styles.proofSection} aria-labelledby="proof-title">
      <div><p className={styles.eyebrow}>Production behavior, not a stage set</p><h2 id="proof-title">A green toast is not delivery.</h2><p>ProgramFlow keeps the receipt through every handoff. Organizer actions persist to PostgreSQL, while required side effects retain recipient, provider, file, calendar, integration, retry, and failure evidence. Provider success is shown only when a real provider returns it.</p><Link to="/evaluation-scorecard">View the current contract and 1:16 walkthrough →</Link></div>
      <dl><div><dt>Role boundaries</dt><dd>Organizer, reviewer, speaker, and anonymous routes are independently scoped.</dd></div><div><dt>Persisted handoffs</dt><dd>Acceptance creates a distinct linked Session; publication exposes approved scheduled records.</dd></div><div><dt>Truthful outcomes</dt><dd>Queued, delivered, blocked, partial, and failed states remain visible instead of collapsing into a success toast.</dd></div></dl>
    </section>

    <section className={styles.entrySection} aria-labelledby="public-entry-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>No sign-in required</p><h2 id="public-entry-title">Tour every attendee view</h2><small>All five published surfaces read the same approved, scheduled program.</small></div><Link to="/help">Evaluator help →</Link></div>
      <div className={styles.routeCards}>
        <RouteCard label="Call for speakers" detail="Branding, dates, tracks, formats, validation, and proposal entry." to={`/cfp/${eventSlug}`} />
        <RouteCard label="Sessions" detail="Searchable and faceted approved session cards." to={`/events/${eventSlug}/sessions`} />
        <RouteCard label="Speakers" detail="Alphabetized directory and linked session details." to={`/events/${eventSlug}/speakers`} />
        <RouteCard label="Agenda" detail="Published multi-day schedule by time and room." to={`/events/${eventSlug}/agenda`} />
        <RouteCard label="Itinerary" detail="Persistent anonymous personal schedule and calendar export." to={`/events/${eventSlug}/itinerary`} />
        <RouteCard label="Speaker gallery" detail="Mobile-friendly gallery with graceful profile fallbacks." to={`/events/${eventSlug}/gallery`} />
      </div>
    </section>

    <section className={styles.entrySection} aria-labelledby="persona-entry-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Privately supplied credentials</p><h2 id="persona-entry-title">Continue upstream by role</h2><small>Protected workspaces are conventional, discoverable, and intentionally limited.</small></div><Link to="/login">Standard sign in →</Link></div>
      <div className={styles.personaGrid}>
        <PersonaCard label="Organizer" detail="Full DevFlow operations workspace, evidence center, and release manifest." to="/login?next=%2Forganizer" />
        <PersonaCard label="Speaker" detail="Priya’s own submissions, profile, tasks, resources, sessions, and files." to={`/login?next=${encodeURIComponent(`/speaker/events/${eventSlug}`)}`} />
        <PersonaCard label="Reviewer" detail="Sam’s assigned review queue with organizer capabilities excluded." to={`/login?next=${encodeURIComponent(`/reviewer/events/${eventSlug}/reviews`)}`} />
      </div>
      <p className={styles.privateNote}>Use the matching email and password from the private evaluator configuration. Credentials, reset controls, provider secrets, and private evidence are never exposed in this anonymous page or source-controlled copy.</p>
    </section>
  </main>;
}

export function HelpPage() {
  return <main id="main-content" className={styles.helpPage}>
    <header className={styles.helpHero}>
      <Link className={styles.brand} to="/"><span>PF</span>ProgramFlow</Link>
      <p className={styles.eyebrow}>Evaluator help</p>
      <h1>A plain-language guide to ProgramFlow</h1>
      <p>ProgramFlow carries one conference program from a public proposal through review, acceptance, speaker onboarding, scheduling, and publication without re-entering the same data.</p>
      <div className={styles.primaryEntryActions}><Link className={styles.primaryAction} to={`/cfp/${eventSlug}`}>Start at the public CFP</Link><Link to={`/events/${eventSlug}/sessions`}>Tour the public program</Link></div>
    </header>
    <section className={styles.helpGrid}>
      <HelpStep number="01" title="Choose the right persona">Anonymous pages need no account. For protected work, sign in with the organizer, speaker, or reviewer credentials supplied privately. Each role is intentionally limited.</HelpStep>
      <HelpStep number="02" title="Follow the canonical thread">Submit a proposal, assign and complete a review, record a Decision, then inspect the distinct linked Session. Speaker, agenda, and public data should flow from those persisted records.</HelpStep>
      <HelpStep number="03" title="Reload after changes">Required workflow state is persisted. Reloading should retain drafts, decisions, task completions, file versions, placements, itineraries, and publication state.</HelpStep>
      <HelpStep number="04" title="Inspect real side effects">Organizer Communications and Integrations retain recipient outcomes, provider IDs, attempts, failures, and sync item receipts. A success message alone is not evidence.</HelpStep>
      <HelpStep number="05" title="Use the Evidence Center">After organizer sign-in, open <strong>Evaluation evidence</strong> in navigation. It maps all 20 scenarios to routes, state transitions, handoffs, evidence records, provider receipts, and the downloadable release manifest.</HelpStep>
      <HelpStep number="06" title="Keep reset operator-only">There is no anonymous reset action. In an authorized evaluation environment, the organizer-only Evidence Center shows the controlled snapshot-restore runbook and readiness checks.</HelpStep>
    </section>
    <section className={styles.helpScorecard}><div><p className={styles.eyebrow}>Current contract</p><h2>98 items · 202 weighted points</h2><p>See implementation coverage and fresh release verification as separate states, then watch the concise judge walkthrough.</p></div><Link to="/evaluation-scorecard">Open the public scorecard →</Link></section>
    <section className={styles.helpGlossary}><h2>Words that matter</h2><dl><div><dt>Submission</dt><dd>A draft or submitted proposal.</dd></div><div><dt>Decision</dt><dd>The sole accepted or rejected outcome.</dd></div><div><dt>Session</dt><dd>Accepted or manually entered program content, distinct from a Submission.</dd></div><div><dt>Publication</dt><dd>The sole event-level state exposing eligible program records publicly.</dd></div><div><dt>Evidence record</dt><dd>An inspectable link between a requirement, the exercised operation, and its artifact or test.</dd></div></dl></section>
  </main>;
}

function RouteCard({ label, detail, to }: { label: string; detail: string; to: string }) { return <Link className={styles.routeCard} to={to}><strong>{label}</strong><span>{detail}</span><em>Open →</em></Link>; }
function PersonaCard({ label, detail, to }: { label: string; detail: string; to: string }) { return <article className={styles.personaCard}><span>{label.slice(0, 2).toUpperCase()}</span><div><h3>{label}</h3><p>{detail}</p><Link to={to}>Sign in as {label.toLowerCase()} →</Link></div></article>; }
function HelpStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <article className={styles.helpStep}><span>{number}</span><div><h2>{title}</h2><p>{children}</p></div></article>; }
