# Security policy

## Reporting

Please report suspected vulnerabilities privately to the repository owner rather than opening a public issue. Include the affected route or module, reproduction steps, expected impact, and whether credentials or personal data may have been exposed.

## Security model

ProgramFlow assumes:

- TLS terminates at Cloudflare;
- authentication is provided by the configured identity provider;
- application roles come from server-side organization/event memberships;
- private files remain in non-public object storage and require authorization-aware access;
- provider and database credentials are supplied through environment secrets;
- PostgreSQL is the authoritative source of product state.

The application treats navigation as presentation, not authorization. Every protected operation is expected to enforce membership and resource ownership on the server.

## Secret handling

- Never commit `.env`, `.dev.vars`, database URLs, identity-provider secrets, API tokens, private keys, signed download URLs, or evaluator passwords.
- Use ignored local files during development and Cloudflare secrets in deployed environments.
- Redact provider tokens and personal payloads from logs and evidence exports.
- If a secret reaches Git history, rotate it immediately; history rewriting alone is not revocation.

## Supported version

The `main` branch is the supported public snapshot. Security fixes should include a regression test at the module/API boundary and pass `npm run check`.
