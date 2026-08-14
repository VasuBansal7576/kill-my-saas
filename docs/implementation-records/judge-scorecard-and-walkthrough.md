# Judge scorecard and concise walkthrough

## Scope and roles

- Optional evaluator-facing polish only; this change adds no product capability or rubric claim.
- Anonymous evaluators can open `/evaluation-scorecard` from the public root or help page.
- Organizer credentials remain required for the linked live Evidence Center.

## Contract and truth policy

- The displayed target is the current 98-item / 202-point contract: 86 required items / 183 points plus 12 Speaker CRM items / 19 points across 20 scenarios.
- `implemented` means the source-controlled V1 ledger contains an implementation record and automated evidence for the item. The page labels 98/98 as implementation coverage, never as a judge score.
- `verified` begins at 0/98 on the public page. The page does not infer a pass; fresh scenario, receipt, artifact, and deployment proof belongs in the organizer-only Evidence Center.
- This surface performs no state transition and does not read or mutate evaluator data.

## Downstream handoff

The public root and evaluator help page link to the scorecard. The scorecard links to the concise walkthrough and to `/organizer/events/devflow-conf-2027/evaluation-evidence`, where authenticated evaluators inspect live proof.

## Walkthrough artifact

- Public path: `/artifacts/programflow-judge-walkthrough.mp4`
- Adopted unchanged from the existing author revision; no video edit or regeneration was performed.
- Format: 1920×1080, 30 fps, H.264 video with AAC audio.
- Duration: 76.100 seconds.
- Size: 26,594,685 bytes.
- SHA-256: `7350809c913cf280127affc6b59424b16dc8430a4e9fbece443729a07dbe3c8f`

## Evidence

- `apps/web/src/features/operations-evidence/evaluation-scorecard.test.tsx` derives contract and status counts from `docs/requirements/v1-ledger.json`, requires automated evidence for every implementation claim, verifies public evidence/video links, and checks the committed media checksum and GitHub size limit.
- `apps/web/src/features/operations-evidence/discoverability.test.tsx` proves the public root and help page expose the scorecard.
- Final verification: full Vitest suite, TypeScript build, ESLint, production Vite build, `ffprobe`, and source-to-build SHA-256 comparison.
