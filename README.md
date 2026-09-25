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

Analysis uses GPT-6 Astra through the OpenAI Responses API when `OPENAI_API_KEY` is set and `STUDIO_ANALYSIS_MODE` is not `mock`. The key stays on the server. Structured output is validated before anything is written. Without a key, the same schema is filled by a local mock. Planning prices come from the model catalog and the deterministic cost calculator. If a price is missing, the job goes to human review. A live Higgsfield estimate, when credentials are set, is the cost recorded for that image or video request.

```bash
npm run test:analysis
npm run test:higgsfield
npm run smoke
```

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
4. Use **New Job**, paste a brief, then Analyze. Open **Review analysis** to edit any extracted field, compare it with the original, and approve or reject the job.
5. Build production plan, Approve workflow and budget, and Run approved generation. On the Costs tab, change the channel fee and contingency. The profitability panel recalculates expected gross margin.
6. Open **Connection** to confirm a paid SOUL V2 still. Without `HF_API_KEY_ID` and `HF_API_KEY_SECRET` the screen refuses before any network call.

The production budget is the client price minus the channel fee minus the target margin (`TARGET_MARGIN_BPS`, default 25%). Generation cost plus contingency has to fit inside that budget. Astra can estimate attempts. The desk makes the accept, human-review, or reject call from catalog prices, source fees, contingency, and the approved attempt limits.

Margin formula:

`client price − estimated generation − contingency − channel fee`

Contingency is a percent of estimated generation. The channel fee is a percent of the client price and is only a planning assumption. Source defaults: Upwork 10%, Fiverr 20%, Contra / email / sales call / direct intake 0%. You can override either number per job until delivery.

## Layout

- `src/server/repositories/job-repository.ts` — persistence interface
- `src/server/repositories/prisma-job-repository.ts` — SQLite implementation
- `src/server/studio.ts` — qualify, plan, approve, generate, revise, deliver
- `src/lib/analysis.ts` — analysis schema, validation, and deterministic accept / human-review / reject
- `src/server/services/analyze-brief.ts` — GPT-6 Astra via the Responses API, or the local mock
- `src/app/jobs/[id]/review/page.tsx` — human review of the original and edited analysis
- `src/server/services/providers.ts` — local previews when `STUDIO_OPERATOR_MODE=mock`
- `src/server/services/higgsfield/` — REST adapter for estimate, submit, poll, and queued cancel
- `src/app/connection/page.tsx` — confirmed connection test
- `src/lib/guardrails.ts` — forbidden marketplace operations
- `prisma/schema.prisma` — Job, BriefAnalysis, WorkflowStep, Generation, Revision, ApprovalGate, ConnectionTest

To move to Postgres later, keep the repository interface and replace `PrismaJobRepository`. Do not call Prisma from the UI.

## Higgsfield

The adapter follows the current REST docs, not the blocking TypeScript `subscribe()` helper:

- Authentication: [Key KEY_ID:KEY_SECRET](https://docs.higgsfield.ai/docs/authentication.md) via `HF_API_KEY_ID` and `HF_API_KEY_SECRET`
- Lifecycle: [queued, in_progress, completed, failed, nsfw, canceled](https://docs.higgsfield.ai/docs/concepts/requests.md)
- Estimate before submit: [POST /estimate/{endpoint-id}](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md) returns `credits` and `usd` strings
- Polling: [status URL, 2s backoff to 10s, jitter](https://docs.higgsfield.ai/docs/concepts/polling.md)
- Cancel: POST the returned `cancel_url`, only while the provider status is `queued` (202, or 400 once started)
- Image: [SOUL V2 `higgsfield-ai/soul/v2/standard`](https://docs.higgsfield.ai/docs/models/soul-2/generate.md)
- Video: [Kling 3.0 Standard `kling-video/v3.0/std/text-to-video`](https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md)
- SDK note: [@higgsfield/client v2 subscribe](https://docs.higgsfield.ai/docs/how-to/sdk.md) does not document estimate, queued cancel, or an application timeout separate from provider status

`completed` is stored as desk status `succeeded`. If polling passes `HIGGSFIELD_POLL_TIMEOUT_MS`, the desk status is `timed_out` and the provider status stays `queued` or `in_progress`. Failed, NSFW, canceled, and timed-out rows are not charged. When the status payload has no USD amount, the recorded cost for a completed job is the pre-submit estimate (`provider_estimate`). Completed files are copied under `storage/` and served by this app.

Webhooks are documented, but this local app has no public HTTPS endpoint. Polling the returned status URL is the recovery path. Voice, editing, and finishing have no verified generation endpoint here, so those steps stay local previews even in live mode. Mock mode never calls the network.

## Out of scope in this build

Marketplace OAuth, proposal sending, and auth. A full model router, QA demo library, and client-agent autonomy are later prompts. Analysis calls OpenAI only when `OPENAI_API_KEY` is set.
