# ProgramFlow

ProgramFlow is an open-source conference-program operating system covering the complete lifecycle:

`event setup → CFP → submissions → reviews → decisions → speaker onboarding → content collection → scheduling → publication → Accelevents`

## Current state

The V1 application is implemented as a React/Hono modular monolith on Cloudflare Workers with PostgreSQL as the canonical source of truth. It includes the organizer, reviewer, speaker, public-program, Speaker CRM, Airtable, Accelevents, dashboard, and OpenAPI surfaces. External operations record truthful attempts and failures; provider success is never simulated.

The repository gate currently covers strict type checking, lint, 125 passing requirement-focused tests (with database-backed suites enabled when `DATABASE_URL` is present), a production build, and evaluation/production Cloudflare dry-runs. Release verification still requires real provider credentials, deployment, and the ordered 20-scenario Computer Use walkthrough.

## Local verification

1. Copy `.env.example` to an ignored local environment file and provide `DATABASE_URL` plus the services you want to exercise.
2. Install dependencies with `npm ci`.
3. Apply migrations with `npm run db:migrate`.
4. Choose a fresh `EVALUATION_RUN_ID`, set `EVALUATION_SEED_CONFIRM="CREATE <run-id>"`, and seed twice with `npm run seed:evaluation`; both runs must report identical IDs and a clean workflow state.
5. Run the complete gate with `npm run check`.
6. Start the Worker and web app with `npm run dev`.

Seed/reset/auth synchronization are rejected in production and require a run-scoped ID plus operation-specific confirmation. The seed will not repair a progressed or polluted run. Known evaluator email aliases remain linked to their canonical Person; credentials themselves belong to Neon Auth and are not stored in this repository. See `docs/runbooks/evaluation-environment.md` for the disposable Neon branch and run-scoped workflows.

## Production boundaries

- Neon PostgreSQL and Neon Auth provide persistence and identity.
- Private versioned files use Cloudflare R2.
- Durable side effects use a PostgreSQL outbox and Cloudflare Queues/Cron.
- Brevo sends transactional email and records provider outcomes.
- Workers AI provides advisory review scoring with persistent human override.
- Airtable is an augmentation adapter, never the canonical database.
- Accelevents sync is one-way, previewable, idempotent, and retryable.

See `architecture.md` for the approved system design and `Kill My SaaS Research Vault/09 Authoritative Clone Scope.md` for the product and evaluation authority.
