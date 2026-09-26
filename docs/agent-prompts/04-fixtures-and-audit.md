# 04 — Fixtures and audit

**Status: not started.** Prompt only. Do not implement this until stage 03 is verified.

## Outcome

Seeded briefs, expected routes, expected margins, and autonomy refusals are tests first. Model decisions, drafts, approvals, generations, repairs, cost changes, and escalations are queryable audit events, not lines buried in logs.

Glass Monument and Night Orchard stay the two contrasting fixtures for `/record` and supervised walks.

## Constraints

- Obey [00-product-lock.md](./00-product-lock.md).
- Fixtures assert outcomes (route model, margin band, refusal). Do not assert prose that will churn every copy edit.
- `AuditEvent` already exists (`prisma/schema.prisma`, autonomy repository). Extend that record so a person can query what the desk decided. Do not add a second log system.
- Marketplace actions stay refused and audited. A draft is not a send.
- Consent tests still match person and use. A Harbor-style consent does not cover a new person or a new use.
- Do not add live models. Do not call Higgsfield or OpenAI. Mock stays the default.
- Do not implement stage 05 in this pass.

## Success criteria

- A test seeds or loads Glass Monument and Night Orchard and checks the expected route and that planning rates, not invented prices, produce the margin.
- Autonomy tests still refuse marketplace send, and at least one new or existing test shows a queryable audit row for a draft, an approval, and a refusal.
- `npm run test:autonomy`, `test:router`, `test:qa`, `test:catalog`, and `npm run smoke` pass.
- The PR names which events are queryable and which gaps remain.

## Stop

Stop after fixtures and audit. Do not run a live smoke. Wait for verify.
