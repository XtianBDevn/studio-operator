export type ModelKind = "image" | "video" | "voice" | "editing" | "finishing"

export type CatalogModel = {
  id: string
  label: string
  kind: ModelKind
  unitCostCents: number
  unitLabel: string
}

/**
 * Planning catalog. Image and video ids are current Higgsfield endpoints.
 * Unit costs stay local planning rates. Live USD comes from the estimate API.
 * Voice, editing, and finishing have no verified live endpoint.
 */
export const MODEL_CATALOG: Record<ModelKind, CatalogModel> = {
  image: {
    id: "higgsfield-ai/soul/v2/standard",
    label: "Higgsfield SOUL V2",
    kind: "image",
    unitCostCents: 800,
    unitLabel: "still",
  },
  video: {
    id: "kling-video/v3.0/std/text-to-video",
    label: "Kling 3.0 Standard",
    kind: "video",
    unitCostCents: 4500,
    unitLabel: "5-second shot",
  },
  voice: {
    id: "local/voice",
    label: "Local voice preview",
    kind: "voice",
    unitCostCents: 1500,
    unitLabel: "voice line",
  },
  editing: {
    id: "local/edit",
    label: "Local edit preview",
    kind: "editing",
    unitCostCents: 2500,
    unitLabel: "assembly pass",
  },
  finishing: {
    id: "local/finish",
    label: "Local finish preview",
    kind: "finishing",
    unitCostCents: 2000,
    unitLabel: "finishing pass",
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
  if (!legacy) return undefined
  return MODEL_CATALOG[legacy]
}
