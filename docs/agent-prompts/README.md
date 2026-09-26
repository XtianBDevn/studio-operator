# Agent rebuild pack (v2)

One short product lock plus one stage at a time. This pack replaces another six mega-prompts piled on without gates.

Start from `main` after you have read [00-product-lock.md](./00-product-lock.md). Stay inside the stage you were assigned.

## How to run it

1. Read `00-product-lock.md`. If the task breaks the lock, stop.
2. Open the next numbered file that is not marked done.
3. Do only that stage. Leave later files as prompts.
4. Meet the success criteria in that file.
5. Report files touched, commands run, and results.
6. Stop. Wait for a person to verify before opening the next stage.

Do not start stage N+1 in the same pass as stage N.

## Stages

| File | Status | What it is |
| --- | --- | --- |
| [00-product-lock.md](./00-product-lock.md) | Lock | Paste-only, economics, mock-first, two live workflows, marketplace refuse, human gates. |
| [01-catalog-truth-table.md](./01-catalog-truth-table.md) | Done | Shipped on PR #4. Do not redo it. |
| [02-prompt-pack.md](./02-prompt-pack.md) | This pack | The files in this directory. |
| [03-module-boundaries.md](./03-module-boundaries.md) | Not started | Prompt only. Thin core and adapters. |
| [04-fixtures-and-audit.md](./04-fixtures-and-audit.md) | Not started | Prompt only. Fixtures first, queryable audit. |
| [05-live-smoke-checklist.md](./05-live-smoke-checklist.md) | Not started | Prompt only. What to record when keys exist. No live calls while writing the checklist. |

## Verify before next

- [ ] The stage file’s success criteria are true in the diff.
- [ ] `npm run test:catalog` passes.
- [ ] `npm run test:analysis`, `test:router`, `test:qa`, `test:autonomy`, `test:higgsfield`, and `npm run smoke` pass.
- [ ] `npm run build` succeeds.
- [ ] No marketplace send path, no new live model, no auth or webhook shell.
- [ ] The PR notes what changed and names the gaps still open: live smoke, marketplace still draft-only.
- [ ] You stopped. The next stage was not started.
