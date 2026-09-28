# 02 — Prompt pack

**Status: this stage.** If `docs/agent-prompts/` already contains the lock, this README, and stages 01–05, and the root README links here, do not rewrite the pack. Stop.

## Outcome

Leave a short in-repo pack so the next cloud agent makes one incremental diff. A person can read the pack without opening a 30k-line prompt.

## Constraints

- Obey [00-product-lock.md](./00-product-lock.md).
- Keep each stage to outcome, constraints, success criteria, and stop.
- Mark stage 01 done and point at the three catalog layers.
- Stages 03, 04, and 05 are prompts only. Do not implement them in this pass.
- Do not change product behavior except links in the root README.
- Do not call Higgsfield or OpenAI. Do not add live models.

## Success criteria

- `docs/agent-prompts/00-product-lock.md` states paste-only intake, desk economics, mock-first, the two live workflows, marketplace refuse, and human gates.
- `docs/agent-prompts/README.md` says one stage at a time and verify before the next.
- `01-catalog-truth-table.md` is marked done and names `src/lib/catalog.ts`.
- `03-module-boundaries.md`, `04-fixtures-and-audit.md`, and `05-live-smoke-checklist.md` exist as prompts and do not ship the work they describe.
- Root `README.md` has an **Agent rebuild pack (v2)** section linking this directory.
- `npm run test:catalog` and the existing analysis, router, QA, autonomy, Higgsfield, and smoke scripts still pass, and `npm run build` succeeds.

## Stop

Report the file tree, test results, and that stage 03 was not started. Wait for verify.
