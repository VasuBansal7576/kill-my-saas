# Evaluation entry and release evidence

The deployed root is the judge entry point for `DevFlow Conf 2027`. It links directly to the anonymous CFP and all five public program surfaces. It also documents organizer, speaker, and reviewer entry paths without containing an email address or password. Supply persona credentials only through the private evaluator configuration.

After organizer sign-in, open:

`/organizer/events/devflow-conf-2027/evaluation-evidence`

The Evaluation Evidence Center maps all 20 scenarios and 98 V1 rubric items (86 required items / 183 weighted points plus 12 project-required Speaker CRM extra-credit items / 19 points) to routes, persisted transitions, downstream handoffs, event-scoped Evidence Records, and provider receipts. Public Widgets account for 35 weighted points. An item is `verified` only when a verified Evidence Record exists. An implementation-ledger status, route, or success message cannot create a passing state.

The organizer-only release manifest is generated at:

`/api/v1/organizer/events/devflow-conf-2027/evaluation-evidence/manifest.json`

Set these non-secret Worker variables during the release workflow so the manifest can identify the exact artifact instead of displaying `Not supplied`:

- `GIT_COMMIT_SHA`
- `RELEASE_MIGRATION`
- `DEPLOYMENT_ID`
- `SOURCE_URL`
- `EVALUATION_URL`
- `EVALUATION_RESET_RUNBOOK_URL` (optional operator runbook link)

## Controlled evaluation reset

ProgramFlow intentionally has no public reset endpoint. The Evidence Center returns reset instructions only when `APP_ENV` is `evaluation` or `preview`, and the route itself requires an organizer grant for the same event.

An authorized operator resets the evaluation environment as one controlled operation:

1. Confirm `APP_ENV` is `evaluation` or `preview`, then download the current release manifest for traceability.
2. Select the named isolated Neon evaluation database. Never target Production, and never manually repair individual workflow rows.
3. Set `EVALUATION_RUN_ID=judge-YYYY-MM-DD-N`, `EVALUATION_DATABASE_SCOPE=disposable_neon_branch`, `EVALUATION_SEED_CONFIRM="CREATE judge-YYYY-MM-DD-N"`, and `EVALUATION_RESET_CONFIRM="RESET judge-YYYY-MM-DD-N"`. Supply persona passwords only through `EVALUATOR_PERSONA_PASSWORDS_JSON`.
4. Run `npm run prepare:evaluation`. This fail-fast command validates the reset boundary before applying migrations, reseeding the deterministic event, and synchronizing every evaluator persona.
5. Verify `/api/v1/health/ready`, organizer, both speakers, and reviewer sign-ins, the CFP, all five anonymous public routes, and the organizer Evidence Center before returning the evaluation URL.

Reset, seed, and auth synchronization reject `APP_ENV=production`. Reset additionally requires the exact run ID, database scope, and `RESET <run-id>` confirmation before migrations can run. Do not place database URLs, auth secrets, persona passwords, provider tokens, or destructive provider controls in this document or in anonymous application output.
