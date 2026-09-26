import { MODEL_CATALOG } from "@/server/services/models"

export function recommendRevision(input: {
  clientNote: string
  affectedDeliverable: string
  stepCosts: Array<{ name: string; modelKind: string; estimatedTotalCents: number }>
}): { recommendedAction: string; expectedIncrementalCents: number } {
  const note = input.clientNote.toLowerCase()
  const heavy = /reshoot|regenerate|new cut|another version|start over|different concept/.test(note)
  const matching = input.stepCosts.find((step) =>
    input.affectedDeliverable.toLowerCase().includes(step.name.toLowerCase()),
  )
  const finish = MODEL_CATALOG.finishing.unitCostCents
  const base = matching?.estimatedTotalCents ?? finish

  if (heavy) {
    const incremental = Math.max(finish, Math.round(base * 0.5))
    return {
      recommendedAction: `Regenerate ${input.affectedDeliverable} with the already selected model, then finish again.`,
      expectedIncrementalCents: incremental,
    }
  }

  return {
    recommendedAction: `Run one additional finishing pass on ${input.affectedDeliverable}.`,
    expectedIncrementalCents: finish,
  }
}
