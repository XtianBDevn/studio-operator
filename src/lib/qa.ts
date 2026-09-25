import { APPROVED_ATTEMPT_LIMITS, type Capability } from "@/lib/analysis"
import { computeProfitability } from "@/lib/profitability"
import { catalogById } from "@/lib/router-catalog"

export const QA_CHECK_IDS = [
  "deliverable_type",
  "duration",
  "aspect_ratio",
  "resolution",
  "brand_consistency",
  "exact_text",
  "required_scenes",
  "prohibited",
  "face_hands",
  "motion",
  "audio_lipsync",
] as const

export type QaCheckId = (typeof QA_CHECK_IDS)[number]

export const QA_VERDICTS = ["concept", "controlled_edit", "regenerate", "ready"] as const
export type QaVerdict = (typeof QA_VERDICTS)[number]

export type QaCheckStatus = "pass" | "fail" | "na"

export type QaCheck = {
  id: QaCheckId
  label: string
  status: QaCheckStatus
  detail: string
}

export type QaDeliverable = {
  name: string
  format: string
  aspectRatio: string
  duration: string
  resolution: string
  exactText: string[]
}

export type QaStep = {
  id: string
  name: string
  purpose: string
  capability: string
  selectedModel: string
  unitCostCents: number
  estimatedAttempts: number
  estimatedTotalCents: number
}

export type QaGeneration = {
  stepId: string | null
  status: string
  model: string
  actualCostCents: number | null
  costEstimateCents: number
}

export type QaEvaluationInput = {
  brief: string
  deliverables: QaDeliverable[]
  brandConstraints: string[]
  steps: QaStep[]
  generations: QaGeneration[]
  spentCents: number
  maxBudgetCents: number | null
  clientPriceCents: number
  contingencyBps: number
  channelFeeBps: number
}

export type QaEvaluation = {
  checklist: QaCheck[]
  verdict: QaVerdict
  reason: string
  repairModelId: string | null
  repairModelLabel: string | null
  incrementalCents: number
  newTotalCents: number
  updatedMarginCents: number
  withinLimits: boolean
  blockReason: string | null
}

export const QA_RECORD_NOTE =
  "Mock QA compares the approved brief and generation records. It does not inspect pixels, read spelling from an image, or listen to a soundtrack."

const CHECK_LABELS: Record<QaCheckId, string> = {
  deliverable_type: "Deliverable type",
  duration: "Duration",
  aspect_ratio: "Aspect ratio",
  resolution: "Resolution",
  brand_consistency: "Product and brand consistency",
  exact_text: "Exact text, label, and spelling",
  required_scenes: "Required scenes",
  prohibited: "Prohibited elements",
  face_hands: "Face and hands",
  motion: "Motion",
  audio_lipsync: "Audio and lip sync",
}

export function isConditionalRepair(purpose: string): boolean {
  return /if needed/i.test(purpose)
}

export function verdictLabel(verdict: QaVerdict): string {
  if (verdict === "concept") return "Acceptable as a concept"
  if (verdict === "controlled_edit") return "Needs a controlled edit"
  if (verdict === "regenerate") return "Needs regeneration"
  return "Ready for human delivery review"
}

export function evaluateQa(input: QaEvaluationInput): QaEvaluation {
  const repair = input.steps.find((step) => isConditionalRepair(step.purpose)) ?? null
  const repairDone = Boolean(
    repair &&
      input.generations.some(
        (generation) => generation.stepId === repair.id && generation.status === "succeeded",
      ),
  )
  const succeeded = input.generations.filter((generation) => generation.status === "succeeded")
  const videoDone = succeeded.some((generation) => generationMatches(input.steps, generation, "video"))
  const imageDone = succeeded.some((generation) => generationMatches(input.steps, generation, "image"))
  const checklist = buildChecklist(input, { repair, repairDone, videoDone, imageDone, succeeded: succeeded.length })
  const verdict = decideVerdict(checklist, Boolean(repair), repairDone, imageDone, videoDone)
  const allowance = repairAllowance({
    verdict,
    repair,
    repairDone,
    spentCents: input.spentCents,
    maxBudgetCents: input.maxBudgetCents,
  })
  const newTotalCents = allowance.withinLimits ? input.spentCents + allowance.incrementalCents : input.spentCents
  const margin = computeProfitability({
    clientPriceCents: input.clientPriceCents,
    estimatedGenerationCents: newTotalCents,
    contingencyBps: input.contingencyBps,
    channelFeeBps: input.channelFeeBps,
    actualGenerationCents: newTotalCents,
    maxBudgetCents: input.maxBudgetCents,
  })
  const catalog = repair ? catalogById(repair.selectedModel) : undefined
  return {
    checklist,
    verdict,
    reason: reasonFor(verdict, repair, repairDone, allowance),
    repairModelId: repair?.selectedModel ?? null,
    repairModelLabel: catalog?.label ?? repair?.selectedModel ?? null,
    incrementalCents: allowance.incrementalCents,
    newTotalCents,
    updatedMarginCents: margin.expectedGrossMarginCents,
    withinLimits: allowance.withinLimits,
    blockReason: allowance.blockReason,
  }
}

function generationMatches(steps: QaStep[], generation: QaGeneration, capability: string): boolean {
  const step = steps.find((item) => item.id === generation.stepId)
  if (step) return step.capability === capability
  return false
}

function buildChecklist(
  input: QaEvaluationInput,
  state: {
    repair: QaStep | null
    repairDone: boolean
    videoDone: boolean
    imageDone: boolean
    succeeded: number
  },
): QaCheck[] {
  const motionDeliverables = input.deliverables.filter((item) => /motion|film|video|sequence/i.test(`${item.format} ${item.name}`))
  const stillDeliverables = input.deliverables.filter((item) => /still|image|keyframe/i.test(`${item.format} ${item.name}`))
  const needsVideo = motionDeliverables.length > 0
  const needsStill = stillDeliverables.length > 0
  const exact = input.deliverables.flatMap((item) => item.exactText).map((item) => item.trim()).filter(Boolean)
  const prohibited = prohibitedLines(input.brief)
  const peopleExcluded = /\bno people\b/i.test(input.brief)
  const dialogueExcluded = /\bno dialogue\b/i.test(input.brief)
  const talking = /\b(talking|dialogue|lip sync|lip-sync)\b/i.test(input.brief) && !dialogueExcluded

  const typeOk =
    input.deliverables.length > 0 &&
    (!needsVideo || state.videoDone) &&
    (!needsStill || state.imageDone) &&
    state.succeeded > 0

  return [
    check("deliverable_type", typeOk ? "pass" : state.imageDone && needsVideo && !state.videoDone ? "fail" : "fail", typeOk
      ? "Succeeded generations match the still and motion deliverables named in the brief."
      : state.succeeded === 0
        ? "No succeeded generation is on the job yet."
        : "A required still or motion deliverable does not have a succeeded generation."),
    check(
      "duration",
      !needsVideo ? "na" : motionDeliverables.every((item) => item.duration.trim()) ? "pass" : "fail",
      !needsVideo
        ? "No timed motion deliverable was required."
        : motionDeliverables.every((item) => item.duration.trim())
          ? `Durations on the brief: ${motionDeliverables.map((item) => item.duration).join(", ")}.`
          : "A motion deliverable has no duration on the approved brief.",
    ),
    check(
      "aspect_ratio",
      input.deliverables.every((item) => item.aspectRatio.trim()) ? "pass" : "fail",
      input.deliverables.every((item) => item.aspectRatio.trim())
        ? `Aspect ratios on the brief: ${unique(input.deliverables.map((item) => item.aspectRatio)).join(", ")}.`
        : "A deliverable is missing an aspect ratio.",
    ),
    check(
      "resolution",
      input.deliverables.every((item) => item.resolution.trim()) ? "pass" : "fail",
      input.deliverables.every((item) => item.resolution.trim())
        ? `Resolutions on the brief: ${unique(input.deliverables.map((item) => item.resolution)).join(", ")}.`
        : "A deliverable is missing a resolution.",
    ),
    check(
      "brand_consistency",
      input.brandConstraints.length > 0 || /consistent|preserve the world|material/i.test(input.brief) ? "pass" : "na",
      input.brandConstraints.length > 0
        ? `Constraints recorded from the brief: ${input.brandConstraints.join("; ")}.`
        : "No brand constraint was extracted. A person can still compare the references.",
    ),
    check(
      "exact_text",
      exact.length === 0 ? "pass" : "na",
      exact.length === 0
        ? "No exact on-screen line, label, or spelling was required."
        : `Exact text is listed for a person: ${exact.join(" / ")}.`,
    ),
    check(
      "required_scenes",
      input.deliverables.length > 0 && state.succeeded > 0 ? "pass" : "fail",
      input.deliverables.length > 0 && state.succeeded > 0
        ? `Required pieces: ${input.deliverables.map((item) => item.name).join("; ")}.`
        : "Required scenes cannot be checked until a generation succeeds.",
    ),
    check(
      "prohibited",
      prohibited.length > 0 ? "pass" : "na",
      prohibited.length > 0
        ? `Prohibited by the brief: ${prohibited.join("; ")}.`
        : "The brief does not list a prohibited element.",
    ),
    check(
      "face_hands",
      "na",
      peopleExcluded
        ? "Faces and hands are not relevant. The brief excludes people."
        : "Faces and hands are not part of this brief.",
    ),
    check("motion", motionStatus(needsVideo, state.repair, state.repairDone, state.videoDone), motionDetail(needsVideo, state.repair, state.repairDone, state.videoDone, input.brief)),
    check(
      "audio_lipsync",
      talking ? "fail" : "na",
      dialogueExcluded
        ? "Audio and lip sync are not relevant. The brief excludes dialogue."
        : talking
          ? "Talking or lip sync was requested and this QA pass cannot confirm it from records alone."
          : "Audio and lip sync are not part of this brief.",
    ),
  ]
}

function motionStatus(
  needsVideo: boolean,
  repair: QaStep | null,
  repairDone: boolean,
  videoDone: boolean,
): QaCheckStatus {
  if (!needsVideo) return "na"
  if (repair && !repairDone) return "fail"
  if (!videoDone) return "fail"
  return "pass"
}

function motionDetail(
  needsVideo: boolean,
  repair: QaStep | null,
  repairDone: boolean,
  videoDone: boolean,
  brief: string,
): string {
  if (!needsVideo) return "No motion deliverable was required."
  if (repair && !repairDone) {
    return /monument|reflection|after the storm/i.test(brief)
      ? "Water, reflections, or monument continuity is not confirmed until the approved repair runs."
      : "A priced continuity repair is still outstanding."
  }
  if (repair && repairDone) return "The approved continuity repair has a succeeded generation."
  if (!videoDone) return "Final motion does not have a succeeded generation."
  return "No conditional continuity repair was authorized. The succeeded motion generation is the orbit or film on the approved route."
}

function decideVerdict(
  checklist: QaCheck[],
  hasRepair: boolean,
  repairDone: boolean,
  imageDone: boolean,
  videoDone: boolean,
): QaVerdict {
  const failed = new Set(checklist.filter((item) => item.status === "fail").map((item) => item.id))
  if (failed.size === 0) return "ready"
  const structural = ["deliverable_type", "duration", "aspect_ratio", "resolution", "required_scenes"].some((id) =>
    failed.has(id as QaCheckId),
  )
  if (failed.has("motion") && hasRepair && !repairDone && !structural) return "controlled_edit"
  if (imageDone && !videoDone && failed.has("deliverable_type")) return "concept"
  if (structural || failed.has("motion")) return "regenerate"
  return hasRepair && !repairDone ? "controlled_edit" : "regenerate"
}

function reasonFor(
  verdict: QaVerdict,
  repair: QaStep | null,
  repairDone: boolean,
  allowance: { withinLimits: boolean; blockReason: string | null; incrementalCents: number },
): string {
  if (verdict === "ready" && repair && repairDone) {
    return "The continuity repair finished inside the approved workflow. The result is ready for human delivery review."
  }
  if (verdict === "ready") {
    return "The checklist matches the approved brief. The result is ready for human delivery review."
  }
  if (verdict === "concept") {
    return "Still exploration is on the job. Final motion is not, so this is a concept and not a delivery."
  }
  if (verdict === "controlled_edit") {
    const limit = allowance.withinLimits
      ? "The repair stays inside the approved per-repair and per-job limits."
      : allowance.blockReason ?? "The repair is outside the approved limits and needs a person."
    return `Motion does not pass while the priced continuity repair has not run. ${limit}`
  }
  return "A required brief check failed in a way the priced repair does not cover. Regenerate inside a new approval."
}

function repairAllowance(input: {
  verdict: QaVerdict
  repair: QaStep | null
  repairDone: boolean
  spentCents: number
  maxBudgetCents: number | null
}): { withinLimits: boolean; incrementalCents: number; blockReason: string | null } {
  if (input.verdict !== "controlled_edit" || !input.repair || input.repairDone) {
    return { withinLimits: input.verdict !== "controlled_edit", incrementalCents: 0, blockReason: null }
  }
  const capability = isCapability(input.repair.capability) ? input.repair.capability : "video"
  const incrementalCents = input.repair.unitCostCents
  const blocks: string[] = []
  if (incrementalCents > input.repair.estimatedTotalCents) {
    blocks.push("The repair costs more than the approved step.")
  }
  if (1 > APPROVED_ATTEMPT_LIMITS[capability] || input.repair.estimatedAttempts > APPROVED_ATTEMPT_LIMITS[capability]) {
    blocks.push("The repair is outside the approved attempt limit.")
  }
  if (input.maxBudgetCents == null) {
    blocks.push("No approved maximum is set.")
  } else if (input.spentCents + incrementalCents > input.maxBudgetCents) {
    blocks.push("Spent production cost plus this repair exceeds the approved maximum.")
  }
  return {
    withinLimits: blocks.length === 0,
    incrementalCents,
    blockReason: blocks[0] ?? null,
  }
}

function check(id: QaCheckId, status: QaCheckStatus, detail: string): QaCheck {
  return {
    id,
    label: CHECK_LABELS[id],
    status,
    detail: `${detail} ${QA_RECORD_NOTE}`,
  }
}

function prohibitedLines(brief: string): string[] {
  return unique(
    brief
      .split("\n")
      .map((line) => line.trim().replace(/^[-*•]\s+/, ""))
      .filter((line) => /^no\b/i.test(line) || /must not|do not include|dislikes/i.test(line)),
  )
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function isCapability(value: string): value is Capability {
  return value === "image" || value === "video" || value === "voice" || value === "editing" || value === "finishing"
}
