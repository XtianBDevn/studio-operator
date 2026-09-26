# 04 — Fixtures and audit

**Status: done.** Shipped on [PR #4](https://github.com/XtianBDevn/studio-operator/pull/4). Do not redo this stage. Do not start stage 05 from this file.

## Already done

Glass Monument and Night Orchard are fixture tests in `scripts/fixtures.test.ts` (`npm run test:fixtures`). Each test checks the route model, role, and stage, and checks that margin is `computeProfitability` on `PLANNING_RATES` times the fixture attempt counts. Route copy is not asserted.

Desk decisions are rows on the existing `AuditEvent` model (`src/server/services/audit.ts`). `src/server/studio.ts` writes them after a successful transition. The supervised runner writes the same kinds. There is no second log.

Queryable kinds:

- `model_decision` — route stored by the desk
- `message_draft` and `message_sent` — client messages from the supervised runner (a draft is not a send)
- `approval` — a person cleared a gate
- `generation` — approved steps or a finishing revision
- `repair` — a priced continuity repair
- `cost_change` — package price, commercials, production maximum, route spend, or repair spend
- `escalation` — a refusal or a stop that needs a person, including marketplace refusals

`scripts/autonomy-walk.ts` queries a draft, an approval, and a refusal. Marketplace send stays refused. Consent still has to match person and use.

## If you are here

Confirm `npm run test:fixtures` and `npm run test:autonomy` pass. Then stop.

## Stop

This stage is finished. Do not run a live smoke. Do not start stage 05. Wait for verify.
