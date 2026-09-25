import type { Capability } from "@/lib/analysis"

/**
 * Desk planning rates. These are not Higgsfield list prices.
 * The authenticated estimate API is the quote for a live image or video call.
 */
export const PLANNING_RATES: Record<Capability, { unitCostCents: number; unitLabel: string }> = {
  image: { unitCostCents: 800, unitLabel: "still" },
  video: { unitCostCents: 4500, unitLabel: "5-second shot" },
  voice: { unitCostCents: 1500, unitLabel: "voice line" },
  editing: { unitCostCents: 2500, unitLabel: "assembly pass" },
  finishing: { unitCostCents: 2000, unitLabel: "finishing pass" },
}

export const PLANNING_RATE_NOTE =
  "Costs are desk planning rates for the capability, not a Higgsfield list price. Live image and video calls that this desk can submit still request an estimate before any paid generation."
