# Evaluation environment runbook

This runbook creates a clean evaluator starting state without modifying the polluted DevFlow event. It is intentionally not an instruction to repair, reset, or reuse the current live evaluation database.

## Safety boundary

- Use a fresh run ID for every full ordered evaluation.
- Prefer a disposable Neon branch. A run-scoped organization/event is the fallback when a branch is unavailable.
- Point `DATABASE_URL` only at the new branch or the explicitly approved non-production database.
- `APP_ENV=production` is rejected by seed, reset, and evaluator-auth synchronization.
- Seed refuses a run that already contains CFP forms, submissions, reviews, decisions, sessions, speaker workflow records, schedule records, publications, or widget configurations. It never reverses decisions or deletes public sessions to make a progressed run look clean.
- Reset requires a separate exact confirmation and removes only the deterministic run organization and all events inside it. Canonical people, email aliases, and Neon Auth accounts remain available for the next isolated run.

## Option A: disposable Neon branch (preferred)

1. Create a disposable branch from the schema-only/default branch using the Neon console or the team's approved Neon CLI workflow. Do not branch from the polluted live evaluation data.
2. Set `DATABASE_URL` to that branch's connection string and verify the database/branch name before any mutation.
3. Set:

   ```sh
   APP_ENV=evaluation
   EVALUATION_DATABASE_SCOPE=disposable_neon_branch
   EVALUATION_RUN_ID=judge-YYYY-MM-DD-N
   EVALUATION_SEED_CONFIRM="CREATE judge-YYYY-MM-DD-N"
   EVALUATION_RESET_CONFIRM="RESET judge-YYYY-MM-DD-N"
   ```

4. Apply committed migrations with `npm run db:migrate`.
5. Run `npm run seed:evaluation` twice. Both invocations must report identical organization/event IDs and an all-zero `workflowState`.
6. Supply the four evaluator persona passwords through `EVALUATOR_PERSONA_PASSWORDS_JSON`, then run `npm run sync:evaluator-auth`. Canonical and alias addresses must verify for organizer, speaker, speaker2, and reviewer.
7. Run the ordered 20-scenario evaluation without a reset between areas.
8. Retain evidence, then delete the disposable Neon branch using the approved Neon workflow. The application reset command is unnecessary when the branch itself is disposed.

Because the whole database is isolated, this mode uses the canonical judge-facing organization slug `programflow-evaluation` and event slug `devflow-conf-2027`. Run-scoped suffixes are reserved for the shared-database fallback.

## Option B: run-scoped organization/event

Use the same steps with `EVALUATION_DATABASE_SCOPE=run_scoped`. The seed creates deterministic identifiers derived from `EVALUATION_RUN_ID`:

- organization slug: `programflow-eval-<run-id>`
- event slug: `devflow-conf-2027-<run-id>`
- event display name: `DevFlow Conf 2027`

A different run ID produces different organization/event IDs and slugs while reusing the same four canonical people and compatible login aliases. Memberships—not aliases—grant access to each isolated event.

## Expected ordered starting state

The seed creates only the run organization, DevFlow event configuration, catalogs, canonical people/aliases, and memberships. All workflow counts must be zero. In particular:

- no CFP form or submission is pre-created;
- no Decision exists for either fixture proposal;
- no Session or Event Speaker is pre-created;
- no schedule revision, placement, Publication, widget configuration, or contradictory public session exists.

CFP-S2 creates the two proposals. CFP-S4 alone accepts “Taming 40-Minute CI” and rejects “Your AI Pair Programmer Is Lying to You.” Acceptance then creates the canonical Session through the real handoff.

## Explicit reset of one isolated run

Only after verifying the run ID and target database, set both operation-specific confirmations and run the guarded preparation command:

```sh
EVALUATION_SEED_CONFIRM="CREATE judge-YYYY-MM-DD-N"
EVALUATION_RESET_CONFIRM="RESET judge-YYYY-MM-DD-N"
npm run prepare:evaluation
```

`prepare:evaluation` runs reset, committed migrations, deterministic seed, and persona synchronization in that order. Reset is deliberately first: its production guard, database-scope check, run ID, and exact `RESET <run-id>` confirmation must pass before the migration step can run. The command stops at the first failure and is never a substitute for checking the target database name. Reset is idempotent. It also removes run-owned outbox rows before deleting event data, preventing an old queued decision/publication/email operation from firing after reseed. It does not delete people, aliases, Auth accounts, provider accounts, R2 objects, a Neon branch, or any deployed Worker.

## Failure interpretation

- `forbidden in production`: stop; the target is not eligible for evaluator tooling.
- confirmation mismatch: correct the explicit `CREATE <run-id>` or `RESET <run-id>` value after rechecking the target.
- `will not repair it`: the run has progressed. Choose a fresh run ID/branch, or use the explicit reset only if that isolated run is approved for deletion.
- email collision: an alias points at a different canonical Person. Resolve the fixture/config error; never broaden roles or create a duplicate login identity.
- non-zero workflow count after seed: stop the evaluation. The starting state is not deterministic.

Contract totals and scenario-owned decisions are recorded in `docs/requirements/evaluator-live-contract.json`.
