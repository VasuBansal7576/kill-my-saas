# ProgramFlow

ProgramFlow is an open-source conference-program operating system covering the complete lifecycle:

`event setup → CFP → submissions → reviews → decisions → speaker onboarding → content collection → scheduling → publication → Accelevents`

## Current state

The V1 application is implemented as a React/Hono modular monolith on Cloudflare Workers with PostgreSQL as the canonical source of truth. It includes the organizer, reviewer, speaker, public-program, Speaker CRM, Airtable, Accelevents, dashboard, and OpenAPI surfaces. External operations record truthful attempts and failures; provider success is never simulated.

The repository gate currently covers strict type checking, lint, 101 requirement-focused tests against PostgreSQL, a production build, and evaluation/production Cloudflare dry-runs. Release verification still requires real provider credentials, deployment, and the ordered 20-scenario Computer Use walkthrough.

## Local verification

1. Copy `.env.example` to an ignored local environment file and provide `DATABASE_URL` plus the services you want to exercise.
2. Install dependencies with `npm ci`.
3. Apply migrations with `npm run db:migrate`.
4. Seed evaluator identities twice with `npm run seed:evaluation`; the command is deterministic and idempotent.
5. Run the complete gate with `npm run check`.
6. Start the Worker and web app with `npm run dev`.

The seed is intentionally rejected in production and requires `EVALUATION_SEED_CONFIRM="DevFlow Conf 2027"`. Known evaluator email aliases are linked to their canonical person on first authenticated use; credentials themselves belong to Neon Auth and are not stored in this repository.

## Production boundaries

- Neon PostgreSQL and Neon Auth provide persistence and identity.
- Private versioned files use Cloudflare R2.
- Durable side effects use a PostgreSQL outbox and Cloudflare Queues/Cron.
- Brevo sends transactional email and records provider outcomes.
- Workers AI provides advisory review scoring with persistent human override.
- Airtable is an augmentation adapter, never the canonical database.
- Accelevents sync is one-way, previewable, idempotent, and retryable.

See `architecture.md` for the approved system design and `Kill My SaaS Research Vault/09 Authoritative Clone Scope.md` for the product and evaluation authority.
