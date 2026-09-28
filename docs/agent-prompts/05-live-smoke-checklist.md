# 05 — Live smoke checklist

**Status: not started.** Prompt only. Do not implement this until stage 04 is verified. Do not call a provider while authoring or reading this checklist.

## Outcome

When a person has keys and explicitly assigns this stage, record only measured results. The note is evidence, not a plan.

Write `ai-research/YYYY-MM-DD-studio-operator-live-smoke.md` in the vault (or the path the person gives). Desktop copies are mirrors. If that vault path is not in this repo, do not invent a second product doc here. Put a short pointer in the PR to the evidence note.

## What to record

Only numbers and statuses you actually observed:

- Date, mode (`STUDIO_OPERATOR_MODE=live`), and which credentials were present (name the variable, never the secret).
- OpenAI analysis: model id used, whether structured output validated, and that the prompt did not contain planning rates.
- Higgsfield SOUL V2 still: estimate credits and USD, then submit only after that estimate, provider status, desk status, and whether the file was copied locally.
- Higgsfield Kling 3.0 Standard text-to-video: the same estimate-then-submit sequence.
- One refusal: a planning-only route step (for example Z-Image Turbo or a desk finish) errors before any network call.
- Anything that failed. Write the failure. Do not fill gaps with a guessed price or a guessed queue time.

## Constraints

- Obey [00-product-lock.md](./00-product-lock.md).
- Live submit stays the two workflows in `src/lib/live-workflows.ts`. Do not wire Seedance, Cinema Studio, Speak, or a third model because a page exists.
- Estimate before submit. Application timeout is not a provider status. Cancel only while the provider status is queued.
- If keys are missing, stop and say the smoke did not run. Do not substitute a mock result and call it live.
- No marketplace calls. No webhooks.

## Success criteria

- The evidence note contains only measured fields from the list above, with secrets redacted.
- The catalog layers are unchanged unless a measured doc mismatch is called out as a follow-up, not silently “fixed” by adding a live model.
- `npm run test:catalog` and `npm run test:higgsfield` still pass without a live network.

## Stop

Stop after the evidence note and the PR pointer. Do not start a new product stage from the smoke. Wait for verify.
