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
- a QA repair that would exceed the approved per-repair or per-job limit

After the workflow and budget are approved, generation can run only inside that maximum. A priced continuity repair can run from QA only inside those same limits.

## Run

```bash
npm i
npm run dev
```

Open http://localhost:3000. The recording demos are at http://localhost:3000/record. Supervised autonomy is at http://localhost:3000/autonomy.

`npm run dev` creates `.env` from `.env.example` when it is missing, applies the SQLite migration, and seeds the demo. No API keys are required. `STUDIO_OPERATOR_MODE=mock` is the default. The database file is `prisma/dev.db` (`DATABASE_URL=file:./dev.db`, resolved beside the Prisma schema).

Analysis uses GPT-6 Astra through the OpenAI Responses API when `OPENAI_API_KEY` is set and `STUDIO_ANALYSIS_MODE` is not `mock`. The key stays on the server. Structured output is validated before anything is written. Without a key, the same schema is filled by a local mock. Planning prices come from the model catalog and the deterministic cost calculator. If a price is missing, the job goes to human review. A live Higgsfield estimate, when credentials are set, is the cost recorded for that image or video request.

```bash
npm run test:analysis
npm run test:router
npm run test:catalog
npm run test:qa
npm run test:autonomy
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

## Agent rebuild pack (v2)

Future cloud agents rebuild one stage at a time from [`docs/agent-prompts/`](docs/agent-prompts/README.md). Read [`00-product-lock.md`](docs/agent-prompts/00-product-lock.md) first. Finish the assigned stage, run its checks, and wait for verify before the next file. Do not pile the remaining stages into one diff.

Stage 01 (catalog truth table) and stage 03 (module boundaries) are done. Stage 02 is this pack. Stages 04 and 05 are prompts only until a person assigns them.

## What you can do

1. Open the pipeline. Seeded jobs fill New, Needs Review, Approved, Generating, QA, Delivered, and Rejected.
2. Open **Meridian — Northline concept film** for the full brief, decision, workflow, costs, outputs, and a pending revision.
3. Open **Hearth & Rye — weekend loaf loop** for a shorter brief that is waiting on review.
4. Use **New Job**, paste a brief, then Analyze. Open **Review analysis** to edit any extracted field, compare it with the original, and approve or reject the job.
5. Build production plan, review the route, override a model or attempt count, and save. The maximum updates before you approve the workflow and budget. Run approved generation only inside that maximum. On the Costs tab, change the channel fee and contingency. The profitability panel recalculates expected gross margin.
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
- `prisma/schema.prisma` — Job, BriefAnalysis, WorkflowStep, Generation, Revision, ApprovalGate, ConnectionTest, QaReport, DeliveryNote, AutonomySettings, ClientAccount, ClientMemory, LikenessConsent, ClientJobLink, ClientMessage, AuditEvent, SuperviseCursor
- `src/server/modules/owners.ts` — which module owns analysis, catalog, routing, provider calls, QA, autonomy, and audit
- `src/server/studio.ts` — status transitions only. It calls those owners.

To move to Postgres later, keep the repository interface and replace `PrismaJobRepository`. Do not call Prisma from the UI.

## Model router

The workflow tab proposes a route before any paid call. It is a transparent plan, not a recommendation score.

The pattern is Explore → Choose → Control → Ship → Repair → Finish → QA. Choose and QA are human gates with no model and no spend. A stage is skipped, with a reason, when the priced workflow does not need it.

Every billed step shows the selected model, why it fits, the documented limit, an alternative, attempts, the desk planning rate, and the line total. The maximum authorized spend is the sum of those lines. Changing the model or the attempt count updates that maximum on the page immediately. Save the route, then approve the workflow and a maximum that covers it. Generation after approval stays inside that maximum.

The catalog is a truth table with three layers (`src/lib/catalog.ts`):

1. **Planning capability rates** (`src/lib/planning-rates.ts`). Image $8, video $45, voice $15, editing $25, finishing $20. These are desk planning rates, not provider list prices. Analysis never receives model ids or list prices.
2. **Routable model ids** (`src/lib/router-catalog.ts`). SEARCH, CONTROL, SHIP, and FINISH from the [image index](https://docs.higgsfield.ai/docs/models/image-generation.md) and [video index](https://docs.higgsfield.ai/docs/models/video-generation.md) checked on 2026-09-25. Seedream, Flux, Veo, Topaz, Speak, lip sync, and caption tools were not on those indexes. Substitutes are named on the step: Marketing Studio Image or Grok Image 2.0 for product references, Kling 3.0 Pro or Seedance 2.5 or Cinema Studio 4.0 for premium motion, PixVerse V6 or Wan 2.6 for talking scenes, and a desk finish pass where no upscaler was documented.
3. **Live-submittable workflows** (`src/lib/live-workflows.ts`). Only SOUL V2 still and Kling 3.0 Standard text-to-video. In `STUDIO_OPERATOR_MODE=live`, generating a route step outside that pair fails with a clear error before any network call. Mock mode remains the default and previews every routable id locally.

The route shows each model as **Live submit** or **Planning only**. A planning rate on a line is not a claim that the model is wired.

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

Webhooks are documented, but this local app has no public HTTPS endpoint. Polling the returned status URL is the recovery path. Voice, editing, finishing, and every routable id outside the two live workflows are refused in live mode before a provider call. Mock mode never calls the network and can still preview them locally.

## QA and recording

QA compares each succeeded output with the approved brief and stores a checklist: deliverable type, duration, aspect ratio, resolution, brand consistency, exact text, required scenes, prohibited elements, face and hands, motion, and audio or lip sync. The verdict is acceptable as a concept, needs a controlled edit, needs regeneration, or ready for human delivery review. Mock QA reads the brief and the generation records. It does not inspect pixels.

A repair runs on its own only when the approved plan already priced that step, the incremental cost stays inside the step and the job maximum, and the attempt stays inside the approved limit. The desk shows the reason, the selected model, the incremental cost, the new total, and the updated margin. Anything outside those limits opens a human gate and does not generate.

Two seeded briefs use that path. **After the Rain: Glass Monument** is a 72-hour Upwork-style package: a short film in 9:16 and 16:9 plus three keyframes. Its route is Z-Image Turbo for inexpensive concepts, Marketing Studio for controlled keyframes, Kling 3.0 Pro for premium motion, Seedance 2.5 video edit for one continuity repair, and a local finish. **Night Orchard: Slow Orbit** is a different problem: Grok Image 2.0 locks the hero still and Cinema Studio 4.0 carries the orbit. It does not add a concept batch or a repair. Planning rates are unchanged. Seedance and Cinema Studio are routable planning choices. Live submit is still only SOUL V2 and Kling 3.0 Standard. A QA repair of Seedance is a mock preview. In live mode that repair fails before any provider call.

Recording mode (`/record`) is laid out for a desktop capture. It uses large status labels, a reset back to the seeded brief, and one continue button per stage: analysis, approval, generation, QA, and delivery. The page shows a generation ledger, client price beside the channel fee, API cost, contingency, and expected gross profit, then download links and a delivery note drafted by GPT-6 Astra. The note names deliverables only. Reset is limited to the two demo jobs and refreshes the deadline so analysis does not see a past date.

`npm run test:qa` checks the checklist, the spend cap, the two routes, and the delivery note. `npm run test:router` still checks the earlier routing rules, including a rush deadline staying on Kling 3.0 Standard.

## Supervised autonomy

The client agent drafts the routine relationship and a person keeps the promises. Open **Autonomy** to set the automatic spend per job and per repair, the attempt caps, the allowed model families, which first-party messages may send themselves, whether concepts may be shared, and whether final delivery always needs a person. Likeness or voice, unclear ownership, factual claims, exact packaging or regulated copy, a negative margin, deadline risk, and a client dispute always pause. They are not switches.

Proposals, change orders, and delivery packages stay drafts on email and the portal. Progress updates send on the first-party portal only when that message type is allowed. The same text is refused through a marketplace. The app does not scrape, auto-apply, send a proposal, accept a contract, or message through Upwork.

**Service templates** define Launch Video, UGC Ad Pack, and Localization Pack: required inputs, file types, a catalog recipe, a quality checklist, included revisions, the delivery package, a 25% target margin, a production spend ceiling, and escalation conditions. Speak, lip sync, and caption tools are not in the catalog. Voice and captions stay on the desk. PixVerse V6 is the documented video-with-sound substitute, and a person still approves lip sync.

**Client memory** stores logos, colors, fonts, tone, product details, winning assets, rejected styles, and delivery and communication preferences on the account. A stored voice consent covers one person and one use. Harbor Atelier’s narrator consent for the 2024 harbor tour does not cover a monument film or a different person.

**After the Rain** (`/supervise/job_glass_monument`) walks one missing material question, a drafted proposal, a human scope approval, one portal milestone update, mock generation, one reflection and geometry repair inside the automatic cap, an included warmer-reveal revision, a blocked delivery, a human delivery approval, and a follow-up draft. **Night Orchard** (`/supervise/job_night_orchard`) compares its atmosphere route with Glass Monument, refuses a $90 repair that crosses the $45 automatic repair cap, and stops before delivery. Reset on either page, or on Recording, returns the seeded brief and clears that job’s messages and audit. Account memory stays.

`npm run test:autonomy` checks the message rules, spend caps, consent matching, the three templates, and the operator prompt.

## Out of scope in this build

Marketplace OAuth, sending proposals, accepting contracts, and auth. The client agent drafts those messages for a person. It does not perform them. Analysis calls OpenAI only when `OPENAI_API_KEY` is set. Live Higgsfield submit is limited to the two wired workflows above. Live smoke evidence is still open. A Seedance continuity repair is planning-only.
