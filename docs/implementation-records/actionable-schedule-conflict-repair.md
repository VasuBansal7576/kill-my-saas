# Actionable schedule-conflict repair

## Contract

- Requirements: AIA-04, AIA-05, AIA-06 and HUM-13.
- Role: event organizer; the existing server-side organizer membership check protects every read and move.
- Locked workspace: `/organizer/events/:eventSlug/agenda`; no navigation or visual-system change.

## Persisted transition

Starting state is an editable `Schedule Revision` containing a speaker double-booking, or a placement command rejected for room overlap. Scheduling derives a bounded deterministic list from that revision's event days, configured rooms, session duration, existing placements, and speakers. `Move here` submits the existing `PlaceSession` command. The repository updates the placement in the normal transaction, retains room-overlap validation and revision-in-use protection, and the response recomputes conflicts plus readiness from persisted placements.

No suggestion is stored as truth and no alternate write model exists. A stale suggestion can still be rejected by the canonical placement command. Successful repair hands the same current revision to Publishing readiness, Communications calendar delivery, and Integrations schedule reads.

## Determinism and failure behavior

- Search uses event-local 09:00–17:00 slots at the scheduler's existing 15-minute resolution.
- Candidates use `[start, end)` interval rules, preserve duration, and reject both room and shared-speaker overlap.
- Speaker-conflict output is capped at four and round-robins the sessions involved; a blocked room choice returns up to three alternatives for the affected session.
- Candidates sort by distance from the current placement, then same-room preference, configured room order, and stable identifiers.
- Published/in-use revisions remain immutable; the operator must start the normal next revision.
- If the bounded search finds no valid alternative, the UI says so and leaves the manual placement form available.

## Evidence

- Pure rules: `apps/worker/src/modules/scheduling/rules.test.ts` proves deterministic bounded output, duration preservation, and no resulting room/speaker conflict.
- Module service: `apps/worker/src/modules/scheduling/service.test.ts` proves conflict suggestions appear, clear after persisted recomputation, and are available after a blocked room choice.
- Database integration: `apps/worker/src/modules/scheduling/service.integration.test.ts` applies a returned suggestion through the real repository path and verifies conflicts/suggestions clear on reloadable state.
- UI: `apps/web/src/features/scheduling/AgendaPage.test.tsx` proves plain-language repair copy and reachable `Move here` actions.

## Operational impact

No migration, background job, new side effect, or new provider is introduced. Suggestions are bounded computed read-model data. Existing placement activity, publication readiness, calendar generation, and integration consumers continue to use canonical placements.
