# Working in ProgramFlow

This file is the project-level operating guide for coding agents. It is intentionally specific to ProgramFlow; repository-local instructions take precedence over generic framework habits.

## Mission

ProgramFlow carries conference-program data from CFP through review, decision, speaker operations, scheduling, and publication without re-entry or competing sources of truth. Preserve that continuity in every change.

Before editing, read:

1. [README.md](README.md) for the product and repository map;
2. [docs/product-spec.md](docs/product-spec.md) for roles, lifecycle, and domain terms;
3. [docs/architecture.md](docs/architecture.md) for module ownership and state authority;
4. the relevant entry in [docs/requirements/v1-ledger.json](docs/requirements/v1-ledger.json).

## Non-negotiable invariants

- PostgreSQL is canonical. External systems may augment or mirror bounded data; they never become the source of truth.
- `Submission`, `Decision`, and `Session` are distinct. Acceptance creates one linked session transactionally and idempotently.
- `Decision` is the sole accepted/rejected authority.
- Scheduling owns placements, revisions, conflicts, and readiness. Publishing alone owns live/paused state.
- Every protected read and write is scoped on the server by membership and resource relationship.
- Reviewer queues contain only explicit assignments; blind identity and peer responses remain hidden.
- Required side effects start with an outbox row in the same transaction as the triggering business change.
- Public surfaces read the same eligible approved/placed/live program.
- Uploads create immutable versions; never overwrite an existing object.
- Production code cannot select mock providers or decorative success paths.

## Codebase map

```text
apps/web/src/app/                    application shell, auth, route recovery
apps/web/src/features/               product workspaces by domain
apps/worker/src/http/                route composition and middleware
apps/worker/src/modules/             backend domain modules and their interfaces
packages/contracts/                  shared DTO and validation contracts
packages/database/                   schema, migrations, and database tooling
packages/testkit/                    deterministic fixtures and integration helpers
docs/requirements/                   evaluator contract and evidence ledger
tests/integration/                   cross-module lifecycle tests
```

Routes should translate HTTP concerns and call a module interface. Do not place business transitions directly in route handlers, React components, or cross-module table writes.

## Required change contract

Before calling a feature or fix complete, identify:

1. the human requirement and/or rubric IDs affected;
2. every role involved and the denial cases;
3. starting state and persisted resulting state;
4. downstream module, public, communication, or integration handoff;
5. idempotency, retry, and failure behavior;
6. automated evidence at the deepest useful module boundary;
7. manual/provider evidence that automation cannot prove.

Update the requirement ledger only when the complete behavior and linked evidence exist. A route, component, toast, or passing unit test is not evidence of a persisted cross-role workflow.

## Commands

```bash
npm ci                       # exact dependency install
npm run dev                  # local Worker + React app
npm run typecheck            # strict TypeScript project references
npm run lint                 # repository ESLint gate
npm run test                 # Vitest; DB suites require DATABASE_URL
npm run build                # production Worker and client assets
npm run check                # full local/CI quality gate
npm run db:migrate           # apply committed forward-only migrations
npm run prepare:evaluation   # controlled reset → migrate → seed → auth sync
```

## Database and migrations

- Generate reviewed SQL migrations; do not use schema push in production.
- Committed migrations are immutable and forward-only.
- Use database constraints for invariants that must survive application bugs.
- Carry organization/event IDs on scoped records and include them in query predicates.
- Prefer normalized relational columns for core entities; use JSON only for version snapshots, validated rules, or namespaced external data.
- Commands reached through retries, imports, queues, or integrations must be idempotent.

## Authorization

- Resolve the actor once, then authorize again in the owning module.
- Test direct API/URL access; hiding a navigation item is insufficient.
- Do not serialize sensitive data and remove it afterward. For blind review and speaker privacy, shape the query so forbidden rows/columns never enter the result.
- Add at least one positive and one negative role/scoping test for new protected behavior.

## Side effects and integrations

- Commit business state and outbox intent together.
- Store rendered recipient snapshots, attempts, provider IDs, and final outcomes.
- Redact credentials, tokens, signed URLs, and message bodies from logs.
- Surface partial integration failures per item; never label an attempted call as synchronized without provider evidence.
- Keep production adapters real. Deterministic adapters belong only in test processes.

## Testing expectations

Choose the narrowest layer that proves the risk, then add cross-layer proof where the handoff matters:

- pure tests for deterministic rules;
- database-backed module tests for transactions, authorization, idempotency, and handoffs;
- API tests for middleware, validation, error contracts, and pagination;
- browser/UX tests for discoverability and cross-role workflows;
- manual evidence for live email, calendars, files, external-origin embeds, and provider runs.

The release chain must work on an empty migrated database and through the ordered evaluator state. Do not hide a broken handoff with a scenario-specific seed.

## Evaluation safety

- Reset, seed, and auth synchronization are forbidden in production.
- Use a disposable evaluation database and exact run-scoped confirmation strings.
- Never place evaluator passwords, inboxes, database URLs, or provider tokens in source or documentation.
- Immediately before evaluation, follow [docs/runbooks/evaluation-environment.md](docs/runbooks/evaluation-environment.md) and verify organizer, both speakers, reviewer, CFP, public routes, and Evidence Center.

## Pull-request checklist

- [ ] Requirement IDs and roles are named.
- [ ] Persisted transition and downstream handoff are explicit.
- [ ] Authorization denial paths are tested.
- [ ] Retry/idempotency behavior is defined.
- [ ] Migration and index impact is reviewed.
- [ ] Automated and manual evidence links are updated.
- [ ] `npm run check` passes.
- [ ] No secrets, private evaluator credentials, or generated artifacts are committed.
