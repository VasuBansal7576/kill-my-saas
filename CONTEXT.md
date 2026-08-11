# ProgramFlow Domain

ProgramFlow carries conference-program data from a public call for speakers through review, acceptance, speaker operations, scheduling, and publication without re-entry or competing sources of truth.

## Language

**Organization**:
The durable workspace that owns people, events, integrations, and the cross-event Speaker CRM.
_Avoid_: Tenant, account, company

**Event**:
One conference program with its own dates, CFP, reviews, speakers, content, schedule, and public program.

**Person**:
One human independent of any event or role; alternate fixture emails may identify the same person.
_Avoid_: User, contact, speaker when no role is intended

**Identity**:
A login credential and session relationship linked to a person.

**Membership**:
A person's scoped relationship to an organization or event, carrying one or more roles.

**Speaker Profile**:
Reusable professional information linked to a person, including biography, company, title, social links, headshot, and logistics.

**Event Speaker**:
A person's event-specific speaker participation and onboarding state.

**CFP Form**:
A versioned public proposal form with a submission window, questions, conditions, routing, and confirmation behavior.

**Submission**:
A draft or submitted proposal whose content lifecycle ends before the organizer's decision; review progress and outcome are projections over related records.
_Avoid_: Session, accepted submission state

**Participant**:
A named author, co-author, or presenter credited on a submission, optionally linked to a person.

**Review Round**:
An independently dated evaluation stage with its own scorecard, reviewer pool, assignments, and blind-review policy.

**Review Assignment**:
The exclusive authorization for one reviewer to evaluate one submission in one review round.

**Decision**:
The sole authoritative accepted or rejected outcome for a submission, separate from submission content and review advice.

**Session**:
Accepted or manually entered program content; an accepted session may retain provenance to exactly one submission.

**Task**:
An organizer request assigned to one or more event speakers, expressed as an action, form, or file request.

**Deliverable**:
The logical artifact requested from one speaker through a task assignment; uploads become immutable file versions.

**Placement**:
A session's scheduled time and room; conflicts are derived from overlapping placements and shared speakers.

**Schedule Revision**:
A coherent version of placements used to determine whether a program is ready to publish; it is not a publication switch.

**Publication**:
The sole authoritative event-level state and configuration exposing eligible program records publicly.
_Avoid_: Published agenda state, copied CMS record

**Communication**:
A composed template or campaign whose per-recipient deliveries retain rendered content and outcomes.

**Integration Run**:
One observable attempt to synchronize a bounded set of canonical records with an external system.

**CRM Contact**:
The organization-level program-sourcing view of a person, including notes, tags, segments, pipeline state, and event history.
_Avoid_: Second person record, sales lead

**Evidence Record**:
An inspectable link between a requirement, the operation that exercised it, and its test or artifact.
