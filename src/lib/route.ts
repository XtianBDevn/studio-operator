import {
  billAttempts,
  type Capability,
  type StoredAnalysis,
} from "@/lib/analysis"
import { PLANNING_RATE_NOTE } from "@/lib/planning-rates"
import {
  catalogById,
  defaultStage,
  PATTERN_LABEL,
  requireCatalog,
  ROUTE_STAGES,
  STAGE_LABELS,
  unitCostCents,
  type CatalogEntry,
  type RouteRole,
  type RouteStage,
} from "@/lib/router-catalog"

export type RouteContext = {
  rawBrief?: string
  deadlineIso?: string | null
  now?: Date
  referenceCount?: number
}

export type RouteLine = {
  position: number
  stage: RouteStage
  role: RouteRole
  catalogGroup: RouteRole
  name: string
  capability: Capability
  modelId: string
  modelLabel: string
  why: string
  failureMode: string
  alternativeModelId: string
  alternativeLabel: string
  attempts: number
  requestedAttempts: number
  unitCostCents: number
  lineCents: number
  unitLabel: string
  docsUrl: string
  substituteNote: string | null
  liveSubmit: boolean
  capped: boolean
  attemptLimit: number
}

export type StageView = {
  stage: RouteStage
  label: string
  skipped: boolean
  reason: string
  lines: RouteLine[]
}

export type RouteProposal = {
  patternLabel: string
  stages: StageView[]
  billed: RouteLine[]
  maxSpendCents: number
  notes: string[]
  skipReasons: Partial<Record<RouteStage, string>>
}

const STAGE_RANK: Record<RouteStage, number> = {
  explore: 0,
  choose: 1,
  control: 2,
  ship: 3,
  repair: 4,
  finish: 5,
  qa: 6,
}

const CHOOSE_REASON =
  "A person chooses which concepts or controlled frames continue. This gate has no model and no spend."
const QA_REASON =
  "QA stays with a person. Approving delivery only marks the job delivered in this desk."

export function priceSelection(
  modelId: string,
  attempts: number,
): {
  entry: CatalogEntry
  billed: number
  requested: number
  capped: boolean
  limit: number
  unitCostCents: number
  lineCents: number
} | null {
  const entry = catalogById(modelId)
  if (!entry) return null
  const requested = Number.isInteger(attempts) && attempts >= 1 ? attempts : 1
  const bill = billAttempts(requested, entry.capability)
  return {
    entry,
    billed: bill.billed,
    requested,
    capped: bill.overLimit,
    limit: bill.limit,
    unitCostCents: unitCostCents(entry.capability),
    lineCents: unitCostCents(entry.capability) * bill.billed,
  }
}

export function applyOverride(
  line: RouteLine,
  patch: { modelId: string; attempts: number },
): RouteLine | null {
  const priced = priceSelection(patch.modelId, patch.attempts)
  if (!priced) return null
  const modelChanged = priced.entry.id !== line.modelId
  if (!modelChanged) {
    return {
      ...line,
      attempts: priced.billed,
      requestedAttempts: priced.requested,
      unitCostCents: priced.unitCostCents,
      lineCents: priced.lineCents,
      capped: priced.capped,
      attemptLimit: priced.limit,
    }
  }
  const why = `${priced.entry.why} Operator override. The line uses the ${priced.entry.capability} planning rate.`
  return {
    ...line,
    stage: defaultStage(priced.entry),
    role: priced.entry.role,
    catalogGroup: priced.entry.role,
    capability: priced.entry.capability,
    modelId: priced.entry.id,
    modelLabel: priced.entry.label,
    why,
    failureMode: priced.entry.constraint,
    alternativeModelId: priced.entry.alternativeId,
    alternativeLabel: requireCatalog(priced.entry.alternativeId).label,
    attempts: priced.billed,
    requestedAttempts: priced.requested,
    unitCostCents: priced.unitCostCents,
    lineCents: priced.lineCents,
    unitLabel: unitLabel(priced.entry.capability),
    docsUrl: priced.entry.docsUrl,
    substituteNote: priced.entry.substituteNote,
    liveSubmit: priced.entry.liveSubmit,
    capped: priced.capped,
    attemptLimit: priced.limit,
  }
}

export function maxSpendCents(lines: Array<{ lineCents: number }>): number {
  return lines.reduce((sum, line) => sum + line.lineCents, 0)
}

export function proposeRoute(document: StoredAnalysis, context: RouteContext = {}): RouteProposal {
  const signals = readSignals(document, context)
  const drafted = document.proposedWorkflow.map((step, index) => {
    const estimate = document.estimatedAttemptsByStep.find((item) => item.stepName === step.name)
    const picked = pickModel(step.capability, step.purpose, signals)
    const priced = priceSelection(picked.entry.id, estimate?.attempts ?? 1)
    if (!priced) {
      throw new Error(`Catalog model ${picked.entry.id} could not be priced.`)
    }
    const line = toLine({
      position: index + 1,
      name: step.name,
      stage: picked.stage,
      role: picked.role,
      entry: priced.entry,
      priced,
      why: picked.why,
    })
    return line
  })
  const billed = restage(drafted)
  const skipReasons = skipCopy(signals, billed)
  return {
    patternLabel: PATTERN_LABEL,
    stages: stagesFromLines(billed, skipReasons),
    billed,
    maxSpendCents: maxSpendCents(billed),
    notes: considerationNotes(document, signals, maxSpendCents(billed)),
    skipReasons,
  }
}

export function linesFromStored(
  steps: Array<{
    position: number
    name: string
    selectedModel: string
    modelKind: string
    purpose: string
    estimatedAttempts: number
    unitCostCents: number
    estimatedTotalCents: number
    routeStage?: string | null
    routeRole?: string | null
    whyFit?: string | null
    failureMode?: string | null
    alternativeModel?: string | null
    docsUrl?: string | null
    substituteNote?: string | null
  }>,
): RouteLine[] {
  return steps.map((step) => {
    const entry = catalogById(step.selectedModel)
    const capability = isCapability(step.modelKind) ? step.modelKind : entry?.capability ?? "image"
    const priced = entry ? priceSelection(entry.id, step.estimatedAttempts) : null
    const alternative = entry ? catalogById(entry.alternativeId) : undefined
    const stage = isStage(step.routeStage) ? step.routeStage : entry ? defaultStage(entry) : "finish"
    const role = isRole(step.routeRole) ? step.routeRole : entry?.role ?? "FINISH"
    return {
      position: step.position,
      stage,
      role,
      catalogGroup: entry?.role ?? role,
      name: step.name,
      capability,
      modelId: step.selectedModel,
      modelLabel: entry?.label ?? step.selectedModel,
      why: step.whyFit || entry?.why || step.purpose,
      failureMode:
        step.failureMode ||
        entry?.constraint ||
        "This page does not document a failure mode. The constraint above is the documented limit.",
      alternativeModelId: step.alternativeModel || entry?.alternativeId || "",
      alternativeLabel: alternative?.label ?? step.alternativeModel ?? "",
      attempts: step.estimatedAttempts,
      requestedAttempts: step.estimatedAttempts,
      unitCostCents: step.unitCostCents,
      lineCents: step.estimatedTotalCents,
      unitLabel: unitLabel(capability),
      docsUrl: step.docsUrl || entry?.docsUrl || "",
      substituteNote: step.substituteNote ?? entry?.substituteNote ?? null,
      liveSubmit: entry?.liveSubmit ?? false,
      capped: priced ? priced.capped : false,
      attemptLimit: priced?.limit ?? billAttempts(step.estimatedAttempts, capability).limit,
    }
  })
}

export function stagesFromLines(
  lines: RouteLine[],
  skipReasons: Partial<Record<RouteStage, string>> = {},
): StageView[] {
  return ROUTE_STAGES.map((stage) => {
    if (stage === "choose") {
      return { stage, label: STAGE_LABELS.choose, skipped: false, reason: CHOOSE_REASON, lines: [] }
    }
    if (stage === "qa") {
      return { stage, label: STAGE_LABELS.qa, skipped: false, reason: QA_REASON, lines: [] }
    }
    const grouped = lines.filter((line) => line.stage === stage)
    if (grouped.length === 0) {
      return {
        stage,
        label: STAGE_LABELS[stage],
        skipped: true,
        reason: skipReasons[stage] ?? defaultSkip(stage),
        lines: [],
      }
    }
    return {
      stage,
      label: STAGE_LABELS[stage],
      skipped: false,
      reason: "",
      lines: grouped,
    }
  })
}

export function restage(lines: RouteLine[]): RouteLine[] {
  return [...lines]
    .sort((left, right) => STAGE_RANK[left.stage] - STAGE_RANK[right.stage] || left.position - right.position)
    .map((line, index) => ({ ...line, position: index + 1 }))
}

function toLine(input: {
  position: number
  name: string
  stage: RouteStage
  role: RouteRole
  entry: CatalogEntry
  priced: NonNullable<ReturnType<typeof priceSelection>>
  why: string
}): RouteLine {
  const alternative = requireCatalog(input.entry.alternativeId)
  return {
    position: input.position,
    stage: input.stage,
    role: input.role,
    catalogGroup: input.entry.role,
    name: input.name,
    capability: input.entry.capability,
    modelId: input.entry.id,
    modelLabel: input.entry.label,
    why: input.why,
    failureMode: input.entry.constraint,
    alternativeModelId: alternative.id,
    alternativeLabel: alternative.label,
    attempts: input.priced.billed,
    requestedAttempts: input.priced.requested,
    unitCostCents: input.priced.unitCostCents,
    lineCents: input.priced.lineCents,
    unitLabel: unitLabel(input.entry.capability),
    docsUrl: input.entry.docsUrl,
    substituteNote: input.entry.substituteNote,
    liveSubmit: input.entry.liveSubmit,
    capped: input.priced.capped,
    attemptLimit: input.priced.limit,
  }
}

type Signals = {
  text: string
  exactText: boolean
  packaging: boolean
  product: boolean
  people: boolean
  poster: boolean
  talking: boolean
  hasVideo: boolean
  hasImage: boolean
  references: boolean
  tight: boolean
  durationSeconds: number | null
  resolution: string | null
}

function readSignals(document: StoredAnalysis, context: RouteContext): Signals {
  const raw = `${context.rawBrief ?? ""}\n${document.conciseSummary}\n${document.brandConstraints.join("\n")}\n${document.deliverables
    .map((item) => `${item.name} ${item.format} ${item.duration} ${item.resolution}`)
    .join("\n")}\n${document.proposedWorkflow.map((step) => `${step.name} ${step.purpose}`).join("\n")}`
  const text = raw
    .replace(/\bno (real )?(people|persons|person|characters|dialogue|voiceover|voice-over)\b/gi, " ")
    .replace(/\bwithout (people|dialogue|sound|a logo)\b/gi, " ")
  const exact = document.deliverables.flatMap((item) => item.exactText).filter((item) => item.trim().length > 0)
  const durationSeconds = firstDuration(document, text)
  const resolution = document.deliverables.find((item) => item.resolution.trim())?.resolution ?? null
  return {
    text,
    exactText: exact.length > 0 || /on-screen text|exact text|wordmark|headline/i.test(text),
    packaging: /\b(packaging|label|logo|wordmark)\b/i.test(text),
    product: /\b(product|lifestyle|sku|bottle|loaf)\b|\bhero product\b/i.test(text),
    people: /\b(fashion|editorial|portrait|face|people|person|model|character|likeness)\b/i.test(text),
    poster: /poster|typography|headline|title card|end card|promotional/i.test(text),
    talking: /\b(talking|dialogue|speaks|speak to|on camera|lip sync|native audio)\b/i.test(text),
    hasVideo: document.proposedWorkflow.some((step) => step.capability === "video"),
    hasImage: document.proposedWorkflow.some((step) => step.capability === "image"),
    references: (context.referenceCount ?? 0) > 0 || document.suppliedAssets.length > 0,
    tight: isTight(context.deadlineIso ?? null, context.now ?? new Date(), text),
    durationSeconds,
    resolution,
  }
}

function pickModel(
  capability: Capability,
  purpose: string,
  signals: Signals,
): { entry: CatalogEntry; role: RouteRole; stage: RouteStage; why: string } {
  if (capability === "voice") {
    const entry = requireCatalog("local/voice")
    return {
      entry,
      role: "FINISH",
      stage: "finish",
      why: `${entry.why} ${fitBits(signals)}`,
    }
  }
  if (capability === "finishing") {
    const entry = requireCatalog("local/finish")
    return {
      entry,
      role: "FINISH",
      stage: "finish",
      why: `${entry.why} ${fitBits(signals)}`,
    }
  }
  if (capability === "editing") {
    const entry = requireCatalog("local/edit")
    const repair = signals.hasVideo
    return {
      entry,
      role: repair ? "CONTROL" : "FINISH",
      stage: repair ? "repair" : "finish",
      why: repair
        ? `${entry.why} This pass is the one priced continuity repair. ${fitBits(signals)}`
        : `${entry.why} ${fitBits(signals)}`,
    }
  }
  if (capability === "image") return pickImage(purpose, signals)
  return pickVideo(purpose, signals)
}

function pickImage(
  purpose: string,
  signals: Signals,
): { entry: CatalogEntry; role: RouteRole; stage: RouteStage; why: string } {
  const explore = /explore|concept|rough|variant/i.test(purpose)
  if (/explore inexpensive|inexpensive concept/i.test(purpose)) {
    const entry = requireCatalog("z-image/turbo")
    return {
      entry,
      role: "SEARCH",
      stage: "explore",
      why: `${entry.why} This step is inexpensive concept exploration. The image planning rate does not drop. ${fitBits(signals)}`,
    }
  }
  if (/lock the monument|controlled keyframes/i.test(purpose)) {
    const entry = requireCatalog("marketing-studio/image")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} Controlled keyframes have to hold monument architecture, glass, scale, and site. ${entry.substituteNote} ${fitBits(signals)}`,
    }
  }
  if (/orchard keyframe|lock the hero still/i.test(purpose)) {
    const entry = requireCatalog("xai/grok-imagine-image-2.0")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} The hero still has to stay locked to the approved orchard keyframe. ${fitBits(signals)}`,
    }
  }
  if (signals.references && (signals.exactText || signals.packaging)) {
    const entry = requireCatalog("alibaba/qwen-image-3/edit")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} Exact text or packaging is required and a reference still is already on the job. ${fitBits(signals)}`,
    }
  }
  if (signals.poster || (signals.exactText && !signals.product)) {
    const entry = requireCatalog("ideogram/v4.0")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} The deliverable depends on designed type or an exact line, and there is no reference image for the edit endpoint. ${fitBits(signals)}`,
    }
  }
  if (signals.exactText) {
    const entry = requireCatalog("alibaba/qwen-image-3/text-to-image")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} Exact text is required and no reference image is on the job, so the edit endpoint cannot run. ${fitBits(signals)}`,
    }
  }
  if (signals.product && !signals.people) {
    const entry = requireCatalog("marketing-studio/image")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} ${entry.substituteNote} ${fitBits(signals)}`,
    }
  }
  if (signals.people && signals.references) {
    const entry = requireCatalog("xai/grok-imagine-image-2.0")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} A person or character has to stay consistent with supplied references. SOUL V2's wired request does not send a character reference. ${fitBits(signals)}`,
    }
  }
  if (signals.people && !explore) {
    const entry = requireCatalog("higgsfield-ai/soul/v2/standard")
    return {
      entry,
      role: "SHIP",
      stage: "ship",
      why: `${entry.why} This is the final fashion or editorial still. ${fitBits(signals)}`,
    }
  }
  if (signals.people && explore) {
    const entry = requireCatalog("higgsfield-ai/soul/v2/standard")
    return {
      entry,
      role: "SEARCH",
      stage: "explore",
      why: `${entry.why} The step is exploration, so the role is SEARCH. The image planning rate does not drop. Soul stays selected because the index describes it for fashion and editorial taste. ${fitBits(signals)}`,
    }
  }
  const entry = requireCatalog("z-image/turbo")
  return {
    entry,
    role: "SEARCH",
    stage: "explore",
    why: `${entry.why} The analysis priced this as concept search. The attempt cap for images is 8. ${fitBits(signals)}`,
  }
}

function pickVideo(
  purpose: string,
  signals: Signals,
): { entry: CatalogEntry; role: RouteRole; stage: RouteStage; why: string } {
  const explore = /explore|concept|rough|test|safety take/i.test(purpose) && /concept|rough|test/i.test(purpose)
  if (/if needed|continuity failure/i.test(purpose)) {
    const entry = requireCatalog("bytedance/seedance-2.5/video-edit")
    return {
      entry,
      role: "CONTROL",
      stage: "repair",
      why: `${entry.why} Repair one continuity failure if needed. This is the single priced repair, billed at the video planning rate. ${fitBits(signals)}`,
    }
  }
  if (/\borbit/i.test(purpose)) {
    const entry = requireCatalog("higgsfield/cinema-studio/4.0")
    return {
      entry,
      role: "SHIP",
      stage: "ship",
      why: `${entry.why} The move is a slow orbit that has to keep the world, depth, low-light detail, and spatial continuity. ${entry.substituteNote} ${fitBits(signals)}`,
    }
  }
  if (/premium cinematic|cinematic film|final cinematic/i.test(purpose) && !/tomorrow|asap|\brush\b/i.test(signals.text)) {
    const entry = requireCatalog("kling-video/v3.0/pro/text-to-video")
    return {
      entry,
      role: "SHIP",
      stage: "ship",
      why: `${entry.why} Premium cinematic motion stays on Kling 3.0 Pro even when the deadline is inside 72 hours. Kling 3.0 Standard is the live-wired alternative when the brief is rushed. ${entry.substituteNote} ${fitBits(signals)}`,
    }
  }
  if (signals.talking && /\b(voiceover|voice-over|voice over|audio reference)\b/i.test(signals.text)) {
    const entry = requireCatalog("wan/v2.6/text-to-video")
    return {
      entry,
      role: "SHIP",
      stage: "ship",
      why: `${entry.why} ${entry.substituteNote} ${fitBits(signals)}`,
    }
  }
  if (signals.talking) {
    const entry = requireCatalog("pixverse/v6/text-to-video")
    return {
      entry,
      role: "SHIP",
      stage: "ship",
      why: `${entry.why} ${entry.substituteNote} ${fitBits(signals)}`,
    }
  }
  if (/keyframe|image-to-video|exact motion|match the still|start frame/i.test(`${purpose}\n${signals.text}`)) {
    const entry = requireCatalog("kling-video/v3.0/std/image-to-video")
    return {
      entry,
      role: "CONTROL",
      stage: "control",
      why: `${entry.why} The motion has to start from a controlled frame. ${fitBits(signals)}`,
    }
  }
  if (explore) {
    const entry = requireCatalog("lightricks/ltx-2.5/text-to-video/fast")
    return {
      entry,
      role: "SEARCH",
      stage: "explore",
      why: `${entry.why} ${entry.substituteNote} ${fitBits(signals)}`,
    }
  }
  if (signals.tight) {
    const entry = requireCatalog("kling-video/v3.0/std/text-to-video")
    return {
      entry,
      role: "SHIP",
      stage: "ship",
      why: `${entry.why} The deadline is tight and the catalog pages used here do not publish queue time, so the route stays on the live-wired video model. ${fitBits(signals)}`,
    }
  }
  const entry = requireCatalog("kling-video/v3.0/pro/text-to-video")
  return {
    entry,
    role: "SHIP",
    stage: "ship",
    why: `${entry.why} ${entry.substituteNote} ${fitBits(signals)}`,
  }
}

function fitBits(signals: Signals): string {
  const bits: string[] = []
  if (signals.durationSeconds) bits.push(`Target duration is about ${signals.durationSeconds} seconds.`)
  if (signals.resolution) bits.push(`Requested resolution: ${signals.resolution}.`)
  if (signals.tight) bits.push("Deadline is inside 72 hours or the brief says it is rushed.")
  bits.push("Expected queue time is not published on the model pages used here.")
  return bits.join(" ")
}

function skipCopy(signals: Signals, lines: RouteLine[]): Partial<Record<RouteStage, string>> {
  const present = new Set(lines.map((line) => line.stage))
  const reasons: Partial<Record<RouteStage, string>> = {}
  if (!present.has("explore")) {
    reasons.explore = signals.exactText || signals.packaging || signals.product
      ? "Exact text, packaging, or product consistency is priced on the control step, so this route does not add a separate concept batch."
      : "No inexpensive concept step was estimated for this brief."
  }
  if (!present.has("control")) {
    reasons.control = "Nothing in the priced workflow has to preserve a product, face, layout, logo, or exact line beyond the selected model."
  }
  if (!present.has("ship")) {
    reasons.ship = signals.hasVideo
      ? "Final motion is not a separate priced step."
      : "No final client-facing asset was estimated beyond search, control, or finish."
  }
  if (!present.has("repair")) {
    reasons.repair = signals.hasVideo
      ? "No separate continuity repair was estimated. One repair can be added by overriding the assembly step to Seedance 2.5 video edit."
      : "No continuity repair was estimated."
  }
  if (!present.has("finish")) {
    reasons.finish = "No finishing pass was estimated."
  }
  return reasons
}

function defaultSkip(stage: RouteStage): string {
  if (stage === "explore") return "No step in this plan is priced as concept search."
  if (stage === "control") return "No step in this plan is priced to preserve a product, face, layout, or exact text."
  if (stage === "ship") return "No step in this plan is priced as the final client-facing asset."
  if (stage === "repair") return "No continuity repair is priced on this plan."
  return "No finishing pass is priced on this plan."
}

function considerationNotes(document: StoredAnalysis, signals: Signals, spend: number): string[] {
  const deliverables = document.deliverables.map((item) => item.name).slice(0, 4).join("; ")
  const notes = [
    `Pattern: ${PATTERN_LABEL}.`,
    deliverables ? `Deliverable: ${deliverables}.` : "Deliverable comes from the analysis.",
    PLANNING_RATE_NOTE,
    "A person still approves the paid workflow and the maximum spend. After that, generation runs only inside the approved maximum.",
    "Expected queue time is not published on the model pages used here.",
  ]
  if (signals.exactText) notes.push("Exact text or a wordmark is part of the deliverable.")
  if (signals.durationSeconds) notes.push(`Duration considered: about ${signals.durationSeconds} seconds.`)
  if (signals.resolution) notes.push(`Resolution considered: ${signals.resolution}.`)
  if (document.costing.targetMarginBps) {
    notes.push(`Target margin used by analysis is ${(document.costing.targetMarginBps / 100).toFixed(0)}%. This route's generation estimate is ${(spend / 100).toFixed(2)} USD before contingency.`)
  }
  const analysisSpend = document.costing.generationCents
  if (analysisSpend != null && analysisSpend !== spend) {
    notes.push(
      `Analysis generation estimate is ${(analysisSpend / 100).toFixed(2)} USD. This route bills ${(spend / 100).toFixed(2)} USD from the same attempt caps and capability rates.`,
    )
  }
  return notes
}

function firstDuration(document: StoredAnalysis, text: string): number | null {
  for (const item of document.deliverables) {
    const parsed = secondsIn(item.duration)
    if (parsed) return parsed
  }
  return secondsIn(text)
}

function secondsIn(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*-?\s*(seconds|second|secs|sec)\b/i)
  if (!match?.[1]) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function isTight(deadlineIso: string | null, now: Date, text: string): boolean {
  if (/tomorrow|this weekend|asap|rush|today|need it this/i.test(text)) return true
  if (!deadlineIso) return false
  const deadline = new Date(deadlineIso)
  if (Number.isNaN(deadline.getTime())) return false
  const hours = (deadline.getTime() - now.getTime()) / 36e5
  return hours <= 72
}

function unitLabel(capability: Capability): string {
  if (capability === "image") return "still"
  if (capability === "video") return "5-second shot"
  if (capability === "voice") return "voice line"
  if (capability === "editing") return "assembly pass"
  return "finishing pass"
}

function isCapability(value: string): value is Capability {
  return value === "image" || value === "video" || value === "voice" || value === "editing" || value === "finishing"
}

function isStage(value: string | null | undefined): value is RouteStage {
  return ROUTE_STAGES.includes(value as RouteStage)
}

function isRole(value: string | null | undefined): value is RouteRole {
  return value === "SEARCH" || value === "CONTROL" || value === "SHIP" || value === "FINISH"
}
