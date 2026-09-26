# 03 — Module boundaries

**Status: not started.** Prompt only. Do not implement this until stage 02 is verified.

## Outcome

Make the desk a thin job state machine with small modules. The loop stays brief → qualify → price → approve → route → generate → QA → deliver. Behavior stays the same. The diff is boundaries, not a new product.

Target modules, using the code that already exists:

- Analysis — `src/lib/analysis.ts`, `src/server/services/analyze-brief.ts`
- Catalog and pricing — `src/lib/catalog.ts` and the three layers from stage 01
- Router — `src/lib/route.ts`, `src/lib/router-catalog.ts`
- Provider — `src/server/services/providers.ts`, `src/server/services/higgsfield/`, `src/server/services/live-generation.ts`
- QA — `src/lib/qa.ts`, repair caps in the desk
- Autonomy — `src/lib/autonomy-policy.ts`, `src/server/supervise.ts`
- Audit — queryable events, not only logs (stage 04 may deepen this; do not boil the ocean here)

`src/server/studio.ts` may keep the state transitions. It should call those modules instead of growing new policy inline.

## Constraints

- Obey [00-product-lock.md](./00-product-lock.md).
- Do not rewrite the app. Move or re-export with a clear owner. Keep tests green without changing their expectations unless a move forces an import path update.
- Do not collapse the three catalog layers. Do not add live models.
- Do not add marketplace APIs, auth, webhooks, or a multi-tenant shell.
- Mock stays the default. No live Higgsfield or OpenAI calls.

## Success criteria

- A reader can name which module owns analysis, pricing, routing, provider calls, QA, autonomy, and audit.
- `studio.ts` is a thinner orchestrator, not a second copy of those policies.
- Existing tests and `npm run build` pass. Add a focused test only where a boundary was easy to bypass before.
- The PR says what moved and what behavior did not change.

## Stop

Stop after this boundary pass. Do not start fixtures, audit expansion, or live smoke in the same turn. Wait for verify.
