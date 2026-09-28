# Product lock

Studio Operator is a marketplace-agnostic creative studio desk for one person. Paste briefs only. Loop: brief → qualify → price → approve → route → generate → QA → deliver.

Read this file before every stage in `docs/agent-prompts/`. If a task conflicts with this lock, do not do that task.

## Non-negotiable

- **Paste-only intake.** Upwork, Fiverr, Contra, email, a sales call, or a form are labels on pasted text. They are not integrations. Refusals stay in `src/lib/guardrails.ts`.
- **Desk economics.** Planning capability rates and the desk calculator decide accept / human review / reject. Analysis never receives catalog prices. Models must not invent prices, endpoints, or queue times.
- **Mock-first.** `STUDIO_OPERATOR_MODE=mock` is the default. The full desk path runs without keys. Live mode is opt-in.
- **Two live workflows only.** SOUL V2 still and Kling 3.0 Standard text-to-video. Everything else is planning or mock until a dated live evidence note exists. See the catalog layers below.
- **Marketplace refuse.** Do not scrape, auto-apply, message, accept a contract, or deliver through a marketplace. Drafts are not sends.
- **Human gates.** A person approves the workflow and maximum spend, any budget increase, a material workflow change, a rights issue, final delivery, and any QA repair outside the per-repair and per-job caps. Likeness or voice, ownership, factual claims, packaging or regulated copy, negative margin, deadline risk, and a dispute always pause.
- **Consent non-transfer.** Client memory stores person and use. A stored consent does not cover a new person or a new use.
- **No new platform shell.** No marketplace APIs, auth, webhooks, or multi-tenant billing in this pack.

## Catalog layers

Do not collapse these. They are exported from `src/lib/catalog.ts`.

1. **Planning capability rates** — `src/lib/planning-rates.ts`. Image, video, voice, editing, finishing. Labeled as planning rates, not provider list prices.
2. **Routable model ids** — `src/lib/router-catalog.ts`. What the transparent router may propose, with documented substitutes where Seedream, Flux, Veo, Speak, Topaz, lip sync, or captions are missing.
3. **Live-submittable workflows** — `src/lib/live-workflows.ts`. Only `higgsfield-ai/soul/v2/standard` and `kling-video/v3.0/std/text-to-video`. In live mode, any other route step fails before a network call.

## Stop

Do not expand scope to “helpfully” send, price, or wire a model this lock does not allow. Finish the assigned stage, run its checks, and wait for verify before the next file.
