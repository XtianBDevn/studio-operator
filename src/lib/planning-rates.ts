import type { Capability } from "@/lib/analysis"

/**
 * Layer 1 — Planning capability rates.
 *
 * Desk economics for image, video, voice, editing, and finishing.
 * These are planning rates, not Higgsfield or any other provider list price.
 * Analysis and the route calculator use only these figures. Models must not invent prices.
 * A live submit that this desk can actually send still requests a provider estimate first.
 */
export const PLANNING_RATES: Record<Capability, { unitCostCents: number; unitLabel: string }> = {
  image: { unitCostCents: 800, unitLabel: "still" },
  video: { unitCostCents: 4500, unitLabel: "5-second shot" },
  voice: { unitCostCents: 1500, unitLabel: "voice line" },
  editing: { unitCostCents: 2500, unitLabel: "assembly pass" },
  finishing: { unitCostCents: 2000, unitLabel: "finishing pass" },
}

export const PLANNING_RATE_NOTE =
  "Costs are desk planning rates for the capability, not a provider list price. They are not a Higgsfield quote. A live submit this desk can send still requests an estimate before any paid generation."

/** Layer 1 prices passed into the desk calculator. No model ids and no provider quotes. */
export function planningCapabilityPrices(): Record<Capability, { unitCostCents: number }> {
  return {
    image: { unitCostCents: PLANNING_RATES.image.unitCostCents },
    video: { unitCostCents: PLANNING_RATES.video.unitCostCents },
    voice: { unitCostCents: PLANNING_RATES.voice.unitCostCents },
    editing: { unitCostCents: PLANNING_RATES.editing.unitCostCents },
    finishing: { unitCostCents: PLANNING_RATES.finishing.unitCostCents },
  }
}
