import assert from "node:assert/strict"

import { clientDeliveryNote, deliveryNoteIsClientSafe } from "../src/lib/delivery-note"
import { GLASS_MONUMENT } from "../src/lib/demos"
import {
  evaluateQa,
  isConditionalRepair,
  QA_CHECK_IDS,
  type QaEvaluationInput,
  type QaGeneration,
  type QaStep,
} from "../src/lib/qa"
import { recordingPause } from "../src/lib/recording"

const repair: QaStep = {
  id: "repair",
  name: "Continuity repair",
  purpose: "Seedance 2.5 video edit. Repair one continuity failure if needed.",
  capability: "video",
  selectedModel: "bytedance/seedance-2.5/video-edit",
  unitCostCents: 4500,
  estimatedAttempts: 1,
  estimatedTotalCents: 4500,
}

const baseSteps: QaStep[] = [
  {
    id: "concept",
    name: "Concept stills",
    purpose: "Inexpensive concepts.",
    capability: "image",
    selectedModel: "z-image/turbo",
    unitCostCents: 800,
    estimatedAttempts: 4,
    estimatedTotalCents: 3200,
  },
  {
    id: "motion",
    name: "Final motion",
    purpose: "Premium cinematic motion.",
    capability: "video",
    selectedModel: "kling-video/v3.0/pro/text-to-video",
    unitCostCents: 4500,
    estimatedAttempts: 3,
    estimatedTotalCents: 13500,
  },
  repair,
]

function generation(stepId: string, model: string, cents: number): QaGeneration {
  return {
    stepId,
    status: "succeeded",
    model,
    actualCostCents: cents,
    costEstimateCents: cents,
  }
}

function input(overrides: Partial<QaEvaluationInput> = {}): QaEvaluationInput {
  const generations = [
    generation("concept", "z-image/turbo", 3200),
    generation("motion", "kling-video/v3.0/pro/text-to-video", 13500),
  ]
  return {
    brief: GLASS_MONUMENT.rawBrief,
    deliverables: [
      {
        name: "One 20-second cinematic film, 1920x1080, 16:9",
        format: "motion",
        aspectRatio: "16:9",
        duration: "20 seconds",
        resolution: "1920x1080",
        exactText: [],
      },
      {
        name: "Three approved keyframe stills, 1920x1080, 16:9",
        format: "still",
        aspectRatio: "16:9",
        duration: "",
        resolution: "1920x1080",
        exactText: [],
      },
    ],
    brandConstraints: ["No people", "Monument architecture, material, scale, and site stay consistent across shots"],
    steps: baseSteps,
    generations,
    spentCents: 16700,
    maxBudgetCents: 29440,
    clientPriceCents: 480_000,
    contingencyBps: 1500,
    channelFeeBps: 1000,
    ...overrides,
  }
}

function main() {
  assert.equal(isConditionalRepair("Assemble the selects into the deliverables named in the brief."), false)
  assert.equal(isConditionalRepair("Repair one continuity failure if needed."), true)

  const before = evaluateQa(input())
  assert.deepEqual(
    before.checklist.map((item) => item.id),
    [...QA_CHECK_IDS],
  )
  assert.equal(before.checklist.find((item) => item.id === "motion")?.status, "fail")
  assert.equal(before.verdict, "controlled_edit")
  assert.equal(before.withinLimits, true)
  assert.equal(before.repairModelId, "bytedance/seedance-2.5/video-edit")
  assert.equal(before.incrementalCents, 4500)
  assert.equal(before.newTotalCents, 21200)
  assert.ok(before.updatedMarginCents > 0)
  assert.match(before.reason, /continuity repair/)

  const blocked = evaluateQa(input({ maxBudgetCents: 16700 }))
  assert.equal(blocked.verdict, "controlled_edit")
  assert.equal(blocked.withinLimits, false)
  assert.match(blocked.blockReason ?? "", /approved maximum/)
  assert.equal(blocked.newTotalCents, 16700)

  const after = evaluateQa(
    input({
      generations: [
        generation("concept", "z-image/turbo", 3200),
        generation("motion", "kling-video/v3.0/pro/text-to-video", 13500),
        generation("repair", "bytedance/seedance-2.5/video-edit", 4500),
      ],
      spentCents: 21200,
    }),
  )
  assert.equal(after.checklist.find((item) => item.id === "motion")?.status, "pass")
  assert.equal(after.verdict, "ready")
  assert.equal(after.checklist.find((item) => item.id === "face_hands")?.status, "na")
  assert.equal(after.checklist.find((item) => item.id === "audio_lipsync")?.status, "na")
  assert.match(after.checklist[0]?.detail ?? "", /does not inspect pixels/)

  const orchard = evaluateQa(
    input({
      brief: "Night Orchard. No people. No dialogue. Preserve the world throughout the orbit.",
      steps: baseSteps.filter((step) => step.id !== "repair"),
      deliverables: [
        {
          name: "One 12-second atmospheric sequence, 1920x1080, 16:9",
          format: "motion",
          aspectRatio: "16:9",
          duration: "12 seconds",
          resolution: "1920x1080",
          exactText: [],
        },
        {
          name: "One hero still, 1920x1080, 16:9",
          format: "still",
          aspectRatio: "16:9",
          duration: "",
          resolution: "1920x1080",
          exactText: [],
        },
      ],
    }),
  )
  assert.equal(orchard.verdict, "ready")
  assert.equal(orchard.incrementalCents, 0)
  assert.equal(orchard.checklist.find((item) => item.id === "motion")?.status, "pass")

  const note = clientDeliveryNote({
    title: "After the Rain: Glass Monument",
    deliverableNames: ["One 20-second cinematic film, 1920x1080, 16:9", "Three approved keyframe stills"],
  })
  assert.equal(deliveryNoteIsClientSafe(note), true)
  assert.doesNotMatch(note, /@|sk-|higgsfield|\$\d|USD/i)
  assert.match(note, /GPT-6 Astra/)
  assert.match(note, /16:9/)

  assert.equal(recordingPause({
    status: "new",
    hasAnalysis: false,
    stepCount: 0,
    decision: null,
    openGates: [],
    latestVerdict: null,
  }).label, "Paused before analysis")
  assert.equal(recordingPause({
    status: "needs_review",
    hasAnalysis: true,
    stepCount: 5,
    decision: "accept",
    openGates: ["workflow_budget"],
    latestVerdict: null,
  }).label, "Paused before approval")
  assert.equal(recordingPause({
    status: "approved",
    hasAnalysis: true,
    stepCount: 5,
    decision: "accept",
    openGates: [],
    latestVerdict: null,
  }).label, "Paused before generation")
  assert.equal(recordingPause({
    status: "qa",
    hasAnalysis: true,
    stepCount: 5,
    decision: "accept",
    openGates: ["final_delivery"],
    latestVerdict: null,
  }).label, "Paused before QA")
  assert.equal(recordingPause({
    status: "qa",
    hasAnalysis: true,
    stepCount: 5,
    decision: "accept",
    openGates: ["qa_repair"],
    latestVerdict: "controlled_edit",
  }).label, "Paused before repair approval")
  assert.equal(recordingPause({
    status: "qa",
    hasAnalysis: true,
    stepCount: 5,
    decision: "accept",
    openGates: ["final_delivery"],
    latestVerdict: "ready",
  }).label, "Paused before delivery")
  assert.equal(recordingPause({
    status: "delivered",
    hasAnalysis: true,
    stepCount: 5,
    decision: "accept",
    openGates: [],
    latestVerdict: "ready",
  }).label, "Deliverables")

  console.log("qa tests passed")
}

main()
