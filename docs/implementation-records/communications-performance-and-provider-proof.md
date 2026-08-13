# Communications performance and provider proof

## Contract

- Requirements: CFP-08, CFP-14, ABS-09, SPK-06, SPK-13, SPK-14, SPK-16, CNT-08, CRM-11, speaker calendar delivery, performance bonus, and manual provider-evidence release proof.
- Role: an organizer may inspect and act on communications for an event where their organizer membership is active. Provider webhook ingestion remains separately authenticated. Poll and retry commands re-check the event relationship on the server.
- Locked route: `/organizer/events/:eventSlug/communications`; the charcoal workspace, conventional navigation, and task-first composition flow remain intact.

## Persisted transition and handoff

- A template/campaign expands to immutable recipient-rendered subject, HTML, and text snapshots before delivery is queued.
- Recipient delivery remains `queued → sending → accepted → delivered`, or ends as `bounced`, `failed`, or `blocked_external`. Provider request acceptance is explicitly not presented as delivery.
- Retry creates another durable outbox request while retaining prior attempts and provider events. It is limited to three attempts and rejects missing addresses, hard bounces, permanent provider failures, delivered records, and pending records with exact remediation.
- CFP confirmation, decisions, reviewer reminders, portal invitations, speaker bulk messages, overdue-task reminders, CRM outreach, and calendars retain normalized source context linking evidence back to its responsible workflow.
- Campaign summaries are cursor-paginated. Recipient snapshots, delivery attempts, webhook/poll outcomes, and outbox rows lazy-load only when an organizer opens one campaign.

## Failure, idempotency, and observability

- Every client request times out after eight seconds with an explicit retry state; empty history is shown only after a successful response.
- Provider polling returns a deterministic receipt containing current status, whether it is still pending, outcomes applied, provider ID, and a truthful explanation.
- Communication detail exposes outbox status/attempts/error/dispatch time, provider attempts, retained message IDs, webhook outcomes, retry eligibility, and remediation. The summary exposes bounded outbox counts.
- Existing communication and outbox idempotency keys remain authoritative. No provider call or delivery claim is performed by automated tests in this change.

## Evidence

- `apps/worker/src/modules/communications/delivery-policy.test.ts`: delivery truth and bounded/permanent-failure retry policy.
- `apps/worker/src/modules/communications/history-performance.test.ts`: two history data queries for a page even with 10,000 retained campaigns; no N+1 query growth.
- `apps/worker/src/modules/communications/provider-evidence.test.ts`: all seven required controlled-inbox workflow categories retain distinct organizer evidence context and deep links.
- `apps/web/src/features/communications/CommunicationsPage.test.ts`: the route shell and independent loading sections render before history resolves, without a false empty state.
- Existing communications outcome, merge-field, iCalendar, adapter, and integration tests remain the downstream regression surface. PostgreSQL integration tests require an isolated `DATABASE_URL`; live Brevo receipts remain a controlled evaluation-environment manual gate.

## Change impact

- Migration: none; existing normalized communication, recipient, attempt, provider-event, calendar-artifact, and outbox tables are reused.
- Accessibility: loading failures use alerts, notices use status semantics, expandable campaign controls expose `aria-expanded`, and retry actions are text-labeled.
- Performance: the initial shell renders synchronously; summary, audience, and history fail independently; history uses 20-row cursor pages; details are lazy; history query count is fixed per page.
