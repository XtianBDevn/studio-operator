import assert from "node:assert/strict"

import { finalizeAnalysis } from "../src/lib/analysis"
import { demoDeadline, GLASS_MONUMENT, NIGHT_ORCHARD, type DemoSpec } from "../src/lib/demos"
import { PLANNING_RATES, planningCapabilityPrices } from "../src/lib/planning-rates"
import { computeProfitability } from "../src/lib/profitability"
import { proposeRoute, type RouteLine } from "../src/lib/route"
import { QUERYABLE_AUDIT_KINDS } from "../src/server/services/audit"
import { catalogPrices, mockAnalysisDraft } from "../src/server/services/analyze-brief"

/**
 * Glass Monument and Night Orchard outcomes.
 * Margin is the desk formula on planning rates times the fixture attempt counts.
 * Copy in route "why" lines is not asserted.
 */

const NOW = new Date("2026-09-25T12:00:00.000Z")

const GLASS_ROUTE = [
  ["Concept stills", "z-image/turbo", "SEARCH", "explore"],
  ["Controlled keyframes", "marketing-studio/image", "CONTROL", "control"],
  ["Final motion", "kling-video/v3.0/pro/text-to-video", "SHIP", "ship"],
  ["Continuity repair", "bytedance/seedance-2.5/video-edit", "CONTROL", "repair"],
  ["Finish", "local/finish", "FINISH", "finish"],
]

const ORCHARD_ROUTE = [
  ["Hero still", "xai/grok-imagine-image-2.0", "CONTROL", "control"],
  ["Orbit", "higgsfield/cinema-studio/4.0", "SHIP", "ship"],
  ["Finish", "local/finish", "FINISH", "finish"],
]

function generationFromPlanningRates(spec: DemoSpec): number {
  return spec.workflow.reduce(
    (sum, step) => sum + PLANNING_RATES[step.capability].unitCostCents * step.attempts,
    0,
  )
}

function routeFor(spec: DemoSpec) {
  const deadlineIso = demoDeadline(spec, NOW).toISOString()
  const draft = mockAnalysisDraft({
    rawBrief: spec.rawBrief,
    assetLabels: spec.assets.map((asset) => asset.label),
    budgetCents: spec.budgetCents,
    channelFeeBps: spec.channelFeeBps,
    contingencyBps: spec.contingencyBps,
    deadlineIso,
    now: NOW,
  })
  const analysis = finalizeAnalysis(draft, {
    clientPriceCents: spec.budgetCents,
    channelFeeBps: spec.channelFeeBps,
    contingencyBps: spec.contingencyBps,
    deadlineIso,
    now: NOW,
    targetMarginBps: 2500,
    catalog: catalogPrices(),
  })
  const route = proposeRoute(analysis, {
    rawBrief: spec.rawBrief,
    deadlineIso,
    now: NOW,
    referenceCount: spec.assets.length,
  })
  return { analysis, route }
}

function assertPlanningRates(lines: RouteLine[]) {
  for (const line of lines) {
    assert.equal(line.unitCostCents, PLANNING_RATES[line.capability].unitCostCents, line.name)
    assert.equal(line.lineCents, line.unitCostCents * line.attempts, line.name)
  }
}

function assertMargin(spec: DemoSpec, estimatedGenerationCents: number) {
  const fromFixture = computeProfitability({
    clientPriceCents: spec.budgetCents,
    estimatedGenerationCents: generationFromPlanningRates(spec),
    contingencyBps: spec.contingencyBps,
    channelFeeBps: spec.channelFeeBps,
  })
  const fromRoute = computeProfitability({
    clientPriceCents: spec.budgetCents,
    estimatedGenerationCents,
    contingencyBps: spec.contingencyBps,
    channelFeeBps: spec.channelFeeBps,
  })
  assert.equal(estimatedGenerationCents, generationFromPlanningRates(spec))
  assert.equal(fromRoute.expectedGrossMarginCents, fromFixture.expectedGrossMarginCents)
  assert.equal(
    fromRoute.expectedGrossMarginCents,
    spec.budgetCents - fromRoute.estimatedGenerationCents - fromRoute.contingencyCents - fromRoute.channelFeeCents,
  )
  assert.ok(fromRoute.expectedGrossMarginCents > 0)
}

function main() {
  assert.deepEqual(catalogPrices(), planningCapabilityPrices())

  const glass = routeFor(GLASS_MONUMENT)
  assert.equal(glass.analysis.decision, "accept")
  assert.deepEqual(
    glass.route.billed.map((item) => [item.name, item.modelId, item.role, item.stage]),
    GLASS_ROUTE,
  )
  assert.equal(glass.route.billed.filter((item) => item.stage === "repair").length, 1)
  assertPlanningRates(glass.route.billed)
  assertMargin(GLASS_MONUMENT, glass.route.maxSpendCents)

  const orchard = routeFor(NIGHT_ORCHARD)
  assert.equal(orchard.analysis.decision, "accept")
  assert.deepEqual(
    orchard.route.billed.map((item) => [item.name, item.modelId, item.role, item.stage]),
    ORCHARD_ROUTE,
  )
  assert.equal(
    orchard.route.billed.some((item) => item.stage === "explore" || item.stage === "repair"),
    false,
  )
  assertPlanningRates(orchard.route.billed)
  assertMargin(NIGHT_ORCHARD, orchard.route.maxSpendCents)
  assert.notEqual(
    orchard.route.billed.map((item) => item.modelId).join(),
    glass.route.billed.map((item) => item.modelId).join(),
  )

  for (const kind of [
    "model_decision",
    "message_draft",
    "approval",
    "generation",
    "repair",
    "cost_change",
    "escalation",
  ]) {
    assert.equal(QUERYABLE_AUDIT_KINDS.includes(kind as (typeof QUERYABLE_AUDIT_KINDS)[number]), true, kind)
  }

  console.log("fixture tests passed")
}

main()
