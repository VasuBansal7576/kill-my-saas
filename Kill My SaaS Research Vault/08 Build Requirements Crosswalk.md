---
document_type: derived_synthesis
derived_from:
  - "[[01 Competition Brief — Exact Google Doc]]"
  - "[[02 Official Walkthrough — Exact Transcript]]"
  - "[[03 Evals — Complete Repository]]"
  - "[[04 Sessionboard — Product Reference Library]]"
  - "[[05 Discord — High-Signal Coding Q&A]]"
created_at: 2026-08-09
---

# 08 Build Requirements Crosswalk

> [!warning] Derived guidance
> This is a coding-agent navigation aid, not an exact source. When it conflicts with the brief, transcript, Discord quotes, eval repository, or [[09 Authoritative Clone Scope]], follow the exact source and the authoritative scope ledger—especially the eval specification that will grade the deployed product.

## Product Job To Be Done

An event team needs one connected lifecycle:

`CFP form → speaker submission → reviewer evaluation → accept/decline → speaker onboarding → content collection → agenda scheduling → public program widgets`

The important word is connected. The evaluator explicitly chains state from earlier areas into later ones. Screens that exist but do not exchange persisted data will lose round-trip, handoff, rule, and scoping points.

## Required Evaluation Areas

| Priority | Area | Overall weight | What the working product must demonstrate | Exact evaluation source |
|---|---|---:|---|---|
| Required | Call for Papers | 20 | Organizer creates/publishes a configurable CFP; speaker drafts, submits, receives confirmation, and edits; reviewer access and accept/reject handoff work | [[Attachments/Kill My SaaS Evals Repository/specs/01-call-for-papers.yaml]] |
| Required | Abstract Management | 20 | Review plans, assignment/scoping, rating/comment workflows, multiple-round depth, aggregate results, and staged disposition/notification | [[Attachments/Kill My SaaS Evals Repository/specs/02-abstract-management.yaml]] |
| Required | Speaker Management | 15 | Speaker/contact records, session assignment, portal access, tasks/resources, profile/headshot management, and role isolation | [[Attachments/Kill My SaaS Evals Repository/specs/03-speaker-management.yaml]] |
| Required | Content Management | 15 | File requests and uploads, session content types, versions/history, approval, comments, and correct visibility gates | [[Attachments/Kill My SaaS Evals Repository/specs/04-content-management.yaml]] |
| Required | AI Agenda | 10 | Multiple agenda views, session placement, drag/drop or equivalent scheduling, persistence, track/room handling, and speaker/room conflict detection; AI basics | [[Attachments/Kill My SaaS Evals Repository/specs/05-ai-agenda.yaml]] |
| Required | Public Widgets | 20 | Anonymous sessions, speakers, agenda, itinerary, and gallery views; search/filter/detail; public/admin consistency; embed/share generation | [[Attachments/Kill My SaaS Evals Repository/specs/06-public-widgets.yaml]] |
| Optional | Speaker CRM | Extra credit | Cross-event directory, CSV import, search/filter/segments, notes/history, duplicate handling, outreach, and event handoff | [[Attachments/Kill My SaaS Evals Repository/specs/07-speaker-crm.yaml]] |

## Cross-Cutting Behaviors That Separate A Product From A Mockup

From the evaluator's problem-type taxonomy:

- `crud`: a create/edit action persists after reload.
- `roundtrip`: another role or screen sees the same data that was written.
- `rule`: deadlines, conflicts, filters, and approval gates are actually enforced.
- `scoping`: each role sees exactly its permitted records and actions.
- `bulk`: imports, bulk assignment/email, and exports handle multiple records.
- `side-effect`: email and calendar artifacts really leave the browser or can be manually verified.
- `handoff`: accepted proposals become sessions, scheduled sessions become public program content, and data is not manually re-entered.

Coding agents should test these behaviors explicitly; merely rendering the corresponding button or page is insufficient.

## Source Crosswalk By Workflow

### 1. CFP And Submission

- Brief/screenshots: [[01 Competition Brief — Exact Google Doc#Program > Submission Forms > Create]] and [[01 Competition Brief — Exact Google Doc#Public CFP Page looks like this]].
- Walkthrough: [[02 Official Walkthrough — Exact Transcript]] around `04:01–07:01`.
- Evals: CFP and Abstract specs in [[03 Evals — Complete Repository]].
- Sessionboard: [[.archive/research-evidence/Attachments/Sessionboard Web Pages/sessionboard-call-for-papers.md]] and the forms/submission-form tutorials in [[04B Sessionboard — Tutorials]].

### 2. Review And Decisions

- Brief/screenshots: [[01 Competition Brief — Exact Google Doc#Program > Abstracts]].
- Walkthrough: [[02 Official Walkthrough — Exact Transcript]] around `07:01–08:02`.
- Evals: [[Attachments/Kill My SaaS Evals Repository/specs/02-abstract-management.yaml]].
- Sessionboard: [[.archive/research-evidence/Attachments/Sessionboard Web Pages/sessionboard-abstract-management.md]] and evaluation tutorials.

### 3. Speaker Portal And Onboarding

- Brief/screenshots: [[01 Competition Brief — Exact Google Doc#Speaker portal after submission]], [[01 Competition Brief — Exact Google Doc#Portal > Tasks]], and [[01 Competition Brief — Exact Google Doc#Portal > Forms]].
- Evals: [[Attachments/Kill My SaaS Evals Repository/specs/03-speaker-management.yaml]].
- Sessionboard: speaker-management pages plus participant/organizer guides in [[04 Sessionboard — Product Reference Library]].

### 4. Content And Files

- Brief: self-service headshots, slides, supporting documents, tasks, forms, and resources.
- Evals: [[Attachments/Kill My SaaS Evals Repository/specs/04-content-management.yaml]].
- Sessionboard: [[.archive/research-evidence/Attachments/Sessionboard Web Pages/sessionboard-content-management.md]] and file/session-file tutorials.

### 5. Agenda

- Brief/screenshots: [[01 Competition Brief — Exact Google Doc#Program > Agenda]].
- Walkthrough: [[02 Official Walkthrough — Exact Transcript]] around `08:02–09:01`.
- Evals: [[Attachments/Kill My SaaS Evals Repository/specs/05-ai-agenda.yaml]].
- Sessionboard: AI-agenda page and agenda-building tutorial.

### 6. Public Program And Embeds

- Brief/screenshots: [[01 Competition Brief — Exact Google Doc#CMS > Embeds (OPTIONAL)]].
- Evals: [[Attachments/Kill My SaaS Evals Repository/specs/06-public-widgets.yaml]].
- Sessionboard: sessions-list page and embed tutorial.

## Delivery-Critical Checklist

- A deployed URL is reachable by the evaluator.
- Organizer, speaker, reviewer, and anonymous-attendee paths are discoverable.
- Test credentials or open signup work without relying on an inaccessible inbox.
- The app has enough seeded or easily created data for filled-state evaluation.
- State persists across reloads and role changes.
- File uploads accept the provided headshot, slides PDF, and CSV fixtures.
- `.ics` is standards-compliant; Discord confirms deeper calendar APIs are unnecessary.
- Real side effects that browser automation cannot verify have a clear manual-verification path.
- Public widgets work without authentication and reflect approved organizer-side data.
- Core functionality is usable before optional CRM, Airtable, Cloudflare, agentic, or visual-polish work.

## Bonus And Optional Work

- Airtable compatibility or sync: useful to the team but explicitly not required.
- Cloudflare deployment: mild bonus and compatible with the team's infrastructure, but optional.
- API quality and performance: bonuses named in the brief.
- Forge hosting: very small bonus.
- Speaker CRM: explicit extra-credit evaluation area.
- Agentic management: potentially useful, but it should not make evaluator-accessible organizer workflows harder to discover.

Related: [[00 Start Here — Kill My SaaS]] · [[03 Evals — Complete Repository]] · [[05 Discord — High-Signal Coding Q&A]] · [[09 Authoritative Clone Scope]]
