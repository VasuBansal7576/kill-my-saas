import { Link } from "react-router-dom";
import styles from "./operations-evidence.module.css";

const eventSlug = "devflow-conf-2027";

export function EvaluationEntryPage() {
  return <main className={styles.entryPage}>
    <section className={styles.entryHero}>
      <div className={styles.brand}><span>PF</span>ProgramFlow</div>
      <p className={styles.eyebrow}>DevFlow Conf 2027 · Judge entry</p>
      <h1>Start with the live program. Follow the work upstream.</h1>
      <p className={styles.entryLead}>The public call and program require no account. Organizer, speaker, and reviewer workspaces use the private credentials supplied with the evaluation package.</p>
      <div className={styles.primaryEntryActions}>
        <Link className={styles.primaryAction} to={`/cfp/${eventSlug}`}>Open public call for speakers</Link>
        <Link to={`/events/${eventSlug}/sessions`}>Open live public program</Link>
      </div>
      <small className={styles.securityNote}>No evaluator password, reset control, provider secret, or private evidence is exposed on this page.</small>
    </section>

    <section className={styles.entrySection} aria-labelledby="public-entry-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>No sign-in required</p><h2 id="public-entry-title">Public DevFlow surfaces</h2></div><Link to="/help">Evaluator help →</Link></div>
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
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Privately supplied credentials</p><h2 id="persona-entry-title">Persona entry paths</h2></div><Link to="/login">Standard sign in →</Link></div>
      <div className={styles.personaGrid}>
        <PersonaCard label="Organizer" detail="Full DevFlow operations workspace, evidence center, and release manifest." to="/login?next=%2Forganizer" />
        <PersonaCard label="Speaker" detail="Priya’s own submissions, profile, tasks, resources, sessions, and files." to={`/login?next=${encodeURIComponent(`/speaker/events/${eventSlug}`)}`} />
        <PersonaCard label="Reviewer" detail="Sam’s assigned review queue with organizer capabilities excluded." to={`/login?next=${encodeURIComponent(`/reviewer/events/${eventSlug}/reviews`)}`} />
      </div>
      <p className={styles.privateNote}>Use the matching email and password from the private evaluator configuration. ProgramFlow intentionally does not publish credentials in source-controlled copy or anonymous HTML.</p>
    </section>
  </main>;
}

export function HelpPage() {
  return <main className={styles.helpPage}>
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
    <section className={styles.helpGlossary}><h2>Words that matter</h2><dl><div><dt>Submission</dt><dd>A draft or submitted proposal.</dd></div><div><dt>Decision</dt><dd>The sole accepted or rejected outcome.</dd></div><div><dt>Session</dt><dd>Accepted or manually entered program content, distinct from a Submission.</dd></div><div><dt>Publication</dt><dd>The sole event-level state exposing eligible program records publicly.</dd></div><div><dt>Evidence record</dt><dd>An inspectable link between a requirement, the exercised operation, and its artifact or test.</dd></div></dl></section>
  </main>;
}

function RouteCard({ label, detail, to }: { label: string; detail: string; to: string }) { return <Link className={styles.routeCard} to={to}><strong>{label}</strong><span>{detail}</span><em>Open →</em></Link>; }
function PersonaCard({ label, detail, to }: { label: string; detail: string; to: string }) { return <article className={styles.personaCard}><span>{label.slice(0, 2).toUpperCase()}</span><div><h3>{label}</h3><p>{detail}</p><Link to={to}>Sign in as {label.toLowerCase()} →</Link></div></article>; }
function HelpStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <article className={styles.helpStep}><span>{number}</span><div><h2>{title}</h2><p>{children}</p></div></article>; }
