# ProgramFlow documentation

This directory is organized by the question a reader is trying to answer.

## Understand the product

- [Product specification](product-spec.md)—users, lifecycle, capabilities, domain language, and non-goals.
- [System architecture](architecture.md)—runtime topology, module boundaries, state authority, failure model, and quality attributes.

## Evaluate the implementation

- [V1 requirement ledger](requirements/v1-ledger.json)—98 item-level implementation and evidence records.
- [Live evaluator contract](requirements/evaluator-live-contract.json)—the current scenario and weighted-point contract.
- [Evaluator personas](fixtures/evaluator-personas.json)—deterministic identities, aliases, roles, and seed rules.
- [Decision workflow specification](requirements/decision-workflows.md)—decision ownership and acceptance/release semantics.
- [Judge scorecard record](implementation-records/judge-scorecard.md)—public truth policy for implemented versus verified status.

## Operate the evaluation environment

- [Evaluation environment](runbooks/evaluation-environment.md)—disposable-database setup, migration, seed, and identity synchronization.
- [Evaluation and release evidence](runbooks/evaluation.md)—judge entry points, evidence manifest, and controlled reset procedure.

## Contribute

- [Contributor guide](../CONTRIBUTING.md)—local setup, change workflow, validation, and pull-request expectations.
- [Agent guide](../AGENTS.md)—project-specific invariants and safe implementation protocol for coding agents.
- [Security policy](../SECURITY.md)—reporting and security assumptions.
