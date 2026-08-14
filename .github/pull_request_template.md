## Outcome

Describe the user-visible or operational result.

## Contract

- Requirement/rubric IDs:
- Roles and denial cases:
- Persisted transition:
- Downstream handoff:

## Failure behavior

Describe idempotency, retries, partial failure, and recovery.

## Evidence

- Automated tests:
- Manual/provider evidence:
- Migration or performance impact:

## Checklist

- [ ] Authorization is enforced server-side.
- [ ] Database and idempotency invariants are preserved.
- [ ] Requirement/evidence records are updated.
- [ ] No secrets or evaluator credentials are included.
- [ ] `npm run check` passes.
