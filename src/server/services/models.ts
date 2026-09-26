import { PLANNING_RATES } from "@/lib/planning-rates"
import { catalogById } from "@/lib/router-catalog"

export type ModelKind = "image" | "video" | "voice" | "editing" | "finishing"

export type CatalogModel = {
  id: string
  label: string
  kind: ModelKind
  unitCostCents: number
  unitLabel: string
}

/**
 * Default connected models for each capability.
 * Unit costs are desk planning rates. The router may select another documented id
 * at the same capability rate. Live USD still comes from the estimate API.
 */
export const MODEL_CATALOG: Record<ModelKind, CatalogModel> = {
  image: {
    id: "higgsfield-ai/soul/v2/standard",
    label: "Higgsfield SOUL V2",
    kind: "image",
    unitCostCents: PLANNING_RATES.image.unitCostCents,
    unitLabel: PLANNING_RATES.image.unitLabel,
  },
  video: {
    id: "kling-video/v3.0/std/text-to-video",
    label: "Kling 3.0 Standard",
    kind: "video",
    unitCostCents: PLANNING_RATES.video.unitCostCents,
    unitLabel: PLANNING_RATES.video.unitLabel,
  },
  voice: {
    id: "local/voice",
    label: "Desk voice line",
    kind: "voice",
    unitCostCents: PLANNING_RATES.voice.unitCostCents,
    unitLabel: PLANNING_RATES.voice.unitLabel,
  },
  editing: {
    id: "local/edit",
    label: "Desk assembly",
    kind: "editing",
    unitCostCents: PLANNING_RATES.editing.unitCostCents,
    unitLabel: PLANNING_RATES.editing.unitLabel,
  },
  finishing: {
    id: "local/finish",
    label: "Desk finish",
    kind: "finishing",
    unitCostCents: PLANNING_RATES.finishing.unitCostCents,
    unitLabel: PLANNING_RATES.finishing.unitLabel,
  },
}

const LEGACY_IDS: Record<string, ModelKind> = {
  "higgsfield/soul": "image",
  "higgsfield/dop": "video",
  "higgsfield/speak": "voice",
  "higgsfield/edit": "editing",
  "higgsfield/finish": "finishing",
}

export function modelById(id: string): CatalogModel | undefined {
  const current = Object.values(MODEL_CATALOG).find((model) => model.id === id)
  if (current) return current
  const legacy = LEGACY_IDS[id]
  if (legacy) return MODEL_CATALOG[legacy]
  const routed = catalogById(id)
  if (!routed) return undefined
  const rate = PLANNING_RATES[routed.capability]
  return {
    id: routed.id,
    label: routed.label,
    kind: routed.capability,
    unitCostCents: rate.unitCostCents,
    unitLabel: rate.unitLabel,
  }
}
