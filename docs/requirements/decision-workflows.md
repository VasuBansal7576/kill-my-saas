# Submission Decision and Post-decision Workflows

## Contract

- Requirements: human program-side lifecycle; CFP-12, CFP-13, CFP-14, CFP-15; supports CNT-09, CNT-11, and CNT-12 by routing accepted-content edits through versioned Session content.
- Roles: organizers record, review, release, change, and resolve; speakers see only released outcomes and may request changes only to their own accepted Session.
- Locked surfaces: organizer Submissions and Evaluations; speaker proposal list and Speaker portal. Existing visual tokens, routes, and canonical language are preserved.

## Persisted transitions

1. `submitted Submission + no Decision → accepted/rejected Decision + draft Decision Notification`.
2. Accepted records atomically create the distinct provenance-linked `Session`, `Event Speaker`, and `Session Speaker` rows, but the Decision and Session remain hidden from speaker reads while `Decision.releasedAt` is null.
3. `draft Decision Notification → reviewed` uses optimistic revision control and appends a `notification_updated` Decision audit event.
4. `reviewed Decision Notification → queued + released Decision` atomically publishes the outcome to speaker reads and inserts exact-snapshot outbox handoffs. Accepted onboarding/task/integration handoffs start only at release.
5. Communications consumes `decision.notification.released`, creates the canonical `Communication` and delivery rows, then advances the staging record to `handed_off` and records `Decision.notifiedAt`.
6. A final Decision locks ordinary proposal editing. A speaker instead records a pending `Session Change Request`; organizer approval appends a new `Session Version`, updates Session content, and returns previously approved content to `in_review`. The original proposal version remains immutable provenance.
7. The audited change-decision command permits Rejected → Accepted, resets release/notification state, and creates the canonical acceptance handoff. Accepted → Rejected is rejected while the linked Session/downstream schedule/publication state exists; it requires a future dedicated withdrawal workflow rather than silent deletion.

## Idempotency and failure behavior

- Decision record, change, release, Session change request, and resolution commands carry unique idempotency keys.
- A repeated release returns the existing receipt and never duplicates notification, portal, task, or integration outbox work.
- Notification edits reject stale revisions and released snapshots are immutable.
- Provider delivery remains asynchronous and inspectable through Communications; queue/provider failures never roll back or falsify the authoritative Decision.
- The migration backfills pre-existing Decisions as already released and reconstructs their notification handoff state when a matching Communication exists, preserving earlier speaker-visible behavior.

## Evidence

- `tests/integration/decision-workflows.test.ts`: organizer/speaker visibility, accepted/rejected propagation, canonical Session links, release staging, review requirement, idempotency, Rejected → Accepted correction, unsafe accepted reversal, locked proposal edits, audited Session change approval, and immutable proposal provenance.
- `tests/integration/acceptance-handoff.test.ts`: acceptance transaction and duplicate prevention.
- `apps/worker/src/modules/reviews-decisions/service.test.ts`: both outcomes use the same parent-owned atomic Decision coordinator.
- `apps/worker/src/modules/communications/service.integration.test.ts`: persisted communication delivery handoff and evidence behavior.
- Manual CFP-14 verification still requires the evaluation environment's real provider message ID and delivery outcome; this implementation does not claim that external gate from a local test.

## Operational impact

- Migration: `0010_stiff_firestar.sql` adds Decision release/audit/staging fields and Session change requests with compatibility backfill.
- Observability: Decision audit actions distinguish record, change, message review, and release; Communications retains rendered recipient snapshots and provider outcomes.
- Accessibility: dialogs retain labeled fields, status text, keyboard-native buttons, and explicit warning copy for destructive consequences.
- Performance: proposal projections add bounded one-to-one Decision Notification and per-linked-Session change-request reads; no new public query or provider call occurs on page load.
