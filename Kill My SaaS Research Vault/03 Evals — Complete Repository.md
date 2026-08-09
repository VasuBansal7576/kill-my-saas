---
source: "https://forge.smol.ai/swyx/killmysaas-evals"
source_commit: "d99935c3e3c6c50c6b9292220260ccfe2df6d6d4"
source_commit_time: "2026-08-09T01:10:23-07:00"
capture_type: full_git_clone
captured_at: 2026-08-09
---

# 03 Evals — Complete Repository

The complete repository, including Git history and binary fixtures, is preserved at [[Attachments/Kill My SaaS Evals Repository]]. This is an exact Git snapshot at commit `d99935c3e3c6c50c6b9292220260ccfe2df6d6d4`, not a summary or a README-only capture.

## Read First

- [[Attachments/Kill My SaaS Evals Repository/README.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/README.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/00-how-sessionboard-works.md]]

## Exact Evaluation Specifications

- [[Attachments/Kill My SaaS Evals Repository/specs/01-call-for-papers.yaml]]
- [[Attachments/Kill My SaaS Evals Repository/specs/02-abstract-management.yaml]]
- [[Attachments/Kill My SaaS Evals Repository/specs/03-speaker-management.yaml]]
- [[Attachments/Kill My SaaS Evals Repository/specs/04-content-management.yaml]]
- [[Attachments/Kill My SaaS Evals Repository/specs/05-ai-agenda.yaml]]
- [[Attachments/Kill My SaaS Evals Repository/specs/06-public-widgets.yaml]]
- [[Attachments/Kill My SaaS Evals Repository/specs/07-speaker-crm.yaml]]

## Feature Documentation

- [[Attachments/Kill My SaaS Evals Repository/docs/01-call-for-papers.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/02-abstract-management.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/03-speaker-management.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/04-content-management.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/05-ai-agenda.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/06-public-widgets.md]]
- [[Attachments/Kill My SaaS Evals Repository/docs/07-speaker-crm.md]]

## Raw Research Inputs

- [[Attachments/Kill My SaaS Evals Repository/docs/research/abstract-management.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/ai-agenda.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/call-for-papers.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/conference-speaker-management.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/content-management.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/embeds-sessions-list.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/learn-organizer.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/learn-participant.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/learn-videos.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/speaker-crm.json]]
- [[Attachments/Kill My SaaS Evals Repository/docs/research/speaker-management.json]]

## Fixtures Used By The Evaluator

- [[Attachments/Kill My SaaS Evals Repository/fixtures/sample-data.json]]
- [[Attachments/Kill My SaaS Evals Repository/fixtures/speakers.csv]]
- [[Attachments/Kill My SaaS Evals Repository/fixtures/headshot.png]]
- [[Attachments/Kill My SaaS Evals Repository/fixtures/slides.pdf]]

## Harness Source And Scripts

- [[Attachments/Kill My SaaS Evals Repository/scripts/browser-smoke.mts]]
- [[Attachments/Kill My SaaS Evals Repository/scripts/smoke.html]]
- [[Attachments/Kill My SaaS Evals Repository/src/agent.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/auth.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/browser.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/cli.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/config.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/judge.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/log.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/report.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/specs.ts]]
- [[Attachments/Kill My SaaS Evals Repository/src/types.ts]]

## Project Configuration

- [[Attachments/Kill My SaaS Evals Repository/.env.example]]
- [[Attachments/Kill My SaaS Evals Repository/.gitignore]]
- [[Attachments/Kill My SaaS Evals Repository/evalconfig.example.json]]
- [[Attachments/Kill My SaaS Evals Repository/package.json]]
- [[Attachments/Kill My SaaS Evals Repository/package-lock.json]]
- [[Attachments/Kill My SaaS Evals Repository/tsconfig.json]]

## Coverage At This Snapshot

- 50 tracked files.
- 96 rubric items across 20 scenarios and 7 areas.
- 84 required items carrying 178 weighted points.
- 12 optional Speaker CRM items carrying 19 points.
- Required-area weights: Call for Papers 20, Abstract Management 20, Speaker Management 15, Content Management 15, AI Agenda 10, Public Widgets 20.
- The evaluator is implementation-agnostic and judges functionality, persisted state, cross-role round trips, rule enforcement, scoping, handoffs, and usable populated screens—not Sessionboard pixel fidelity.

Related: [[01 Competition Brief — Exact Google Doc]] · [[02 Official Walkthrough — Exact Transcript]] · [[08 Build Requirements Crosswalk]] · [[00 Start Here — Kill My SaaS]]
