---
title: Authoritative Clone Scope and Build Handoff
status: master-build-handoff
captured_eval_commit: d99935c3e3c6c50c6b9292220260ccfe2df6d6d4
application_status: no-code-yet
locked_prototype: ../prototype/kill-my-saas-ui-prototype.html
sources:
  - "[[01 Competition Brief — Exact Google Doc]]"
  - "[[02 Official Walkthrough — Exact Transcript]]"
  - "[[03 Evals — Complete Repository]]"
  - "[[05 Discord — High-Signal Coding Q&A]]"
---

# 09 Authoritative Clone Scope and Build Handoff

This is the single source of truth for planning and building the clone. It exists to prevent both failure modes: missing something the organizer or evaluator explicitly asks for, and inventing an unrelated product because it sounds useful.

## New-chat handoff — read this first

In a new coding chat, point the agent to **this file only** as the starting document. The agent must read this file completely, read the root `AGENTS.md`, and inspect the locked prototype at `../prototype/kill-my-saas-ui-prototype.html`. It must not reread or summarize the entire research vault unless a specific ambiguity requires opening one of the exact sources linked from this ledger.

Use this opening prompt in the new chat:

> Read `/Users/vasu/Desktop/Kill My Saas/Kill My SaaS Research Vault/09 Authoritative Clone Scope.md` completely, then read `/Users/vasu/Desktop/Kill My Saas/AGENTS.md` and inspect `/Users/vasu/Desktop/Kill My Saas/prototype/kill-my-saas-ui-prototype.html`. Treat the scope note as the product and evaluation contract and the prototype as the locked visual direction. Do not write code yet. First help me decide the architecture, domain model, repository structure, vertical-slice build order, testing strategy, and agent-safe implementation plan for V1.

Current state:

- There is **no application code yet**; the next chat is for planning before scaffolding.
- The research vault is evidence, not an implementation backlog.
- This file is the implementation backlog and scope authority.
- The locked prototype is the visual and interaction authority; functional requirements in this file override any mock-data shortcut in the prototype.
- If a coding agent cannot trace work to a V1 requirement, named bonus, release gate, or an explicitly approved technical foundation, it must stop rather than invent scope.

## Version boundary — authoritative

### V1 — competition-winning clone

V1 is not a reduced MVP. V1 must include:

1. **Every human-required item in section A**, including the items the automated evaluator does not emphasize: Accelevents handoff, resources/wiki with HTML embeds, speaker calendar delivery, named agenda views, portal behaviors, required form behavior, and competition delivery requirements.
2. **All 84 required automated rubric items in section B**, across all 18 required scenarios and all six weighted areas.
3. **All 12 optional Speaker CRM rubric items in section C**, because they are explicit extra credit.
4. **Every named competition bonus in section C that can earn points or materially affect human judging:** Cloudflare deployment, an Airtable synchronization/augmentation adapter without making Airtable the source of truth, Forge mirroring/hosting if available, exceptional performance, a usable public API, populated dashboard analytics, usable embed/share administration, the required low-depth scheduling assist, and a fully testable first-pass AI review with written reasoning plus persistent human override so conditional item ABS-14 can be deliberately claimed and passed.
5. **The complete manual-verification surface:** real email evidence, valid `.ics` files, exports, upload/download evidence, delivery/sync logs, cross-role and cross-reviewer isolation, third-party-origin embed rendering, and persisted state after reload.
6. **The locked product experience:** the Cursor-inspired charcoal palette, hairline borders, muted typography, semantic accents, task-oriented home queue, conventional labeled navigation, and task-specific workspaces represented by the locked prototype.
7. **A coherent golden path:** CFP → submission → review → decision → session/speaker handoff → onboarding/content → scheduling/conflict resolution → approval → all public surfaces → Accelevents/export evidence, with zero re-entry of canonical data.

V1 completion means every required and bonus item above has durable behavior and inspectable evidence; a decorative screen, fake toast, or unpersisted prototype interaction is not completion.

### V2 — post-contract differentiators

V2 begins only after the V1 release gate passes. It contains the advanced product ideas from the product/founder discussion that are useful but not required or explicitly bonus-scored:

- an advanced OR-Tools scheduling service with hard/soft constraints, travel/buffer/capacity/equipment rules, placement explanations, locked placements, regenerate-around-locks, and alternative-schedule comparison;
- live multi-user agenda collaboration, presence, and conflict-free editing;
- persistent undo/redo and broad rollback across workflows beyond the history/version behavior explicitly required in V1;
- cross-device attendee accounts, itinerary synchronization, calendar subscription feeds, and deeper Google/Outlook integrations beyond standards-compliant `.ics`;
- advanced scheduled communications, richer segmentation, automation journeys, and generalized retry orchestration beyond V1 evidence and delivery requirements;
- full webhook products, signed webhook delivery management, third-party integration marketplace, and API breadth beyond the V1 bonus API;
- deeper Airtable two-way synchronization and configurable conflict resolution beyond the V1 bonus adapter;
- AI review/content assistance beyond V1's narrow ABS-14 first-pass score, written reasoning, and persistent human override — for example model ensembles, automatic reviewer routing, deep content coaching, or autonomous decision workflows;
- organization-wide migration tooling, generalized importers, cross-event templates, white-labeling, managed hosting controls, support tooling, and commercial administration;
- audit logs, observability, analytics, and automation intelligence beyond the evidence, history, and populated views required by V1.

V2 must reuse the V1 domain model and must never weaken V1 role isolation, canonical-data consistency, or evaluator-friendly routes.

### Permanently out of scope unless the user changes the product thesis

Payments, ticketing/registration, multilingual support, sponsor/exhibitor suites, general-purpose sales CRM, broad marketing automation, SMS, native mobile applications, chat-only administration, and pixel-perfect SessionBoard imitation remain excluded; see sections D and F.

## Locked product and design decisions

- Product thesis: the fastest, clearest conference-program operating system from CFP to published agenda, not an all-in-one event platform.
- Four roles: organizer, speaker, reviewer, and anonymous attendee, with server-enforced scoping.
- Canonical promise: enter data once; every later stage links to or derives from that canonical data without re-entry.
- Home is an operational work queue, not a decorative analytics dashboard.
- Each module is a real tool: submissions inbox, evaluation desk, speaker workspace, deliverables operation, visual scheduler, communications center, resources editor, publishing studio, integration console, and organization-level Speaker CRM.
- The visual system is locked to the prototype; do not restart design exploration or reintroduce discarded variants unless the user explicitly asks.
- Conventional labels and routes are mandatory because both humans and the browser evaluator must discover every core workflow.

## Architecture invariants and decisions still to make

The next chat should decide the exact stack before writing application code, but it must preserve these invariants:

- Use a modular monolith with explicit domain boundaries unless a genuine isolation boundary requires a separate service.
- Use an authoritative relational database; Airtable is an integration/augmentation target, not the primary source of truth.
- Keep `Person`, event membership/role, reusable speaker profile, `Submission`, accepted `Session`, review plan/round/scorecard/assignment, task, deliverable/version, schedule placement, publication, communication, and integration run as distinct concepts.
- Acceptance creates a linked session and speaker/event records through a durable, observable transition; it does not overwrite a submission into a different entity.
- Enforce organizer, reviewer, speaker, and public authorization on the server, not only in navigation.
- Use durable object/file storage for uploads, deterministic `.ics` generation, an outbox/job model for side effects, and inspectable delivery/synchronization evidence.
- Optimize for strong transactional consistency across the evaluator's chained workflow before adding distributed-system complexity.

The planning chat must explicitly decide: frontend/runtime, API structure, PostgreSQL provider/connectivity, authentication, object storage, background jobs, email provider, Cloudflare topology, test layers, fixture/seed strategy, observability, deployment environments, and how the optional solver boundary will fit later.

## Coding-agent guardrails

1. Do not begin feature coding until the architecture, domain model, repository layout, migration approach, test strategy, and vertical-slice order are approved.
2. Every implementation task must name its brief requirement, rubric IDs, scenario(s), role(s), persistence behavior, and evidence/test that proves completion.
3. Build vertical slices through the real database and roles; do not create isolated front-end demos that cannot participate in the golden path.
4. Do not mark a requirement complete because a route, button, card, or toast exists; verify the state transition, reload persistence, permissions, downstream handoff, and public consistency where applicable.
5. Do not silently substitute mock email, fake exports, fake integrations, or in-memory state for a manual-verification requirement.
6. Preserve fixture compatibility and expose usable seeded organizer, speaker, speaker2, and reviewer credentials through the evaluator configuration. The captured eval repository contains inconsistent literal email sets across `fixtures/sample-data.json`, `fixtures/speakers.csv`, and scenario prose; treat those addresses as aliases for the same canonical fixture people, not as different people or roles, and document the exact configured credentials in submission notes.
7. V1 has priority over V2. A coding agent may not implement a V2 feature while a V1 contract item or release-gate proof is missing unless the user explicitly changes priority.
8. Keep the locked visual language and information architecture; implementation may deepen interactions but must not turn the product back into a generic card dashboard.
9. Prefer one owner/task per domain slice, small reviewable changes, and tests adjacent to the behavior; avoid broad parallel edits to shared schema, auth, or workflow-transition code.
10. When sources conflict or a requirement is ambiguous, stop and resolve it against this ledger and its cited primary source before coding.

## How to read this ledger

The sources do different jobs:

1. **The competition brief and walkthrough define the product the human buyer asked for.** A feature can be required for the human decision even when the automated evaluator does not score it. Sources: [[01 Competition Brief — Exact Google Doc#High Level Brief]] and [[02 Official Walkthrough — Exact Transcript]].
2. **The eval repository defines the current automated contract.** At captured commit `d99935c3e3c6c50c6b9292220260ccfe2df6d6d4`, it contains 84 required rubric items and 12 optional Speaker CRM items. Every rubric ID is inventoried below with its complete operative requirement; the authoritative pass/evidence instructions remain in `Attachments/Kill My SaaS Evals Repository/specs/*.yaml`. Source: [[03 Evals — Complete Repository]].
3. **Confirmed organizer answers in Discord resolve particular ambiguities.** A participant's unanswered question is not a requirement. Source: [[05 Discord — High-Signal Coding Q&A]]; exact messages remain in [[06 Discord — Raw Archive Index]].
4. **The eval `docs/` directory explains SessionBoard behavior, filled-state expectations, and research gaps, but it is not permission to treat every documented SessionBoard add-on as required.** Only an explicit brief requirement, rubric item, or confirmed organizer answer changes scope.
5. **Pixel fidelity is not a requirement. Functional fidelity is.** The evaluator is implementation-agnostic, and the organizer said the job-to-be-done matters more than copying screens. Sources: `Attachments/Kill My SaaS Evals Repository/README.md`, [[02 Official Walkthrough — Exact Transcript]], and [[05 Discord — High-Signal Coding Q&A#Usability Matters More Than Screenshot Copying]].

When sources appear to conflict, implement the union of explicit human requirements and all automated rubric behavior. “Optional” in a screenshot caption does not erase a required rubric item. Conversely, a feature found only in SessionBoard research does not become scope unless the brief or rubric asks for it.

## Non-negotiable product boundary

Build an open-source-capable **SessionBoard clone focused on the program lifecycle**, not a generic event platform: event setup → call for speakers → submissions → evaluation → decisions → accepted sessions/speakers → speaker onboarding and content → agenda → public program. The walkthrough explicitly says the team is “probably only going to use the program side,” not the marketing side or broad CRM side, and says the Google Doc's core functionality is what matters. Source: [[02 Official Walkthrough — Exact Transcript]] at 01:00–03:03 and 09:01.

“Clone” therefore means:

- preserve the requested entities, roles, states, cross-role permissions, handoffs, and public outputs;
- reproduce the named SessionBoard jobs well enough to replace it in actual work;
- do not require the same pixels, navigation labels, or internal architecture;
- do not silently replace an organizer UI with an agent/chat-only interface; that question was asked but no organizer answer was captured, while the evaluator explicitly navigates conventional organizer surfaces;
- do not omit a requested feature merely because it is expensive or time-consuming.

## A. Required by the brief or human judging

These requirements come directly from the buyer's brief, walkthrough, or competition delivery rules. They remain in scope even when no rubric ID covers them.

| Human requirement | Exact required behavior | Automated overlap | Source |
|---|---|---|---|
| Program-side lifecycle | Support applications/submissions, evaluation, acceptance, scheduling, speaker communication/onboarding, and public program output as one usable workflow. Session proposals/abstracts and confirmed sessions must remain distinct enough to support the handoff without re-entry. | CFP-05–16, ABS area, SPK area, CNT area, AIA-07, EMB-16 | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[02 Official Walkthrough — Exact Transcript]] 01:00–03:03 |
| Basic event configuration | Provide settings for basic event details sufficient to create and operate an event. The screenshots show event name/slug/type, website, location, timezone, start/end dates, description/theme, and logo/background branding as the reference baseline. The walkthrough says event details/settings should exist but exact fidelity “doesn't really matter”; exhibitor/sponsor toggles visible in the reference are not thereby made core scope. | CFP-S1 creates event name, dates, venue/location | [[01 Competition Brief — Exact Google Doc#Basic event config]]; [[02 Official Walkthrough — Exact Transcript]] 02:00–03:03 |
| Custom call-for-speakers forms | Organizer can build custom public submission forms with validation, conditional logic, and category-based routing. “Category-based routing” is named in the brief and must not be dropped merely because the rubric focuses mainly on track/format conditions. | CFP-01, CFP-02, CFP-03, CFP-04; ABS-03/05/06 cover downstream review configuration and routing-like assignment | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; `specs/01-call-for-papers.yaml` |
| Abstract/session form targeting and manual entry | A submission form can be configured to collect review-stage **abstracts** or full **sessions**, with optional participant/contact collection. Organizers can also manually add an abstract/session instead of requiring every record to originate from the public form; accepted/guaranteed sessions and review-stage applications remain distinct records/states. | CFP-15 covers abstract-to-session handoff; SPK-02 covers manual speaker entry, but manual abstract/session entry is not directly scored | [[01 Competition Brief — Exact Google Doc#Program > Submission Forms > Create]]; [[01 Competition Brief — Exact Google Doc#Program > Abstracts]]; [[02 Official Walkthrough — Exact Transcript]] 03:03–05:01 |
| Form operational settings | Include customizable welcome/title/instruction copy, abstract/session and participant questions, participant role labels and sensible min/max limits, close date/window, required-field validation, per-submitter submission limits, multiple draft submissions, customizable success/thank-you behavior, submitter confirmation email, and draft-reminder behavior shown/named in the walkthrough and annotated screenshots. A valid proposal must be possible with one speaker—the walkthrough explicitly rejects the accidental two-speaker minimum. English is sufficient. Admin alerts for new/updated submissions are nice-to-have, matching the screenshot annotation, while submitter confirmation is mandatory. | CFP-01–09, CFP-16; ABS-11; some named limits/copy controls are not directly scored | [[01 Competition Brief — Exact Google Doc#Program > Submission Forms > Create]]; [[01 Competition Brief — Exact Google Doc#Public CFP Page looks like this]]; [[02 Official Walkthrough — Exact Transcript]] 04:01–06:00 |
| Self-service speaker portal | Speakers manage bios, headshots, slides, and supporting documents; see submission/acceptance state; see their sessions and tasks; update their own biography/profile; and remain scoped to their own data. | CFP-13, SPK-07–12, CNT-01–05 | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[02 Official Walkthrough — Exact Transcript]] 06:00–08:02 |
| Speaker tasks and forms | After admission/acceptance, organizers can assign speaker tasks, including forms and file requests, and track completion. The transcript calls tasks “kind of optional” but the brief's primary portal/dashboard requirements and required eval items make the end-to-end task flow required. | SPK-05, SPK-09, SPK-12; CNT-01, CNT-02, CNT-07, CNT-08 | [[01 Competition Brief — Exact Google Doc#Portal > Tasks]]; [[01 Competition Brief — Exact Google Doc#Portal > Forms]] |
| Portal resources/wiki pages | Speaker portal contains resource and wiki pages, including HTML embed support for existing reference material. This is a named primary requirement even though no eval rubric item tests it. | None | [[01 Competition Brief — Exact Google Doc#High Level Brief]] |
| Automated templated communications | Templated speaker communications, personalized where applicable, including submission confirmation, decision messages, portal/onboarding invitation, bulk speaker communication, outstanding-task reminders, and logs/dispatch confirmation. | CFP-08, CFP-14, ABS-09, SPK-06, SPK-13, SPK-14, SPK-16, CNT-08 | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[02 Official Walkthrough — Exact Transcript]] 05:01–08:02 |
| Speaker calendar invitations | Calendar invites must be delivered to each speaker's own calendar and work with Gmail, Outlook, and iCal. Discord confirms a standards-compliant `.ics` is sufficient; separate Google/Outlook API integrations are not required. | EMB-11 only partially overlaps attendee personal-schedule calendar export; speaker invite delivery remains a human/manual requirement | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[05 Discord — High-Signal Coding Q&A#Standards-Compliant ICS Is Enough]] |
| Submission evaluation across rounds | Configure evaluation plans, assign conference-committee reviewers, collect scoring/comments, support multiple rounds, and provide decision workflow. AI assistance is optional; human review/scoring is not. | CFP-10–14 and ABS-01–14 | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[02 Official Walkthrough — Exact Transcript]] 07:01–08:02 |
| Agenda/schedule building | Drag-and-drop schedule and agenda building, accepted sessions placed into days/times/rooms/tracks, automatic conflicts, and organizer views by **list, day, week, track, and room**. Do not reduce the human requirement to the evaluator's minimum click-to-place grid. | AIA-01–07; AIA-08 covers assist | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[01 Competition Brief — Exact Google Doc#Program > Agenda]] |
| Automatic conflicts | Detect at least speaker double-booking and room overlap, visibly flag/block conflict, and clear the issue after resolution. The brief phrases this as conflicts “across rooms and tracks.” | AIA-04, AIA-05, AIA-06 | `specs/05-ai-agenda.yaml`; [[01 Competition Brief — Exact Google Doc#High Level Brief]] |
| Outstanding-onboarding dashboard | A real-time organizer dashboard identifies speakers with outstanding onboarding tasks. The screenshot section calls its broader dashboard examples “optional but nice to have,” but this specific outstanding-task dashboard is in the primary-feature list and is automated-eval required. | SPK-12 and CNT-07; CNT-08 adds filtered reminders | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[01 Competition Brief — Exact Google Doc#Dashboard (optional but nice to have, best efforts)]] |
| Native one-way Accelevents integration | One-way integration with the team's existing registration platform must eliminate manual data re-entry. This is a primary human requirement with no automated rubric item. Exact records, field mappings, authentication, and API availability are unresolved; do not silently substitute a generic “integration” badge. | None | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[05 Discord — High-Signal Coding Q&A#Useful Questions Without A Captured Organizer Answer]] |
| Public program surfaces | Publish accepted/approved, scheduled sessions and speakers as a useful public event display. Required surfaces named by the brief are List of Sessions, List of Speakers, Agenda, Schedule Itinerary, and Speaker Gallery. | EMB-01–16 | [[01 Competition Brief — Exact Google Doc#(IMPORTANT) Video Walkthrough platform & requirements]] |
| Embeddable mobile output | Speaker Gallery and Schedule Itinerary must be embeddable and mobile-friendly for the team's website. The evaluator additionally requires all five surfaces to be public and an organizer-side embed/share area. | EMB-09, EMB-12–16 | [[01 Competition Brief — Exact Google Doc#High Level Brief]] |
| Usability and performance | Product must be usable end to end, not a set of disconnected screenshots/forms; speed/performance receives explicit bonus attention, and SessionBoard's slowness is a stated reason to replace it. | Persistence, roundtrip, scoping, rule, and handoff rubric types collectively test this | [[02 Official Walkthrough — Exact Transcript]] 03:03–04:01 and 06:00–07:01; [[05 Discord — High-Signal Coding Q&A#Usability Matters More Than Screenshot Copying]] |
| Deployable open-source delivery | Submit a deployed site the judges can test through the walkthrough **and an open-source repository containing the code**. The Google Doc lists the open-source repo as part of submission, calls this an open-source clone the maker keeps, and the walkthrough repeats that they want the tool open source. Whatever later clarification says about enforcement, our release contract will deliver both deployment and accessible source; do not downgrade source release in planning. | Harness requires a URL; auth and populated state affect coverage | [[01 Competition Brief — Exact Google Doc#High Level Brief]]; [[01 Competition Brief — Exact Google Doc#Competition rules]]; [[02 Official Walkthrough — Exact Transcript]] 09:01 |
| Human product judgment | Tiebreaker goes to the submission whose subjective product decisions produce something the team would actually use/buy. This permits product sense to fill gaps; it does not permit omission of explicit scope or invention of unrelated modules. | Not a rubric ID | [[01 Competition Brief — Exact Google Doc#Competition rules]]; [[05 Discord — High-Signal Coding Q&A#Use Product Sense To Fill Gaps]] |

### Competition delivery and judging contract

These rules do not describe product features, but they are part of the primary-source contract and must remain visible in release planning.

| Rule | Authoritative primary-source statement |
|---|---|
| Submission deadline | Submit by **Wednesday, August 12, 2026 at 10:00 PM PT**. The brief frames a weekend as the target but explicitly allows more time up to this deadline. |
| Submission package | Complete the organizer's submission form when supplied, provide the open-source code repository, and provide a deployed site that can be tested using the walkthrough. |
| Independent evaluation | The winning submission must pass an independent evaluation by the AIE team, not swyx. |
| Human tiebreaker | If needed, preference goes to the product whose subjective decisions make it something the team would actually use or buy. |
| Prize | Winner receives **$10,000 cash**. |
| Winner follow-up | Winner joins a walkthrough/interview call for a write-up on latent.space. |
| Token reimbursement | People who submit a valid, genuine attempt may request reimbursement of up to **$500** in token cost, subject to proof and subjective validation of a real attempt; Codex Pro/Claude Max subscription usage is included. This is available to valid submitters, not only the winner. |

Source for every row: [[01 Competition Brief — Exact Google Doc#Competition rules]].

## B. Required by the automated evaluation — all 84 items

The required score is area-weighted: CFP 20%, Abstract Management 20%, Speaker Management 15%, Content Management 15%, AI Agenda 10%, Public Widgets 20%. Item weight (`w1`/`w2`/`w3`) ranks items within its area. `auto-partial` and `manual` items require evidence beyond what the browser can fully observe.

### Call for Papers — 16 items, area weight 20%, 34 item points

Source: `Attachments/Kill My SaaS Evals Repository/specs/01-call-for-papers.yaml` and `docs/01-call-for-papers.md`.

| ID | Weight | Type | Test | Required criterion |
|---|---:|---|---|---|
| CFP-01 | 3 | crud | auto | Organizer can build a custom submission form — adding fields of at least 3 types (short text, long text, dropdown) with required/optional flags — and the changes render on the public form with required-field validation enforced. |
| CFP-02 | 1 | depth | auto | Submission form supports conditional logic: a field configured to show only for a given session format (or track) appears and disappears based on the submitter's selection. |
| CFP-03 | 3 | exists | auto | A public CFP portal is reachable without any login and shows event branding/name, the submission deadline, and the configured tracks and formats as selectable options. |
| CFP-04 | 2 | rule | auto | The portal enforces the configured submission window: once the close date is in the past, the public portal blocks new submissions with a closed state. |
| CFP-05 | 3 | crud | auto | A speaker can create a submitter account from the portal, complete and submit a proposal, see an on-screen confirmation, and find the submission listed with a status in their own dashboard. |
| CFP-06 | 3 | roundtrip | auto | Submitted data round-trips to the organizer: the submission appears in the organizer's list with title, abstract, track, format, and custom-field values intact. |
| CFP-07 | 1 | depth | auto | The public form supports saving an in-progress submission as a draft (with as little as a title) and resuming it on return. |
| CFP-08 | 1 | side-effect | manual | Submitting a proposal triggers an automated confirmation email to the submitter referencing the submission. |
| CFP-09 | 2 | roundtrip | auto | A submitter can edit an existing submission while the CFP is open, and the edited content is what the organizer subsequently sees. |
| CFP-10 | 2 | scoping | auto | Organizer can provision a reviewer with usable credentials; the reviewer role has a reviewer-facing dashboard and no organizer/admin navigation or capability. Exact assigned-queue scoping is tested by ABS-05. |
| CFP-11 | 2 | roundtrip | auto | A reviewer can record a rating plus text comment on an assigned submission; the organizer sees it and the reviewer dashboard's completion state updates. Scorecard field-type depth is tested by ABS-03. |
| CFP-12 | 3 | crud | auto | Organizer can record accept and reject decisions on submissions, and the admin list reflects the distinct decision statuses. |
| CFP-13 | 2 | roundtrip | auto | Decision statuses propagate to the submitter: the speaker's dashboard reflects Accepted/Rejected for the corresponding proposals. |
| CFP-14 | 2 | side-effect | auto-partial | Platform can send or queue acceptance and rejection notification emails to decided submitters, with UI confirmation of dispatch. |
| CFP-15 | 2 | handoff | auto | An accepted submission becomes available as a session in the sessions/agenda area with title, speaker, and track intact, without data re-entry. |
| CFP-16 | 2 | rule | auto | Submission editing locks after the CFP close date: the speaker can no longer modify a submission once the call is closed. |

### Abstract Management — 14 items, area weight 20%, 28 item points

Source: `Attachments/Kill My SaaS Evals Repository/specs/02-abstract-management.yaml` and `docs/02-abstract-management.md`.

| ID | Weight | Type | Test | Required criterion |
|---|---:|---|---|---|
| ABS-01 | 3 | crud | auto | Organizer can configure an evaluation plan with two or more independent review rounds, each with its own name, open/close dates, and scorecard, and the configuration persists. |
| ABS-02 | 2 | scoping | auto | Review rounds can each have their own reviewer pool, so a reviewer scoped to round 1 is not automatically a reviewer for round 2. |
| ABS-03 | 3 | crud | auto | Scorecard editor supports numeric rating, dropdown, and free-text criteria; all three render for reviewers and store submitted values. |
| ABS-04 | 1 | depth | auto | Scoring criteria can carry weights and the per-submission aggregate reflects the weighting. The spec marks this behavior inferred because SessionBoard marketing references weighted criteria only for AI personas and does not specify aggregation. |
| ABS-05 | 3 | scoping | auto | Organizer can assign specific submissions to a specific reviewer, and that reviewer's queue contains exactly the assigned submissions and nothing else. |
| ABS-06 | 2 | bulk | auto | Assignment tooling works at scale through at least one functional mechanism: per-reviewer caps/limits, auto-distribution, or track-filtered bulk assignment. |
| ABS-07 | 2 | scoping | auto-partial | With anonymization enabled for a round, reviewer view hides author and co-author identity while organizer view of the same submission shows it. The manual half also requires a second reviewer to be unable to see another reviewer's scores or comments before submitting their own review. |
| ABS-08 | 2 | roundtrip | auto | A review progress dashboard shows per-reviewer completion counts or percentages that match actual review state in real time. |
| ABS-09 | 1 | bulk | auto-partial | Organizer can select reviewers with outstanding reviews and send them a bulk reminder from the progress/reviewer view. |
| ABS-10 | 3 | roundtrip | auto | Organizer sees an aggregate score per submission in a results table and can sort submissions by that score. |
| ABS-11 | 2 | crud | auto | Co-authors/co-presenters added at submission time persist with role labels and are visible in organizer-side review and results views. |
| ABS-12 | 1 | depth | auto | Reviewer can declare a conflict of interest or recuse themselves on an assigned submission. The spec explicitly marks this as inferred from peer-review category norms, not documented SessionBoard marketing. |
| ABS-13 | 2 | side-effect | auto-partial | Review scores and statuses can be exported to a downloadable CSV/XLSX file from results or reports. |
| ABS-14 | 1 | depth | auto-partial | **Only if the clone claims AI-assisted triage:** an AI evaluator produces a first-pass numeric score with written reasoning, and a distinguishable human override persists. |

### Speaker Management — 16 items, area weight 15%, 33 item points

Source: `Attachments/Kill My SaaS Evals Repository/specs/03-speaker-management.yaml` and `docs/03-speaker-management.md`.

| ID | Weight | Type | Test | Required criterion |
|---|---:|---|---|---|
| SPK-01 | 3 | exists | auto | Organizer speaker roster lists all speakers with identity information and supports search or filtering. |
| SPK-02 | 3 | crud | auto | Organizer can add a speaker with profile fields and organizer edits persist. |
| SPK-03 | 2 | bulk | auto | Speakers can be bulk-imported from a CSV file. |
| SPK-04 | 2 | crud | auto | Speakers carry a workflow status that can be changed, persists, and is filterable. |
| SPK-05 | 2 | crud | auto | Organizer can create general/action tasks with due dates and assign them to multiple speakers. File requests/uploads/deliverables are owned by CNT-01/02/07. |
| SPK-06 | 2 | side-effect | auto-partial | Organizer can send a speaker a portal invitation or onboarding email. |
| SPK-07 | 3 | scoping | auto-partial | Each speaker gets a personalized portal scoped to only their own content. |
| SPK-08 | 3 | roundtrip | auto | Speaker can update bio, social links, and headshot from the portal, and changes appear on the organizer's record. |
| SPK-09 | 2 | crud | auto | Assigned general tasks appear in the speaker portal with due dates and can be marked complete with persistent status. File-request upload is tested by CNT-02. |
| SPK-10 | 2 | roundtrip | auto-partial | Organizer can see and download a speaker-uploaded deliverable with metadata. |
| SPK-11 | 2 | roundtrip | auto | Session assignments are visible on the organizer's speaker record and in the speaker's portal. |
| SPK-12 | 2 | roundtrip | auto | A progress view shows per-speaker completion of general tasks at list level and reflects portal completions. Deliverables dashboard depth is CNT-07. |
| SPK-13 | 2 | bulk | auto-partial | Organizer can send a general bulk email to a selected/filtered speaker group and the send is logged. Outstanding-deliverables reminders are CNT-08. |
| SPK-14 | 1 | depth | auto | Email templates with merge fields personalize content per recipient. |
| SPK-15 | 1 | depth | auto | Speaker records can store travel-preference or custom logistics fields that persist. |
| SPK-16 | 1 | side-effect | manual | Automated reminder emails go to speakers with incomplete tasks based on due dates. |

### Content Management — 14 items, area weight 15%, 31 item points

Source: `Attachments/Kill My SaaS Evals Repository/specs/04-content-management.yaml` and `docs/04-content-management.md`.

| ID | Weight | Type | Test | Required criterion |
|---|---:|---|---|---|
| CNT-01 | 3 | crud | auto | Organizer can create a file-request task with instructions and a due date, assigned to speakers. |
| CNT-02 | 3 | crud | auto | Speaker portal lists the speaker's assigned tasks with deadlines and accepts a file upload recorded against the task/session. |
| CNT-03 | 3 | scoping | auto | Speaker access is scoped to their own sessions and tasks, and organizer/admin views are blocked for speaker accounts. |
| CNT-04 | 2 | rule | auto | Re-uploading a deliverable creates a new file version, latest is clearly marked, and previous versions remain accessible. |
| CNT-05 | 2 | roundtrip | auto | Comments attach to an uploaded file, are logged with author and timestamp, and are visible across roles. |
| CNT-06 | 1 | depth | auto | Upload UI communicates accepted types and/or maximum file size at the point of upload. |
| CNT-07 | 3 | roundtrip | auto | A deliverables dashboard tracks per-speaker/per-task status with due dates, supports filtering, and reflects uploads. |
| CNT-08 | 2 | bulk | auto-partial | Organizer can trigger bulk reminder emails to speakers with outstanding tasks and receives send confirmation. |
| CNT-09 | 2 | crud | auto | Organizer can edit a session's title and abstract from a central admin view and changes persist. |
| CNT-10 | 2 | crud | auto | Organizer can edit speaker bio text and headshot from the admin area and changes persist. |
| CNT-11 | 2 | depth | auto | Content edits are recorded in version/change history with editor attribution and timestamps, and a prior version can be restored. |
| CNT-12 | 3 | rule | auto | Sessions carry organizer-controlled content approval/review status, and unapproved content is excluded from public agenda output. Public rendering itself is EMB-06. |
| CNT-13 | 1 | exists | auto | A central files library aggregates uploads across sessions with metadata including session/speaker, date, and versions; a per-session files tab may additionally exist. |
| CNT-14 | 2 | bulk | auto-partial | Organizer can multi-select sessions/files and generate a bulk ZIP download of latest file versions, with grouping options if offered. |

### AI Agenda and Schedule Builder — 8 items, area weight 10%, 18 item points

Source: `Attachments/Kill My SaaS Evals Repository/specs/05-ai-agenda.yaml` and `docs/05-ai-agenda.md`. Despite the area name, the brief says “less so but cover the basics,” and the walkthrough says it does not care about the AI workflow. AIA-08 is nevertheless a required, low-weight eval item and accepts any one-action auto-place assist.

| ID | Weight | Type | Test | Required criterion |
|---|---:|---|---|---|
| AIA-01 | 3 | exists | auto | Agenda/schedule builder exists for a multi-day event, showing a time dimension plus rooms and/or tracks in a grid, timeline, or per-day slot list with day navigation. |
| AIA-02 | 2 | crud | auto | Rooms and tracks are organizer-configurable, and a newly added room and track immediately become usable in the agenda builder. |
| AIA-03 | 3 | crud | auto | An unscheduled session can be placed into a specific day/time/room slot, and placement persists across reload. |
| AIA-04 | 3 | rule | auto | Scheduling the same speaker into overlapping sessions produces a visible double-booking warning. |
| AIA-05 | 2 | rule | auto | Placing two sessions in the same room at overlapping times is blocked or visibly flagged. |
| AIA-06 | 2 | rule | auto | A scheduled session can move to another slot/room, the change takes effect, and prior conflict indicators clear after overlap is removed. |
| AIA-07 | 2 | handoff | auto | Agenda has a publish/go-live action that reports success and hands scheduled session data to the public/attendee-facing surface. Public schedule rendering is EMB-06. |
| AIA-08 | 1 | depth | auto | Some assisted or automatic scheduling capability places unscheduled sessions into slots in one action; the evaluator generously accepts any auto-place assist as “AI.” |

### Public and Embeddable Widgets — 16 items, area weight 20%, 34 item points

Source: `Attachments/Kill My SaaS Evals Repository/specs/06-public-widgets.yaml` and `docs/06-public-widgets.md`.

| ID | Weight | Type | Test | Required criterion |
|---|---:|---|---|---|
| EMB-01 | 3 | exists | auto | Public Sessions List renders a card per session with title, truncated description plus Show more, date/time, room, speaker names with job title/company, and Format/Track tags. |
| EMB-02 | 2 | rule | auto | Sessions List keyword search matches both session titles and speaker names, narrows cards, and updates any result count. |
| EMB-03 | 2 | rule | auto | Sessions List has faceted filtering at minimum by Track, ideally also Format and Location, and selections narrow the list correctly. |
| EMB-04 | 3 | exists | auto | Public Speakers List shows a surname-alphabetized directory with headshot, name, job title, and company per entry. |
| EMB-05 | 2 | roundtrip | auto | Each Speakers List entry opens a detail view with bio and sessions (title, date/time, room), and the directory supports speaker-name search. |
| EMB-06 | 3 | exists | auto | Public Agenda renders a per-day schedule organized by time, with room/location structure and session blocks placed at correct room/time showing at least title and track/format. |
| EMB-07 | 2 | rule | auto | Agenda day navigation switches event days and re-renders that day's sessions. |
| EMB-08 | 2 | exists | auto | Clicking an agenda session opens detail with full start/end range, room, description, Format, and Track; Back/close restores agenda. |
| EMB-09 | 2 | exists | auto | Public Schedule Itinerary lists sessions chronologically within day tabs/sections; cards show track, title, description, full date/time, room, and complete speaker list with titles/companies. |
| EMB-10 | 1 | depth | auto | Attendee can add/star sessions from the itinerary and view a personal schedule containing exactly the chosen sessions. The eval docs mark this as inferred category-norm behavior, not observed in SessionBoard's live itinerary. |
| EMB-11 | 1 | depth | auto-partial | Personal schedule persists across full reload, and export/add-to-calendar is offered. Calendar-file correctness/cross-visit durability requires manual verification. |
| EMB-12 | 2 | exists | auto | Public Speaker Gallery renders a surname-alphabetized photo grid with headshot/name/job title/company, speaker-name search, and graceful missing-photo/title fallback. |
| EMB-13 | 1 | exists | auto | Gallery card opens speaker detail with photo, name, title, bio plus Show more, company, and sessions with title/date/time/room; closing returns to intact grid. |
| EMB-14 | 3 | scoping | auto | All five surfaces — sessions list, speakers list, agenda, schedule itinerary, speaker gallery — are publicly reachable and fully readable without login. |
| EMB-15 | 2 | handoff | auto-partial | Organizer embed/share area generates an embeddable snippet or shareable URL for each widget type, with branding/colors, content filters, and field selection. For full credit it supports multiple output formats — styled HTML/script, basic HTML, JSON, XML, and iCal — and the styled embed must manually prove that it renders live, configured, interactive data from a different origin; any offered JSON/XML/iCal outputs must contain/import the approved event data correctly. |
| EMB-16 | 3 | roundtrip | auto-partial | Widget data is consistent across surfaces and organizer source: same session has identical title/date/time/room/track everywhere and matches organizer record without republishing. |

## C. Optional, extra-credit, or bonus requirements

These can improve the score or human preference but do not replace any required item above.

### Speaker CRM — all 12 optional eval items

Speaker CRM is explicitly `optional: true`, adds two optional scenarios and 19 item points, and lives at organization level across events. It is not the per-event speaker roster required by SPK-01–16. Source: `Attachments/Kill My SaaS Evals Repository/specs/07-speaker-crm.yaml` and `docs/07-speaker-crm.md`.

| ID | Weight | Type | Test | Required criterion |
|---|---:|---|---|---|
| CRM-01 | 3 | exists | auto | An organization-level speaker directory exists outside any single event, listing contacts across events in a searchable table. |
| CRM-02 | 2 | rule | auto | Multi-criteria filter narrows directory by company, job title, tags, or similar attributes, and filters are clearable. |
| CRM-03 | 2 | roundtrip | auto | Contact profiles show identity fields plus persistent internal notes and cross-event history through linked events/sessions and/or activity log. |
| CRM-04 | 1 | depth | auto | Contacts support persistent organizer-defined metadata through custom fields or tags. |
| CRM-05 | 2 | bulk | auto | Contacts can be bulk-imported from CSV, and imported rows appear in the directory. |
| CRM-06 | 1 | depth | auto | Near-duplicate contacts with same name/different email are surfaced and can be merged into one chosen primary record. |
| CRM-07 | 2 | crud | auto | Kanban sourcing pipeline with open-to-won/lost lifecycle lets contacts enroll and move between stages, persisting across reload. |
| CRM-08 | 1 | depth | auto | Pipeline cards open to detail with internal notes and timestamped stage-transition history. |
| CRM-09 | 1 | depth | auto | Filtered directory view can be saved as a named reusable segment/list and reopened with its members. |
| CRM-10 | 2 | handoff | auto | A contact can be pushed from org-level database into a specific event and appears in event speakers/contacts with profile data intact. |
| CRM-11 | 1 | bulk | auto-partial | Bulk email can be composed to selected contacts, ideally with template/merge personalization and preview, and the send is confirmed/logged. |
| CRM-12 | 1 | depth | auto | CRM dashboard shows organization-wide speaker-database metrics and at least one populated analytics widget. |

### Brief/competition bonuses

| Bonus | Classification | Exact scope |
|---|---|---|
| Cloudflare infrastructure | Mild bonus / nice-to-have | The brief says “mild bonus”; Discord says it is optional and other services are acceptable. Do not call it mandatory. Source: [[01 Competition Brief — Exact Google Doc#Competition rules]]; [[05 Discord — High-Signal Coding Q&A#Cloudflare Is Optional]]. |
| Airtable persistence | Bonus / no penalty if omitted | Brief awards bonus for persistence/DB using Airtable. Discord says no Airtable is “not a minus,” though the team values direct augmentation of data in Airtable. Exact read/write/source-of-truth behavior remains inadequately specified. Source: [[01 Competition Brief — Exact Google Doc#Competition rules]]; [[05 Discord — High-Signal Coding Q&A#Airtable Is Bonus-Level, Not Required]]. |
| Forge hosting | Very small bonus | Hosting source/site on Forge rather than GitHub is explicitly “very teeny” bonus. Source: [[01 Competition Brief — Exact Google Doc#Competition rules]]. |
| Speed/performance | Bonus and product-quality signal | Fast admin and public workflows are explicitly rewarded; SessionBoard slowness is a core complaint. Source: [[01 Competition Brief — Exact Google Doc#Competition rules]]; [[02 Official Walkthrough — Exact Transcript]]. |
| API | Bonus | A usable API is explicitly bonus-scored. The brief links SessionBoard's API introduction but does not prescribe endpoint parity. Source: [[01 Competition Brief — Exact Google Doc#Competition rules]]. |
| General dashboard analytics | Optional/best efforts beyond task-completion requirements | The screenshot dashboard section is optional. Do not confuse it with the required outstanding-task/progress views SPK-12 and CNT-07. Source: [[01 Competition Brief — Exact Google Doc#Dashboard (optional but nice to have, best efforts)]]. |
| Exact SessionBoard-style embed administration UI | Optional visual/reference implementation, but required outcome | Brief labels CMS embed screenshots optional, while the underlying public surfaces and EMB-15 embed/share outcome are required. Copying the exact CMS screen is optional; generating usable embeds/share URLs is not. Source: [[01 Competition Brief — Exact Google Doc#CMS > Embeds (OPTIONAL)]]; EMB-15. |
| AI-assisted submission review | Optional unless claimed | Brief calls AI-assisted review optional; ABS-14 applies only if the clone claims it. Human review across rounds is required. |
| Deeper AI agenda intelligence | Deprioritized | Brief says AI agenda “less so but cover the basics,” walkthrough says it does not care about the AI workflow, and only AIA-08 asks for a low-weight one-action assist. Advanced constraint reasoning is not required. |
| Admin users/team entry | Walkthrough optional | Walkthrough says entering admins is optional and asks only for rough format. Evaluator still needs an organizer/admin identity and role separation, but a comprehensive team-permissions suite is not requested. Source: [[02 Official Walkthrough — Exact Transcript]] 05:01. |

## D. Explicitly unnecessary or de-scoped

Do not spend scope on these before the full required ledger is correct.

| De-scoped item | Evidence |
|---|---|
| Submission payments/payment gateways | Walkthrough: “we don't really care about payment, so you can skip this one.” Source: [[02 Official Walkthrough — Exact Transcript]] 05:01. |
| Multilingual product/form localization | Walkthrough: “We only care about English.” Source: [[02 Official Walkthrough — Exact Transcript]] 05:01. |
| Pixel-perfect SessionBoard design clone | Brief says exact design is not required; evaluator grades functionality and filled-state expectations, not pixels. |
| Marketing suite/marketing automation | Walkthrough explicitly says the team is not really using the marketing side. |
| Broad/general CRM as core | Walkthrough says the team is not really using the CRM side. Only the explicitly optional Speaker CRM rubric is relevant. |
| Deep Google Calendar/Outlook calendar API integrations | Discord says standards-compliant ICS is good enough. |
| Mandatory Airtable | Discord says omitting it is not a minus. |
| Mandatory Cloudflare | Discord says it is a nice-to-have and other services are acceptable. |
| AI-first or agent-only organizer interface | No source asks for it; an unanswered Discord question cannot replace the conventional organizer workflows exercised by all required scenarios. An assistant can be additive only after the required UI works. |
| Full SessionBoard add-on suite | Eval docs list adjacent sponsors/exhibitors, awards, Studio, marketing, SMS, SSO, Zapier, and other integrations as surrounding product surface, not challenge core. Do not infer requirement from their presence in research docs. Source: `Attachments/Kill My SaaS Evals Repository/docs/00-how-sessionboard-works.md`. |

## E. Unanswered or ambiguous — decide deliberately, do not claim organizer confirmation

| Question/gap | What is authoritative now |
|---|---|
| What exactly does “category-based routing” route? | Brief requires it, but does not say whether categories change fields, route to reviewer pools, or both. CFP-02 proves conditional rendering; ABS-05/06 prove assignment tooling. Implement a coherent category/track-to-form/reviewer flow and document the decision. |
| Exact Accelevents records and field mappings | One-way native integration that avoids re-entry is required; API credentials, target objects, fields, failure policy, and whether a mock is acceptable were asked but not answered. Do not invent “two-way sync” as required. |
| Are acceptance handoffs automatic or explicit? | CFP-15 requires accepted data to become a session without re-entry, but allows an explicit convert/move action. Human brief cares about the outcome, not whether the transition is automatic. |
| Must admin UI exist if an agent interface exists? | No captured organizer answer. Automated scenarios rely on navigable organizer/admin areas, so conventional UI is the safe requirement; agent control can be additive. |
| Co-speaker accounts and permissions | ABS-11 requires co-author names/roles to persist in organizer review/results. Separate portal accounts for every co-speaker were asked but not confirmed. SPK/CNT scoping must still be correct for each provisioned speaker identity. |
| Rich-text support in descriptions, bios, welcome messages | SessionBoard research documents some rich text, but no challenge/rubric item universally requires a rich-text editor. Preserve readable formatting where necessary; do not treat a particular editor as mandatory. |
| Accept Queue/Decline Queue semantics | Eval docs describe SessionBoard staging states, but required rubric asks Accepted/Rejected decisions, not exact five-stage vocabulary. Use useful staging if implemented; do not mistake it for a hard label requirement. |
| When can reviewers see other reviewers' scores/comments? | ABS-07's manual half requires a second reviewer to be unable to see another reviewer's scores or comments before submitting their own review. Enforce that pre-submission isolation. Post-submission peer visibility is not specified; default to keeping peer reviews hidden unless the organizer deliberately configures a later reveal policy. |
| Which evaluator fixture email set is canonical? | The captured repo is internally inconsistent: `fixtures/sample-data.json` uses `sbek-*@example.com`, several scenarios name role-specific `*@sbek-test.example.com` addresses, and `fixtures/speakers.csv` uses another role-specific set. Define one canonical seeded login per persona, supply it through evaluator `credentials`/`personaEmails`, and link the scenario-literal and CSV addresses as aliases to the intended fixture people so data does not fork. |
| Do unfinished drafts count toward submission limits? | No confirmed answer and no rubric criterion. |
| Exact media-upload handling and file constraints | CNT-06 requires communicating accepted types and/or max size; exact media processing/transcoding is unspecified. |
| Portal wiki HTML safety model | HTML embed support is human-required, but allowed HTML, sanitization, roles, and hosting rules are unspecified. Implement a safe, useful policy and document it. |
| Open-source as hard gate | Brief's submission list asks for an open-source repo; later Discord says it is not a hard requirement but the team wants to use winning code. Deliver accessible source to satisfy both without calling Discord's answer a hard gate. |
| Airtable architecture | Bonus is clear; source-of-truth vs synchronization and two-way mutation are not consistently specified. Do not weaken core correctness based on assumptions. |

The exact unconfirmed questions are preserved in [[05 Discord — High-Signal Coding Q&A#Useful Questions Without A Captured Organizer Answer]].

## F. Not requested — avoid scope creep

The following are not challenge requirements unless a later authoritative source changes scope:

- attendee registration or ticketing; Accelevents remains the existing registration platform;
- payment processing, invoicing, promo codes, VAT, refunds, or speaker fees;
- sponsor/exhibitor management, booths, awards, or general event marketing automation;
- generic sales CRM, lead scoring, deals, revenue pipeline, or customer support desk;
- native iOS/Android applications; the requirement is mobile-friendly web embeds;
- two-way Accelevents synchronization;
- separate Google Calendar and Microsoft Graph integrations beyond valid ICS;
- SMS messaging;
- multilingual/localization support beyond English;
- a pixel-for-pixel SessionBoard clone;
- microservices, real-time collaboration, audit logs everywhere, undo/redo everywhere, OR-Tools constraint optimization, room-capacity/equipment/travel constraints, speaker substitutions, schedule comparison, or explainable AI — none is required unless it directly implements a named rubric criterion;
- public API parity with SessionBoard; an API earns bonus, but endpoint parity is not specified;
- features mentioned only in vendor marketing/research but absent from the brief and rubric.

These may be considered only after every required human item and all 84 required rubric items are demonstrably complete.

## Automated evaluation operating contract

The evaluator runs 96 rubric items across 20 scenarios and seven areas. Required run is 18 scenarios/84 items/178 item points; optional CRM adds 2 scenarios/12 items/19 item points. Source: `Attachments/Kill My SaaS Evals Repository/README.md`.

### All 20 scenarios

| Area | Scenario | Starting identity | Stateful job |
|---|---|---|---|
| CFP | CFP-S1 | Organizer | Build and publish CFP |
| CFP | CFP-S2 | Speaker | Draft, submit, and edit proposals |
| CFP | CFP-S3 | Organizer, then reviewer | Assign reviewer and score |
| CFP | CFP-S4 | Organizer | Decide, notify, hand off, close CFP |
| Abstracts | ABS-S1 | Speaker | Seed submissions with co-author |
| Abstracts | ABS-S2 | Organizer | Configure rounds, pools, assignments, reminders |
| Abstracts | ABS-S3 | Reviewer, then organizer | Score blind; verify aggregates/export |
| Speakers | SPK-S1 | Organizer | Build roster and assign onboarding tasks |
| Speakers | SPK-S2 | Speaker | Complete onboarding in portal |
| Speakers | SPK-S3 | Organizer | Track progress and send bulk communications |
| Content | CNT-S1 | Organizer | Set up content collection |
| Content | CNT-S2 | Speaker | Upload and version deliverable |
| Content | CNT-S3 | Organizer | Track, review, approve, export |
| Agenda | AIA-S1 | Organizer | Configure, place, trigger and resolve conflicts |
| Agenda | AIA-S2 | Organizer | Auto-schedule assist and publish |
| Public | EMB-S1 | Logged-out attendee | Tour four browse widgets |
| Public | EMB-S2 | Logged-out attendee | Itinerary and personal schedule |
| Public | EMB-S3 | Organizer | Generate embeds and verify consistency |
| Optional CRM | CRM-S1 | Organizer | Build and organize cross-event speaker database |
| Optional CRM | CRM-S2 | Organizer | Source through pipeline and reuse across events |

### Evaluation mechanics that affect product correctness

- Areas run in order and reuse state: CFP submissions become reviewed abstracts; accepted talks become sessions; sessions/speakers receive onboarding and files; scheduled/approved records feed public widgets.
- Verdicts are `pass` = 1, `partial` = 0.5, `fail`/`not_found` = 0; `cannot_judge` is excluded and sent to manual review.
- Overall score is the area-weighted mean of required areas; Speaker CRM is optional extra credit.
- Coverage is reported separately. Below **60% coverage**, the headline score is withheld as “insufficient coverage.”
- Manual verification covers real email delivery, exports/calendar files, multi-user visibility, and anything the browser could not prove.
- Magic-link/OAuth-only personas require pre-authentication because the browser agent has no inbox. The safest evaluation path exposes usable seeded organizer, speaker, and reviewer credentials while still enforcing real role boundaries.
- The evaluator tries obvious routes and labels such as `/admin`, `/dashboard`, `/organizer`, Call for Papers, Submissions, Reviewers, Agenda, Speakers, and public widget links. Do not hide core scope behind unlabeled icons or a chat-only interface.
- Fixture data is `DevFlow Conf 2027`, 2027-05-12 through 2027-05-14, Moscone West in San Francisco; organizer Jordan Alvarez, speaker Priya Raman, reviewer Sam Whitfield; three named tracks and five named formats. Exact scenario steps and values live in the spec files and must be used for pre-eval testing.
- Fixture email compatibility needs an explicit adapter: the JSON fixtures, CSV fixture, and literal scenario instructions do not use one consistent address for each named person. Configure the evaluator with the canonical seeded accounts and resolve/import the alternate fixture addresses onto the same `Person` records without collapsing distinct roles or granting broader access.
- The evaluator requires persistent state across reloads, strict role/scoping enforcement, round trips between roles, and module handoffs. A screen that only looks correct is insufficient.

## Release gate

A feature is not “covered” until its full required behavior can be demonstrated through the same stateful chain the evaluator and buyer use. Before adding unrequested product ideas, verify:

1. every item in section A works in a human walkthrough, especially Accelevents, resources/wiki HTML embeds, calendar invitations, exact named agenda views, mobile-friendly public output, and the outstanding-task dashboard;
2. every ID in section B has concrete automated or manual evidence;
3. every manual/auto-partial side effect has inspectable proof, not a decorative “sent” toast — including the second-reviewer isolation check, real email bodies, valid downloaded/uploaded files, exact export contents, calendar imports, external-origin interactive embed rendering, and live widget propagation without re-embedding;
4. all five public surfaces derive from the same accepted, approved, scheduled records;
5. optional items are labeled optional and never displace missing required behavior;
6. anything not in this ledger is treated as scope creep until traced to a source.

Related: [[00 Start Here — Kill My SaaS]] · [[01 Competition Brief — Exact Google Doc]] · [[02 Official Walkthrough — Exact Transcript]] · [[03 Evals — Complete Repository]] · [[05 Discord — High-Signal Coding Q&A]] · [[08 Build Requirements Crosswalk]]
