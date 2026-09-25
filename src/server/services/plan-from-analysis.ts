import { billAttempts, type StoredAnalysis } from "@/lib/analysis"
import { StudioError } from "@/lib/errors"
import { MODEL_CATALOG } from "@/server/services/models"
import type { PlannedStep } from "@/server/services/plan-workflow"

export function planFromAnalysis(document: StoredAnalysis): PlannedStep[] {
  if (!document.costing.pricesComplete) {
    throw new StudioError(
      "Price data is missing, so this job cannot be planned. It stays in human review.",
    )
  }
  if (document.proposedWorkflow.length === 0) {
    throw new StudioError("The analysis did not propose any production steps.")
  }

  return document.proposedWorkflow.map((step, index) => {
    const model = MODEL_CATALOG[step.capability]
    const estimate = document.estimatedAttemptsByStep.find((item) => item.stepName === step.name)
    const billed = billAttempts(estimate?.attempts ?? 1, step.capability).billed
    const outputs = document.deliverables.map((item) => item.name).slice(0, 4)
    return {
      position: index + 1,
      name: step.name,
      selectedModel: model.id,
      modelKind: model.kind,
      purpose: step.purpose,
      inputs: ["Approved brief", `Catalog capability: ${step.capability}`],
      expectedOutputs: outputs.length > 0 ? outputs : [step.name],
      estimatedAttempts: billed,
      unitCostCents: model.unitCostCents,
      estimatedTotalCents: model.unitCostCents * billed,
    }
  })
}
