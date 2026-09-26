# 01 — Catalog truth table

**Status: done.** Shipped on [PR #4](https://github.com/XtianBDevn/studio-operator/pull/4). Do not redo this stage.

## Already done

The catalog is a truth table with three layers, re-exported from `src/lib/catalog.ts`:

1. Planning capability rates in `src/lib/planning-rates.ts`.
2. Routable model ids in `src/lib/router-catalog.ts`, including documented substitutes.
3. Live-submittable workflows in `src/lib/live-workflows.ts`: SOUL V2 still and Kling 3.0 Standard text-to-video only.

In `STUDIO_OPERATOR_MODE=live`, a route step outside layer 3 fails before any network call. The desk labels other models **Planning only**. Mock stays the default. `npm run test:catalog` covers the three layers and the live guard.

## If you are here

Confirm the three files and `src/lib/catalog.ts` still exist and the lock in [00-product-lock.md](./00-product-lock.md) still matches them. Then stop.

Do not add live models. Do not start [03-module-boundaries.md](./03-module-boundaries.md) from this file.

## Stop

Wait for verify. The next stage is the prompt pack, then module boundaries only after that pack is accepted.
