# ProgramFlow product specification

## Product thesis

ProgramFlow is the operating system for a conference program, not an all-in-one event platform. It owns the path from a public call for speakers to an approved, scheduled, published program. Registration, ticketing, sponsors, exhibitors, payments, and broad marketing automation are outside the product boundary.

The product promise is simple: **enter data once and preserve its identity through every downstream job.**

## Users and permissions

| Actor | Primary job | Security boundary |
|---|---|---|
| Organizer | Configure the event, operate reviews, speakers, content, schedule, publication, and integrations | Active organization/event membership plus resource-scoped server checks |
| Speaker | Submit proposals and complete their own accepted-session work | Own person, submissions, event-speaker record, tasks, sessions, and files only |
| Reviewer | Evaluate explicitly assigned proposals | Active assignment and round; blind identity and peer responses remain hidden |
| Anonymous attendee | Browse the live program and build an itinerary | Published, approved, placed records only; no administrative data |

A person may hold different roles in different events. Roles are relationships, not a global user-type column.

## Canonical lifecycle

1. **Event configuration** defines dates, timezone, venue, tracks, formats, rooms, and branding.
2. **CFP configuration** publishes a versioned form with validation, conditions, routing, limits, and an explicit submission window.
3. **Submission** persists drafts, participants, answers, and revisions without pretending to be a scheduled session.
4. **Review** assigns bounded queues, collects scorecards, preserves blind-review rules, and computes results.
5. **Decision** records the sole accepted/rejected outcome and controls when that outcome is released.
6. **Acceptance handoff** creates a distinct linked session, event-speaker records, onboarding work, and downstream eligibility without re-entry.
7. **Speaker operations** manage profile data, tasks, resources, communications, and immutable deliverable versions.
8. **Scheduling** places approved sessions into a revision, derives conflicts, and reports whether that revision is publishable.
9. **Publication** is the only live/paused authority and exposes one eligible program to all public formats.
10. **Integration and evidence** record external attempts, provider outcomes, artifacts, and requirement-level proof.

## Core domain language

| Term | Meaning |
|---|---|
| Person | One human independent of role or event; alternate emails may resolve to the same person. |
| Membership | A person's scoped relationship to an organization or event, carrying one or more roles. |
| Submission | A draft or submitted proposal whose content lifecycle ends before the decision handoff. |
| Review Assignment | Authorization for one reviewer to evaluate one submission in one round. |
| Decision | The sole authoritative accepted/rejected outcome for a submission. |
| Session | Accepted or manually entered program content, optionally linked back to one submission. |
| Event Speaker | A person's event-specific speaker participation and onboarding state. |
| Deliverable | A requested artifact whose uploads become immutable file versions. |
| Placement | A session's scheduled time and room; conflicts are computed from placements and speakers. |
| Schedule Revision | A coherent set of placements used to determine publication readiness. |
| Publication | The event-level state that exposes eligible program records publicly. |
| Communication | A composed campaign with a rendered snapshot and outcome per recipient. |
| Integration Run | An observable attempt to synchronize a bounded set of canonical records. |
| Evidence Record | A link between a requirement, the operation that exercised it, and its artifact or test. |

## Capability surface

| Area | Product behavior |
|---|---|
| CFP | Custom fields, conditions, public window, drafts, edits, confirmation, and organizer round-trip |
| Reviews | Multiple rounds, scorecards, weighted criteria, pools, exact assignments, blind review, recusal, exports, and optional AI advice |
| Decisions | Accept/reject, release, notifications, speaker propagation, and idempotent session handoff |
| Speakers | Roster/import, profiles, portal invitation, scoped tasks, resources, logistics, and progress |
| Content | Requests, private uploads, immutable versions, comments, approval, history, restore, files library, and ZIP export |
| Agenda | Rooms/tracks, placement, speaker/room conflict detection, move/clear, auto-place, revisions, and publication readiness |
| Public program | Sessions, speakers, agenda, itinerary, gallery, search, filters, details, calendar, and embed/data formats |
| Speaker CRM | Cross-event directory, filters, notes, tags, imports, duplicate merge, segments, sourcing pipeline, event handoff, outreach, and analytics |
| Integrations | Previewable, idempotent, evidence-producing Airtable and Accelevents runs |
| Operations | Work queue, readiness, provider outcomes, requirement evidence, and release manifest |

## Product invariants

- PostgreSQL is canonical; Airtable is an augmentation target, never the database of record.
- A `Submission` and a `Session` are separate records connected by provenance.
- A `Decision` and a `Publication` each have exactly one authority.
- Every protected query is scoped again on the server.
- Public data is approved, placed, and live; draft or private records cannot leak through an alternate widget.
- Required side effects have durable intent before the business transaction commits.
- Production behavior cannot select mock providers or decorative success paths.

## Evaluation contract

The repository tracks 98 rubric items across 20 ordered, stateful scenarios: 86 required items and 12 Speaker CRM items. Scenarios intentionally reuse state, so a later seed cannot conceal a broken handoff. `implemented` means the behavior and automated evidence exist; `verified` additionally requires every applicable live/manual artifact.

The machine-readable source is [requirements/v1-ledger.json](requirements/v1-ledger.json).
