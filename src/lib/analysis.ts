import type { Decision } from "@/lib/types"

export const CAPABILITIES = ["image", "video", "voice", "editing", "finishing"] as const
export type Capability = (typeof CAPABILITIES)[number]

export const REVISION_RISKS = ["low", "medium", "high"] as const
export type RevisionRisk = (typeof REVISION_RISKS)[number]

export const APPROVED_ATTEMPT_LIMITS: Record<Capability, number> = {
  image: 8,
  video: 12,
  voice: 4,
  editing: 3,
  finishing: 4,
}

export const DEFAULT_TARGET_MARGIN_BPS = 2500

export const ANALYSIS_SYSTEM_PROMPT = `You are the operations lead for a small AI creative studio. You evaluate client briefs and design production workflows that can be delivered reliably and profitably using the capabilities in the supplied model catalog.

Your priority order is:
1. Accurately satisfy the approved client brief.
2. Protect likeness, voice, intellectual-property, privacy, and brand rights.
3. Preserve exact products, logos, labels, text, and factual claims when required.
4. Keep the work inside the deadline and maximum production budget.
5. Use inexpensive models to explore, controlled models to preserve important details, premium models only for chosen final assets, and finishing models to make approved outputs deliverable.

Do not assume that a beautiful result is a correct result. Identify missing assets and ask specific client questions. Treat real people, voices, trademarks, packaging, medical or financial claims, licensed music, and unclear ownership as human-review issues.

Do not invent model capabilities, prices, endpoints, or availability. Use only the model catalog and price data supplied by the application. If the catalog does not support a requirement, say so.

Return only valid structured output matching the application's schema. Recommend accept only when the deliverable is clear, the assets and rights appear sufficient, the deadline is plausible, and the deterministic cost calculation can preserve the target margin. Recommend human_review when the job may be deliverable but a person must resolve ambiguity or risk. Recommend reject when the requested result cannot be produced reliably, legally, or profitably.`

export type DeliverableSpec = {
  name: string
  format: string
  aspectRatio: string
  duration: string
  resolution: string
  exactText: string[]
}

export type WorkflowProposal = {
  name: string
  capability: Capability
  purpose: string
}

export type AttemptEstimate = {
  stepName: string
  capability: Capability
  attempts: number
}

export type AnalysisDraft = {
  jobType: string
  conciseSummary: string
  deliverables: DeliverableSpec[]
  suppliedAssets: string[]
  missingAssets: string[]
  questionsForClient: string[]
  brandConstraints: string[]
  rightsAndConsentFlags: string[]
  technicalRisks: string[]
  revisionRisk: RevisionRisk
  confidence: number
  decision: Decision
  decisionReasons: string[]
  proposedWorkflow: WorkflowProposal[]
  estimatedAttemptsByStep: AttemptEstimate[]
  assumptions: string[]
}

export type CostLine = {
  stepName: string
  capability: Capability
  estimatedAttempts: number
  billedAttempts: number
  unitCostCents: number | null
  lineCents: number | null
}

export type AnalysisCosting = {
  pricesComplete: boolean
  lines: CostLine[]
  generationCents: number | null
  contingencyCents: number | null
  channelFeeCents: number
  spendCents: number | null
  productionBudgetCents: number
  targetMarginBps: number
}

export type StoredAnalysis = AnalysisDraft & {
  deskDecision: Decision
  costing: AnalysisCosting
}

export type PriceCatalog = Record<Capability, { unitCostCents: number | null }>

export type CommercialContext = {
  clientPriceCents: number
  channelFeeBps: number
  contingencyBps: number
  deadlineIso: string | null
  now?: Date
  targetMarginBps?: number
  catalog: PriceCatalog
}

export class AnalysisValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AnalysisValidationError"
  }
}

const DRAFT_KEYS = [
  "jobType",
  "conciseSummary",
  "deliverables",
  "suppliedAssets",
  "missingAssets",
  "questionsForClient",
  "brandConstraints",
  "rightsAndConsentFlags",
  "technicalRisks",
  "revisionRisk",
  "confidence",
  "decision",
  "decisionReasons",
  "proposedWorkflow",
  "estimatedAttemptsByStep",
  "assumptions",
] as const

const DELIVERABLE_KEYS = ["name", "format", "aspectRatio", "duration", "resolution", "exactText"] as const
const WORKFLOW_KEYS = ["name", "capability", "purpose"] as const
const ATTEMPT_KEYS = ["stepName", "capability", "attempts"] as const
const STRING_LIST_KEYS = [
  "suppliedAssets",
  "missingAssets",
  "questionsForClient",
  "brandConstraints",
  "rightsAndConsentFlags",
  "technicalRisks",
  "decisionReasons",
  "assumptions",
] as const

const DECISION_RANK: Record<Decision, number> = {
  accept: 0,
  human_review: 1,
  reject: 2,
}

export function decisionLabel(decision: Decision): string {
  if (decision === "accept") return "Accept"
  if (decision === "human_review") return "Human review"
  return "Reject"
}

export function stricterDecision(left: Decision, right: Decision): Decision {
  return DECISION_RANK[left] >= DECISION_RANK[right] ? left : right
}

export function toDraft(document: StoredAnalysis): AnalysisDraft {
  return {
    jobType: document.jobType,
    conciseSummary: document.conciseSummary,
    deliverables: document.deliverables,
    suppliedAssets: document.suppliedAssets,
    missingAssets: document.missingAssets,
    questionsForClient: document.questionsForClient,
    brandConstraints: document.brandConstraints,
    rightsAndConsentFlags: document.rightsAndConsentFlags,
    technicalRisks: document.technicalRisks,
    revisionRisk: document.revisionRisk,
    confidence: document.confidence,
    decision: document.decision,
    decisionReasons: document.decisionReasons,
    proposedWorkflow: document.proposedWorkflow,
    estimatedAttemptsByStep: document.estimatedAttemptsByStep,
    assumptions: document.assumptions,
  }
}

export function billAttempts(
  estimated: number,
  capability: Capability,
): { billed: number; overLimit: boolean; limit: number } {
  const limit = APPROVED_ATTEMPT_LIMITS[capability]
  const requested = Number.isInteger(estimated) && estimated >= 1 ? estimated : 1
  return {
    billed: Math.min(requested, limit),
    overLimit: requested > limit,
    limit,
  }
}

export function productionBudgetCents(
  clientPriceCents: number,
  channelFeeBps: number,
  targetMarginBps: number,
): number {
  const channelFeeCents = Math.round((clientPriceCents * channelFeeBps) / 10_000)
  const targetMarginCents = Math.round((clientPriceCents * targetMarginBps) / 10_000)
  return Math.max(0, clientPriceCents - channelFeeCents - targetMarginCents)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fail(message: string): never {
  throw new AnalysisValidationError(message)
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const present = Object.keys(value)
  for (const key of keys) {
    if (!present.includes(key)) fail(`${label} is missing ${key}.`)
  }
  for (const key of present) {
    if (!keys.includes(key)) fail(`${label} has unexpected field ${key}.`)
  }
}

function assertString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string") fail(`${label} must be a string.`)
  const trimmed = value.trim()
  if (!allowEmpty && trimmed.length === 0) fail(`${label} is empty.`)
  return allowEmpty ? value.trim() : trimmed
}

function assertStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) fail(`${label} must be a list.`)
  return value.map((item, index) => assertString(item, `${label}[${index}]`))
}

function assertCapability(value: unknown, label: string): Capability {
  if (typeof value !== "string" || !CAPABILITIES.includes(value as Capability)) {
    fail(`${label} must be a catalog capability.`)
  }
  return value as Capability
}

function assertDecision(value: unknown, label: string): Decision {
  if (value !== "accept" && value !== "human_review" && value !== "reject") {
    fail(`${label} must be accept, human_review, or reject.`)
  }
  return value
}

export function validateAnalysisDraft(value: unknown): AnalysisDraft {
  if (!isRecord(value)) fail("Analysis must be an object.")
  assertExactKeys(value, DRAFT_KEYS, "Analysis")

  const deliverablesRaw = value.deliverables
  if (!Array.isArray(deliverablesRaw)) fail("deliverables must be a list.")
  const deliverables = deliverablesRaw.map((item, index) => {
    if (!isRecord(item)) fail(`deliverables[${index}] must be an object.`)
    assertExactKeys(item, DELIVERABLE_KEYS, `deliverables[${index}]`)
    return {
      name: assertString(item.name, `deliverables[${index}].name`),
      format: assertString(item.format, `deliverables[${index}].format`, true),
      aspectRatio: assertString(item.aspectRatio, `deliverables[${index}].aspectRatio`, true),
      duration: assertString(item.duration, `deliverables[${index}].duration`, true),
      resolution: assertString(item.resolution, `deliverables[${index}].resolution`, true),
      exactText: assertStringList(item.exactText, `deliverables[${index}].exactText`),
    }
  })

  const workflowRaw = value.proposedWorkflow
  if (!Array.isArray(workflowRaw)) fail("proposedWorkflow must be a list.")
  const proposedWorkflow = workflowRaw.map((item, index) => {
    if (!isRecord(item)) fail(`proposedWorkflow[${index}] must be an object.`)
    assertExactKeys(item, WORKFLOW_KEYS, `proposedWorkflow[${index}]`)
    return {
      name: assertString(item.name, `proposedWorkflow[${index}].name`),
      capability: assertCapability(item.capability, `proposedWorkflow[${index}].capability`),
      purpose: assertString(item.purpose, `proposedWorkflow[${index}].purpose`),
    }
  })
  const stepNames = proposedWorkflow.map((step) => step.name)
  if (new Set(stepNames).size !== stepNames.length) {
    fail("proposedWorkflow step names must be unique.")
  }

  const attemptsRaw = value.estimatedAttemptsByStep
  if (!Array.isArray(attemptsRaw)) fail("estimatedAttemptsByStep must be a list.")
  const estimatedAttemptsByStep = attemptsRaw.map((item, index) => {
    if (!isRecord(item)) fail(`estimatedAttemptsByStep[${index}] must be an object.`)
    assertExactKeys(item, ATTEMPT_KEYS, `estimatedAttemptsByStep[${index}]`)
    if (typeof item.attempts !== "number" || !Number.isInteger(item.attempts) || item.attempts < 1) {
      fail(`estimatedAttemptsByStep[${index}].attempts must be an integer of at least 1.`)
    }
    return {
      stepName: assertString(item.stepName, `estimatedAttemptsByStep[${index}].stepName`),
      capability: assertCapability(item.capability, `estimatedAttemptsByStep[${index}].capability`),
      attempts: item.attempts,
    }
  })

  if (typeof value.confidence !== "number" || !Number.isInteger(value.confidence)) {
    fail("confidence must be an integer.")
  }
  if (value.confidence < 0 || value.confidence > 100) fail("confidence must be from 0 to 100.")

  if (typeof value.revisionRisk !== "string" || !REVISION_RISKS.includes(value.revisionRisk as RevisionRisk)) {
    fail("revisionRisk must be low, medium, or high.")
  }

  const lists = {} as Pick<AnalysisDraft, (typeof STRING_LIST_KEYS)[number]>
  for (const key of STRING_LIST_KEYS) {
    lists[key] = assertStringList(value[key], key)
  }

  return {
    jobType: assertString(value.jobType, "jobType"),
    conciseSummary: assertString(value.conciseSummary, "conciseSummary"),
    deliverables,
    ...lists,
    revisionRisk: value.revisionRisk as RevisionRisk,
    confidence: value.confidence,
    decision: assertDecision(value.decision, "decision"),
    proposedWorkflow,
    estimatedAttemptsByStep,
  }
}

const COSTING_KEYS = [
  "pricesComplete",
  "lines",
  "generationCents",
  "contingencyCents",
  "channelFeeCents",
  "spendCents",
  "productionBudgetCents",
  "targetMarginBps",
] as const

export function validateStoredAnalysis(value: unknown): StoredAnalysis {
  if (!isRecord(value)) fail("Stored analysis must be an object.")
  if (!("deskDecision" in value)) fail("Stored analysis is missing deskDecision.")
  if (!("costing" in value)) fail("Stored analysis is missing costing.")
  const draftInput: Record<string, unknown> = {}
  for (const key of DRAFT_KEYS) draftInput[key] = value[key]
  const draft = validateAnalysisDraft(draftInput)
  const deskDecision = assertDecision(value.deskDecision, "deskDecision")
  if (!isRecord(value.costing)) fail("costing must be an object.")
  assertExactKeys(value.costing, COSTING_KEYS, "costing")
  if (typeof value.costing.pricesComplete !== "boolean") fail("costing.pricesComplete must be a boolean.")
  if (!Array.isArray(value.costing.lines)) fail("costing.lines must be a list.")
  const nullableInt = (item: unknown, label: string): number | null => {
    if (item === null) return null
    if (typeof item !== "number" || !Number.isInteger(item)) fail(`${label} must be an integer or null.`)
    return item
  }
  const int = (item: unknown, label: string): number => {
    if (typeof item !== "number" || !Number.isInteger(item)) fail(`${label} must be an integer.`)
    return item
  }
  return {
    ...draft,
    deskDecision,
    costing: {
      pricesComplete: value.costing.pricesComplete,
      lines: value.costing.lines as AnalysisCosting["lines"],
      generationCents: nullableInt(value.costing.generationCents, "costing.generationCents"),
      contingencyCents: nullableInt(value.costing.contingencyCents, "costing.contingencyCents"),
      channelFeeCents: int(value.costing.channelFeeCents, "costing.channelFeeCents"),
      spendCents: nullableInt(value.costing.spendCents, "costing.spendCents"),
      productionBudgetCents: int(value.costing.productionBudgetCents, "costing.productionBudgetCents"),
      targetMarginBps: int(value.costing.targetMarginBps, "costing.targetMarginBps"),
    },
  }
}

function sentenceRequests(text: string, pattern: RegExp): boolean {
  return text.split(/[\n.]/).some((sentence) => {
    if (!pattern.test(sentence)) return false
    return !/\b(no|not|without|don't|do not|never|isn't|is not)\b/i.test(sentence)
  })
}

function anyRequested(texts: string[], pattern: RegExp): boolean {
  return texts.some((text) => sentenceRequests(text, pattern))
}

function collectedText(draft: AnalysisDraft): string[] {
  return [
    draft.jobType,
    draft.conciseSummary,
    ...draft.deliverables.flatMap((item) => [
      item.name,
      item.format,
      item.aspectRatio,
      item.duration,
      item.resolution,
      ...item.exactText,
    ]),
    ...draft.suppliedAssets,
    ...draft.missingAssets,
    ...draft.questionsForClient,
    ...draft.brandConstraints,
    ...draft.rightsAndConsentFlags,
    ...draft.technicalRisks,
    ...draft.decisionReasons,
    ...draft.assumptions,
    ...draft.proposedWorkflow.map((step) => `${step.name} ${step.purpose}`),
  ]
}

const IMPERSONATION =
  /zendaya|taylor swift|elon musk|celebrity|deepfake|looks exactly like|public figure|impersonat|sounds exactly like/i

const REVIEW_FLAGS =
  /\blogo\b|\btrademark\b|\bpackaging\b|\bproduct label\b|\blikeness\b|\breal person\b|\breal people\b|\blicensed music\b|\bcopyrighted song\b|\blibrary music\b|\bmedical\b|\bfinancial claim\b|\bclinically proven\b|\bunclear rights\b|\bunclear ownership\b|\bvoice clone\b|\bfamous voice\b/i

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function finalizeAnalysis(draft: AnalysisDraft, context: CommercialContext): StoredAnalysis {
  const validated = validateAnalysisDraft(draft)
  const now = context.now ?? new Date()
  const targetMarginBps = context.targetMarginBps ?? DEFAULT_TARGET_MARGIN_BPS
  const texts = collectedText(validated)
  const reasons: string[] = []
  let desk: Decision = "accept"
  const flags = [...validated.rightsAndConsentFlags]

  const note = (decision: Decision, reason: string) => {
    desk = stricterDecision(desk, decision)
    reasons.push(`Desk: ${reason}`)
  }

  if (validated.deliverables.length === 0) {
    note("reject", "The brief has no concrete deliverable, so it cannot be produced reliably.")
  }
  const vague = validated.deliverables.some(
    (item) => !item.format && !item.aspectRatio && !item.duration && !item.resolution,
  )
  if (validated.deliverables.length > 0 && vague) {
    note("human_review", "A deliverable is missing format, aspect ratio, duration, and resolution.")
  }

  if (validated.proposedWorkflow.length === 0) {
    note("reject", "No production workflow was proposed, so the job cannot be delivered reliably.")
  }

  if (!context.deadlineIso) {
    note("human_review", "No deadline was supplied.")
  } else {
    const deadline = new Date(context.deadlineIso)
    if (Number.isNaN(deadline.getTime())) {
      note("human_review", "The deadline could not be read.")
    } else if (deadline.getTime() < now.getTime()) {
      note("reject", "The deadline has already passed.")
    }
  }

  if (validated.suppliedAssets.length === 0) {
    note("human_review", "No reference material was supplied.")
  }
  if (validated.missingAssets.length > 0) {
    note("human_review", "Required assets are still missing.")
  }
  if (validated.questionsForClient.length > 0) {
    note("human_review", "The client still needs to answer a production question.")
  }

  if (anyRequested(texts, IMPERSONATION)) {
    flags.push("Deceptive impersonation or a protected likeness was requested.")
    note("reject", "The job asks for deceptive impersonation or a real person's likeness and cannot be delivered.")
  } else if (anyRequested(texts, REVIEW_FLAGS)) {
    note(
      "human_review",
      "Logos, packaging text, likeness, voice, factual claims, licensed music, or unclear rights need a person.",
    )
  }

  const lines: CostLine[] = []
  let pricesComplete = validated.proposedWorkflow.length > 0
  for (const step of validated.proposedWorkflow) {
    const estimate = validated.estimatedAttemptsByStep.find((item) => item.stepName === step.name)
    if (!estimate) {
      pricesComplete = false
      note("human_review", `Attempt estimate is missing for ${step.name}.`)
    } else if (estimate.capability !== step.capability) {
      note("human_review", `Attempt estimate for ${step.name} does not match its capability.`)
    }
    const requested = estimate?.attempts ?? 1
    const billed = billAttempts(requested, step.capability)
    if (billed.overLimit) {
      note(
        "human_review",
        `${step.name} estimates ${requested} attempts, above the approved limit of ${billed.limit}.`,
      )
    }
    const price = context.catalog[step.capability]
    const unitCostCents = price ? price.unitCostCents : null
    if (unitCostCents == null) {
      pricesComplete = false
      note("human_review", `Price data is missing for ${step.capability}. The desk will not guess.`)
      lines.push({
        stepName: step.name,
        capability: step.capability,
        estimatedAttempts: requested,
        billedAttempts: billed.billed,
        unitCostCents: null,
        lineCents: null,
      })
      continue
    }
    lines.push({
      stepName: step.name,
      capability: step.capability,
      estimatedAttempts: requested,
      billedAttempts: billed.billed,
      unitCostCents,
      lineCents: unitCostCents * billed.billed,
    })
  }

  const channelFeeCents = Math.round((context.clientPriceCents * context.channelFeeBps) / 10_000)
  const budget = productionBudgetCents(
    context.clientPriceCents,
    context.channelFeeBps,
    targetMarginBps,
  )
  const generationCents = pricesComplete ? lines.reduce((sum, line) => sum + (line.lineCents ?? 0), 0) : null
  const contingencyCents =
    generationCents == null
      ? null
      : Math.round((generationCents * context.contingencyBps) / 10_000)
  const spendCents =
    generationCents == null || contingencyCents == null ? null : generationCents + contingencyCents

  if (pricesComplete && spendCents != null && spendCents > budget) {
    note(
      "reject",
      "Calculated generation cost plus contingency exceeds the production budget that preserves the target margin.",
    )
  }

  if (!pricesComplete && desk === "accept") {
    note("human_review", "Price data is incomplete, so the job cannot be accepted automatically.")
  }

  const keptReasons = validated.decisionReasons.filter((reason) => !reason.startsWith("Desk:"))
  const decision = stricterDecision(validated.decision, desk)
  if (validated.decision !== decision && !reasons.some((reason) => reason.includes("stricter"))) {
    reasons.push(
      `Desk: The recorded decision is ${decisionLabel(decision)} because it is stricter than the model recommendation (${decisionLabel(validated.decision)}).`,
    )
  }

  return {
    ...validated,
    rightsAndConsentFlags: unique(flags),
    decision,
    decisionReasons: [...keptReasons, ...reasons],
    deskDecision: desk,
    costing: {
      pricesComplete,
      lines,
      generationCents,
      contingencyCents,
      channelFeeCents,
      spendCents,
      productionBudgetCents: budget,
      targetMarginBps,
    },
  }
}

function stringListSchema() {
  return { type: "array", items: { type: "string" } }
}

export function analysisJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      jobType: { type: "string" },
      conciseSummary: { type: "string" },
      deliverables: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            format: { type: "string" },
            aspectRatio: { type: "string" },
            duration: { type: "string" },
            resolution: { type: "string" },
            exactText: stringListSchema(),
          },
          required: [...DELIVERABLE_KEYS],
        },
      },
      suppliedAssets: stringListSchema(),
      missingAssets: stringListSchema(),
      questionsForClient: stringListSchema(),
      brandConstraints: stringListSchema(),
      rightsAndConsentFlags: stringListSchema(),
      technicalRisks: stringListSchema(),
      revisionRisk: { type: "string", enum: [...REVISION_RISKS] },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      decision: { type: "string", enum: ["accept", "human_review", "reject"] },
      decisionReasons: stringListSchema(),
      proposedWorkflow: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            capability: { type: "string", enum: [...CAPABILITIES] },
            purpose: { type: "string" },
          },
          required: [...WORKFLOW_KEYS],
        },
      },
      estimatedAttemptsByStep: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            stepName: { type: "string" },
            capability: { type: "string", enum: [...CAPABILITIES] },
            attempts: { type: "integer", minimum: 1 },
          },
          required: [...ATTEMPT_KEYS],
        },
      },
      assumptions: stringListSchema(),
    },
    required: [...DRAFT_KEYS],
  }
}
