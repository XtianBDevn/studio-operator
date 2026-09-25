# Studio Operator

Internal production desk for a one-person AI creative studio.

The loop is: paste a brief, qualify it, price it, approve the plan and a maximum budget, generate inside that limit, review outputs, and record delivery. Upwork, Fiverr, Contra, email, a sales call, or a direct form are intake sources for text you paste. They are not connected accounts.

## Product guardrails

Studio Operator does not:

- scrape a marketplace
- auto-apply to jobs
- submit proposals
- accept contracts
- message anyone through a marketplace
- deliver files through a marketplace

Those actions are rejected in code (`src/lib/guardrails.ts`) and are not implemented. A later change would have to add an explicitly approved integration for that exact action, and a person would still have to approve it. Final delivery in this app only marks the job delivered on this desk.

Human approval is required for:

- the initial workflow and maximum production budget
- any budget increase
- a material workflow change
- a rights issue
- final delivery

After the workflow and budget are approved, generation can run only inside that maximum.

## Run

```bash
npm i
npm run dev
```

Open http://localhost:3000.

`npm run dev` creates `.env` from `.env.example` when it is missing, applies the SQLite migration, and seeds the demo. No API keys are required. `STUDIO_OPERATOR_MODE=mock` is the default. The database file is `prisma/dev.db` (`DATABASE_URL=file:./dev.db`, resolved beside the Prisma schema).

Reset the demo data:

```bash
npm run db:reset
```

Check the workflow without the browser:

```bash
npm run smoke
```

## What you can do

1. Open the pipeline. Seeded jobs fill New, Needs Review, Approved, Generating, QA, Delivered, and Rejected.
2. Open **Meridian — Northline concept film** for the full brief, decision, workflow, costs, outputs, and a pending revision.
3. Open **Hearth & Rye — weekend loaf loop** for a shorter brief that is waiting on review.
4. Use **New Job**, paste a brief, then Analyze, Build production plan, Approve workflow and budget, and Run approved generation.
5. On the Costs tab, change the channel fee and contingency. The profitability panel recalculates expected gross margin.

Margin formula:

`client price − estimated generation − contingency − channel fee`

Contingency is a percent of estimated generation. The channel fee is a percent of the client price and is only a planning assumption. Source defaults: Upwork 10%, Fiverr 20%, Contra / email / sales call / direct intake 0%. You can override either number per job until delivery.

## Layout

- `src/server/repositories/job-repository.ts` — persistence interface
- `src/server/repositories/prisma-job-repository.ts` — SQLite implementation
- `src/server/studio.ts` — qualify, plan, approve, generate, revise, deliver
- `src/server/services/analyze-brief.ts` — mock GPT-6 Astra analysis (`OPENAI_COMPAT_MODEL`)
- `src/server/services/providers.ts` — mock Higgsfield stub (image, video, voice, editing, finishing)
- `src/lib/guardrails.ts` — forbidden marketplace operations
- `prisma/schema.prisma` — Job, BriefAnalysis, WorkflowStep, Generation, Revision, ApprovalGate

To move to Postgres later, keep the repository interface and replace `PrismaJobRepository`. Do not call Prisma from the UI.

## Out of scope in this build

Live model calls, live Higgsfield calls, marketplace OAuth, proposal sending, and auth. Setting `STUDIO_OPERATOR_MODE=live` returns an error and does not send a request.
