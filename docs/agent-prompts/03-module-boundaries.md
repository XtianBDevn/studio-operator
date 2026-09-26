# 03 — Module boundaries

**Status: done.** Shipped on [PR #4](https://github.com/XtianBDevn/studio-operator/pull/4). Do not redo this stage. Do not start stage 04 from this file.

## Already done

`src/server/studio.ts` keeps status transitions and calls the owners listed in `src/server/modules/owners.ts`:

- Analysis — `src/lib/analysis.ts`, `src/server/services/analyze-brief.ts`
- Catalog and pricing — `src/lib/catalog.ts` (the three layers stay separate)
- Router — `src/lib/route.ts`, `src/server/services/plan-from-analysis.ts`
- Provider — `src/server/services/provider-run.ts` (mock previews and live Higgsfield steps)
- QA — `src/lib/qa.ts`, `src/server/services/qa-desk.ts`
- Autonomy — `src/lib/autonomy-policy.ts`, `src/server/supervise.ts`, `src/server/services/autonomy.ts`
- Audit — `src/server/services/audit.ts` (read, write, and delete of `AuditEvent`; more event kinds wait for stage 04)

Behavior of the desk loop is unchanged. Live submit is still only the two workflows. Mock stays the default.

## If you are here

Confirm `src/server/modules/owners.ts` still names those seven owners and `npm run test:modules` passes. Then stop.

## Stop

This stage is finished. Do not start fixtures, audit expansion, or live smoke. Wait for verify.
