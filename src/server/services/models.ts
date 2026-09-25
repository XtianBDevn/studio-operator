export type ModelKind = "image" | "video" | "voice" | "editing" | "finishing"

export type CatalogModel = {
  id: string
  label: string
  kind: ModelKind
  unitCostCents: number
  unitLabel: string
}

/**
 * Mock catalog of generation models available through the Higgsfield API.
 * Live requests are stubbed. Unit costs are planning rates for the local demo.
 */
export const MODEL_CATALOG: Record<ModelKind, CatalogModel> = {
  image: {
    id: "higgsfield/soul",
    label: "Higgsfield Soul",
    kind: "image",
    unitCostCents: 800,
    unitLabel: "still",
  },
  video: {
    id: "higgsfield/dop",
    label: "Higgsfield DoP",
    kind: "video",
    unitCostCents: 4500,
    unitLabel: "5-second shot",
  },
  voice: {
    id: "higgsfield/speak",
    label: "Higgsfield Speak",
    kind: "voice",
    unitCostCents: 1500,
    unitLabel: "voice line",
  },
  editing: {
    id: "higgsfield/edit",
    label: "Higgsfield Edit",
    kind: "editing",
    unitCostCents: 2500,
    unitLabel: "assembly pass",
  },
  finishing: {
    id: "higgsfield/finish",
    label: "Higgsfield Finish",
    kind: "finishing",
    unitCostCents: 2000,
    unitLabel: "finishing pass",
  },
}

export function modelById(id: string): CatalogModel | undefined {
  return Object.values(MODEL_CATALOG).find((model) => model.id === id)
}
