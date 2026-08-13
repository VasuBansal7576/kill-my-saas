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
2. Restore the named clean-evaluation Neon branch/snapshot and its matching private-file prefix. Never target Production.
3. Apply committed migrations with `npm run db:migrate`.
4. Set `EVALUATION_SEED_CONFIRM="DevFlow Conf 2027"` and run `npm run seed:evaluation`.
5. With the same explicit confirmation and private persona configuration, run `npm run sync:evaluator-auth`.
6. Verify `/api/v1/health/ready`, all three persona sign-ins, the CFP, all five anonymous public routes, and the organizer Evidence Center before returning the evaluation URL.

The seed and auth scripts already reject `APP_ENV=production`; a reset must also use a provider-level snapshot/branch target that is explicitly named for evaluation. Do not place database URLs, auth secrets, persona passwords, provider tokens, or destructive provider controls in this document or in anonymous application output.
