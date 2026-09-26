import assert from "node:assert/strict"

import { planningCapabilityPrices, PLANNING_RATES, PLANNING_RATE_NOTE } from "../src/lib/planning-rates"
import { catalogPrices } from "../src/server/services/analyze-brief"
import {
  catalogById,
  ROUTER_CATALOG,
  wiredLiveEndpoint,
} from "../src/lib/router-catalog"
import {
  assertLiveSubmittable,
  isLiveSubmittable,
  LIVE_SUBMITTABLE_WORKFLOWS,
  liveNonSubmittableMessage,
  modelLayerLabel,
} from "../src/lib/live-workflows"
import { KLING_V3_STANDARD, SOUL_V2 } from "../src/server/services/higgsfield/workflows"
import { retryGeneration, runLiveSteps } from "../src/server/services/live-generation"
import { runGeneration } from "../src/server/studio"
import type { JobRepository } from "../src/server/repositories/job-repository"
import type { GenerationRecord, JobDetail, WorkflowStepRecord } from "../src/lib/types"

const PLANNING_ONLY = [
  "z-image/turbo",
  "kling-video/v3.0/pro/text-to-video",
  "bytedance/seedance-2.5/video-edit",
  "higgsfield/cinema-studio/4.0",
  "local/voice",
  "local/edit",
  "local/finish",
]

function step(modelId: string, kind: string): WorkflowStepRecord {
  return {
    id: "step_1",
    position: 1,
    name: "Shot",
    selectedModel: modelId,
    modelKind: kind,
    purpose: "Make the shot.",
    inputs: [],
    expectedOutputs: ["A frame"],
    estimatedAttempts: 1,
    unitCostCents: 800,
    estimatedTotalCents: 800,
    routeStage: "ship",
    routeRole: "SHIP",
    whyFit: null,
    failureMode: null,
    alternativeModel: null,
    docsUrl: null,
    substituteNote: null,
    approvalStatus: "approved",
    status: "ready",
  }
}

function jobWith(modelId: string, kind: string, generations: GenerationRecord[] = []): JobDetail {
  return {
    id: "job_catalog_guard",
    title: "Catalog guard",
    source: "intake",
    rawBrief: "A still of a gray square.",
    budgetCents: 100_000,
    deadline: null,
    status: "approved",
    clientNotes: "",
    channelFeeBps: 0,
    contingencyBps: 0,
    maxBudgetCents: 50_000,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    assets: [],
    analysis: null,
    steps: [step(modelId, kind)],
    generations,
    revisions: [],
    approvals: [],
    qaReports: [],
    deliveryNote: null,
  }
}

function repoFor(job: JobDetail): JobRepository {
  const unexpected = (name: string) => async () => {
    throw new Error(`unexpected repo.${name}`)
  }
  return {
    getJob: async () => job,
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

async function withFetchSpy<T>(run: (calls: string[]) => Promise<T>): Promise<T> {
  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`)
    return new Response(JSON.stringify({ detail: "catalog guard should not reach the network" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }
  try {
    return await run(calls)
  } finally {
    globalThis.fetch = original
  }
}

async function main() {
  assert.match(PLANNING_RATE_NOTE, /planning rates/)
  assert.match(PLANNING_RATE_NOTE, /not a provider list price/)
  assert.deepEqual(Object.keys(PLANNING_RATES).sort(), ["editing", "finishing", "image", "video", "voice"])
  for (const rate of Object.values(PLANNING_RATES)) {
    assert.equal(Number.isInteger(rate.unitCostCents) && rate.unitCostCents > 0, true)
    assert.equal(/soul|kling|higgsfield|\$/i.test(rate.unitLabel), false)
  }
  assert.deepEqual(catalogPrices(), planningCapabilityPrices())
  assert.deepEqual(catalogPrices().image, { unitCostCents: 800 })
  assert.equal("modelId" in catalogPrices().video, false)

  const ids = ROUTER_CATALOG.map((model) => model.id)
  assert.equal(new Set(ids).size, ids.length)
  const notes = ROUTER_CATALOG.map((model) => `${model.substituteNote ?? ""} ${model.constraint}`).join("\n")
  assert.match(notes, /Seedream/)
  assert.match(notes, /Flux/)
  assert.match(notes, /Veo/)
  assert.match(notes, /Speak/)
  assert.match(notes, /Topaz/)
  for (const model of ROUTER_CATALOG) {
    assert.equal(catalogById(model.alternativeId)?.id, model.alternativeId)
    assert.equal(model.liveSubmit, isLiveSubmittable(model.id))
    assert.equal(/seedream|flux|veo|topaz|speak/i.test(model.id), false)
  }

  const liveIds = Object.values(LIVE_SUBMITTABLE_WORKFLOWS).map((workflow) => workflow.modelId).sort()
  assert.deepEqual(liveIds, ["higgsfield-ai/soul/v2/standard", "kling-video/v3.0/std/text-to-video"])
  assert.equal(SOUL_V2.endpointId, LIVE_SUBMITTABLE_WORKFLOWS.soul.modelId)
  assert.equal(KLING_V3_STANDARD.endpointId, LIVE_SUBMITTABLE_WORKFLOWS.kling.modelId)
  assert.equal(wiredLiveEndpoint(SOUL_V2.endpointId), "soul")
  assert.equal(wiredLiveEndpoint(KLING_V3_STANDARD.endpointId), "kling")
  assert.equal(wiredLiveEndpoint("kling-video/v3.0/pro/text-to-video"), null)
  assert.equal(
    ROUTER_CATALOG.filter((model) => model.liveSubmit).map((model) => model.id).sort().join(","),
    liveIds.join(","),
  )
  assert.equal(modelLayerLabel(SOUL_V2.endpointId), "Live submit")
  assert.equal(modelLayerLabel("z-image/turbo"), "Planning only")

  assert.equal(assertLiveSubmittable(SOUL_V2.endpointId), "soul")
  assert.equal(assertLiveSubmittable(KLING_V3_STANDARD.endpointId), "kling")
  for (const modelId of PLANNING_ONLY) {
    assert.equal(isLiveSubmittable(modelId), false)
    assert.throws(() => assertLiveSubmittable(modelId), /not a live-submittable workflow/)
    assert.match(liveNonSubmittableMessage(modelId), /No request was sent/)
    assert.match(liveNonSubmittableMessage(modelId), new RegExp(modelId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  const previousMode = process.env.STUDIO_OPERATOR_MODE
  const previousKey = process.env.HF_API_KEY_ID
  const previousSecret = process.env.HF_API_KEY_SECRET
  process.env.STUDIO_OPERATOR_MODE = "live"
  delete process.env.HF_API_KEY_ID
  delete process.env.HF_API_KEY_SECRET

  await withFetchSpy(async (calls) => {
    await assert.rejects(
      () => runGeneration(repoFor(jobWith("z-image/turbo", "image")), "job_catalog_guard"),
      /z-image\/turbo is not a live-submittable workflow/,
    )
    assert.deepEqual(calls, [])
  })

  await withFetchSpy(async (calls) => {
    await assert.rejects(
      () => runGeneration(repoFor(jobWith("local/finish", "finishing")), "job_catalog_guard"),
      /local\/finish is not a live-submittable workflow/,
    )
    assert.deepEqual(calls, [])
  })

  process.env.HF_API_KEY_ID = "kid_catalog_guard"
  process.env.HF_API_KEY_SECRET = "ksec_catalog_guard"

  await withFetchSpy(async (calls) => {
    await assert.rejects(
      () => runLiveSteps(repoFor(jobWith("kling-video/v3.0/pro/text-to-video", "video")), jobWith("kling-video/v3.0/pro/text-to-video", "video")),
      /not a live-submittable workflow/,
    )
    assert.deepEqual(calls, [])
  })

  const failed: GenerationRecord = {
    id: "gen_1",
    stepId: "step_1",
    providerRequestId: "mock_previous",
    model: "local/voice",
    status: "failed",
    providerStatus: null,
    statusUrl: null,
    cancelUrl: null,
    correlationId: null,
    settingsJson: null,
    assetKind: null,
    providerOutputUrl: null,
    costEstimateCents: 1500,
    actualCostCents: null,
    estimatedCredits: null,
    estimatedUsd: null,
    actualCredits: null,
    actualUsd: null,
    costSource: null,
    retryOfId: null,
    outputUrl: null,
    error: "earlier failure",
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    completedAt: "2026-09-26T00:00:00.000Z",
  }
  await withFetchSpy(async (calls) => {
    const voiceJob = jobWith("local/voice", "voice", [failed])
    await assert.rejects(() => retryGeneration(repoFor(voiceJob), voiceJob.id, failed.id), /not a live-submittable/)
    assert.deepEqual(calls, [])
  })

  await withFetchSpy(async (calls) => {
    const soulJob = jobWith(SOUL_V2.endpointId, "image")
    await assert.rejects(() => runLiveSteps(repoFor(soulJob), soulJob), (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      assert.equal(/not a live-submittable/.test(message), false)
      return true
    })
    assert.equal(calls.length > 0, true)
    assert.match(calls[0] ?? "", /estimate\/higgsfield-ai\/soul\/v2\/standard/)
  })

  process.env.STUDIO_OPERATOR_MODE = previousMode
  if (previousKey === undefined) delete process.env.HF_API_KEY_ID
  else process.env.HF_API_KEY_ID = previousKey
  if (previousSecret === undefined) delete process.env.HF_API_KEY_SECRET
  else process.env.HF_API_KEY_SECRET = previousSecret

  console.log("catalog ok")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
