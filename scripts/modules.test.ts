import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { DESK_MODULE_OWNERS } from "../src/server/modules/owners"
import { plannedStepsFromRouteLines } from "../src/server/services/plan-from-analysis"
import { recordQaRepairPreview } from "../src/server/services/provider-run"
import type { JobRepository } from "../src/server/repositories/job-repository"
import type { JobDetail, WorkflowStepRecord } from "../src/lib/types"
import type { QaEvaluation } from "../src/lib/qa"
import type { RouteLine } from "../src/lib/route"

function line(): RouteLine {
  return {
    position: 1,
    stage: "repair",
    role: "FINISH",
    catalogGroup: "FINISH",
    name: "Continuity",
    capability: "video",
    modelId: "bytedance/seedance-2.5/video-edit",
    modelLabel: "Seedance 2.5 video edit",
    why: "Repair the cut.",
    failureMode: "Needs a source video.",
    alternativeModelId: "kling-video/v3.0/std/image-to-video",
    alternativeLabel: "Kling 3.0 Standard image-to-video",
    attempts: 1,
    requestedAttempts: 1,
    unitCostCents: 4500,
    lineCents: 4500,
    unitLabel: "5-second shot",
    docsUrl: "https://docs.higgsfield.ai/docs/models/seedance-2-5/video-edit.md",
    substituteNote: null,
    liveSubmit: false,
    capped: false,
    attemptLimit: 12,
  }
}

function repairJob(): JobDetail {
  const step: WorkflowStepRecord = {
    id: "step_repair",
    position: 4,
    name: "Continuity",
    selectedModel: "bytedance/seedance-2.5/video-edit",
    modelKind: "video",
    purpose: "Repair the cut if needed.",
    inputs: [],
    expectedOutputs: [],
    estimatedAttempts: 1,
    unitCostCents: 4500,
    estimatedTotalCents: 4500,
    routeStage: "repair",
    routeRole: "FINISH",
    whyFit: null,
    failureMode: null,
    alternativeModel: null,
    docsUrl: null,
    substituteNote: null,
    approvalStatus: "approved",
    status: "ready",
  }
  return {
    id: "job_modules",
    title: "Repair boundary",
    source: "intake",
    rawBrief: "A short film.",
    budgetCents: 100_000,
    deadline: null,
    status: "qa",
    clientNotes: "",
    channelFeeBps: 0,
    contingencyBps: 0,
    maxBudgetCents: 50_000,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    assets: [],
    analysis: null,
    steps: [step],
    generations: [],
    revisions: [],
    approvals: [],
    qaReports: [],
    deliveryNote: null,
  }
}

function repo(): JobRepository {
  const unexpected = (name: string) => async () => {
    throw new Error(`unexpected repo.${name}`)
  }
  return {
    getJob: unexpected("getJob"),
    listSummaries: unexpected("listSummaries"),
    createJob: unexpected("createJob"),
    updateJob: unexpected("updateJob"),
    saveAnalysis: unexpected("saveAnalysis"),
    saveEditedAnalysis: unexpected("saveEditedAnalysis"),
    replaceSteps: unexpected("replaceSteps"),
    updateAllSteps: unexpected("updateAllSteps"),
    updateStep: unexpected("updateStep"),
    generationAssetPath: unexpected("generationAssetPath"),
    createGeneration: unexpected("createGeneration"),
    updateGeneration: unexpected("updateGeneration"),
    completeGeneration: unexpected("completeGeneration"),
    createRevision: unexpected("createRevision"),
    updateRevision: unexpected("updateRevision"),
    openGate: unexpected("openGate"),
    resolveGate: unexpected("resolveGate"),
    saveQaReport: unexpected("saveQaReport"),
    saveDeliveryNote: unexpected("saveDeliveryNote"),
    clearProduction: unexpected("clearProduction"),
    replaceAssets: unexpected("replaceAssets"),
  }
}

const evaluation = {
  repairModelId: "bytedance/seedance-2.5/video-edit",
  repairModelLabel: "Seedance 2.5 video edit",
  incrementalCents: 4500,
} as QaEvaluation

async function main() {
  assert.deepEqual(Object.keys(DESK_MODULE_OWNERS).sort(), [
    "analysis",
    "audit",
    "autonomy",
    "catalog",
    "provider",
    "qa",
    "router",
  ])
  for (const path of Object.values(DESK_MODULE_OWNERS)) {
    assert.equal(readFileSync(path, "utf8").length > 0, true, path)
  }
  const studio = readFileSync("src/server/studio.ts", "utf8")
  assert.match(studio, /runProviderSteps/)
  assert.match(studio, /evaluateJobQa/)
  assert.match(studio, /plannedStepsFromRouteLines/)
  assert.match(studio, /finalizeDeskAnalysis/)
  assert.match(studio, /clearJobSupervision/)
  assert.doesNotMatch(studio, /requestHiggsfieldGeneration|localPreviewGeneration|assertLiveSubmittable/)

  const [planned] = plannedStepsFromRouteLines([line()], ["Master"])
  assert.equal(planned?.selectedModel, "bytedance/seedance-2.5/video-edit")
  assert.equal(planned?.estimatedTotalCents, 4500)
  assert.deepEqual(planned?.expectedOutputs, ["Master"])

  const previous = process.env.STUDIO_OPERATOR_MODE
  process.env.STUDIO_OPERATOR_MODE = "live"
  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    calls.push(String(input))
    throw new Error("network")
  }
  try {
    await assert.rejects(
      () => recordQaRepairPreview(repo(), repairJob(), evaluation),
      /not a live-submittable workflow/,
    )
    assert.deepEqual(calls, [])
  } finally {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.STUDIO_OPERATOR_MODE
    else process.env.STUDIO_OPERATOR_MODE = previous
  }

  console.log("modules ok")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
