# Contributing to ProgramFlow

ProgramFlow rewards small changes that preserve an end-to-end lifecycle. A contribution is easiest to review when it names the product contract, changes one owned module, and proves the persisted behavior.

## Setup

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

Database-backed tests require an isolated PostgreSQL database through `DATABASE_URL`. Never use production or the shared evaluator database for local tests.

## Before writing code

1. Read [AGENTS.md](AGENTS.md), [the product spec](docs/product-spec.md), and [the architecture](docs/architecture.md).
2. Find the relevant requirement IDs in [the V1 ledger](docs/requirements/v1-ledger.json).
3. Identify the owning module, roles, persisted transition, downstream handoff, and evidence.
4. Prefer extending an existing module interface over reaching into another module's tables.

## Development workflow

- Keep commits focused and describe the behavior, not the file operation.
- Add migrations before code that depends on them.
- Add negative authorization tests alongside successful paths.
- Prove idempotency for commands that may be retried.
- Update docs when changing an invariant, route contract, provider behavior, or evaluation procedure.

Run the complete gate before requesting review:

```bash
npm run check
```

## Pull requests

A good pull request explains:

- the requirement and user outcome;
- the state before and after the change;
- the roles and authorization boundary;
- the downstream handoff;
- failure and retry behavior;
- migrations, indexes, and operational impact;
- automated tests and any required manual evidence.

Do not commit real secrets, evaluator credentials, provider payloads, build output, local databases, or dependency folders.
