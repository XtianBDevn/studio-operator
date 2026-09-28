import type { StoredAnalysis } from "@/lib/analysis"
import { StudioError } from "@/lib/errors"
import { proposeRoute, type RouteContext, type RouteLine } from "@/lib/route"
import type { PlannedStep } from "@/server/services/plan-workflow"

/** Router owner: priced route lines become the steps the desk stores. */
export function plannedStepsFromRouteLines(lines: readonly RouteLine[], outputNames: readonly string[]): PlannedStep[] {
  return lines.map((line) => ({
    position: line.position,
    name: line.name,
    selectedModel: line.modelId,
    modelKind: line.capability,
    purpose: line.why,
    inputs: [
      "Approved brief",
      `Route ${line.stage}`,
      `Role ${line.role}`,
      `Alternative ${line.alternativeLabel}`,
    ],
    expectedOutputs: outputNames.length > 0 ? [...outputNames] : [line.name],
    estimatedAttempts: line.attempts,
    unitCostCents: line.unitCostCents,
    estimatedTotalCents: line.lineCents,
    routeStage: line.stage,
    routeRole: line.role,
    whyFit: line.why,
    failureMode: line.failureMode,
    alternativeModel: line.alternativeModelId,
    docsUrl: line.docsUrl,
    substituteNote: line.substituteNote,
  }))
}

export function planFromAnalysis(document: StoredAnalysis, context: RouteContext = {}): PlannedStep[] {
  if (!document.costing.pricesComplete) {
    throw new StudioError(
      "Price data is missing, so this job cannot be planned. It stays in human review.",
    )
  }
  if (document.proposedWorkflow.length === 0) {
    throw new StudioError("The analysis did not propose any production steps.")
  }

  const route = proposeRoute(document, context)
  const outputs = document.deliverables.map((item) => item.name).slice(0, 4)
  return plannedStepsFromRouteLines(route.billed, outputs)
}
