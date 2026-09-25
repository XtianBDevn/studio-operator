import {
  ANALYSIS_SYSTEM_PROMPT,
  APPROVED_ATTEMPT_LIMITS,
  CAPABILITIES,
  DEFAULT_TARGET_MARGIN_BPS,
  analysisJsonSchema,
  finalizeAnalysis,
  validateAnalysisDraft,
  type AnalysisDraft,
  type AttemptEstimate,
  type Capability,
  type CommercialContext,
  type DeliverableSpec,
  type StoredAnalysis,
  type WorkflowProposal,
} from "@/lib/analysis"
import { StudioError } from "@/lib/errors"
import { resolveAnalysisProvider } from "@/server/config"
import { explicitDemoWorkflow } from "@/lib/demos"
import { MODEL_CATALOG } from "@/server/services/models"

export { resolveAnalysisProvider }

export type { AnalysisDraft, StoredAnalysis }

export type AnalysisResult = {
  document: StoredAnalysis
  modelLabel: string
  provider: "mock" | "openai"
}

export type AnalysisInput = {
  rawBrief: string
  budgetCents: number
  deadlineIso: string | null
  assetLabels: string[]
  channelFeeBps?: number
  contingencyBps?: number
  now?: Date
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function analysisModelId(): string {
  return process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_COMPAT_MODEL?.trim() || "gpt-6-astra"
}

function openAiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_COMPAT_API_KEY?.trim() || ""
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function sentenceRequests(brief: string, pattern: RegExp): boolean {
  return brief.split(/[\n.]/).some((sentence) => {
    if (!pattern.test(sentence)) return false
    return !/\b(no|not|without|don't|do not|never|isn't|is not)\b/i.test(sentence)
  })
}

function quotedText(brief: string): string[] {
  const found: string[] = []
  const pattern = /["“]([^"”]{1,180})["”]/g
  for (const match of brief.matchAll(pattern)) {
    if (match[1]) found.push(match[1].trim())
  }
  return unique(found)
}

function bulletLines(brief: string): string[] {
  return brief
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""))
}

function durationLabel(brief: string): string {
  const match = brief.match(
    /\b\d+(?:\.\d+)?\s*(?:-)?\s*(?:seconds|second|secs|sec|minutes|minute|mins|min)\b|\b\d+\s*s\b/i,
  )
  return match?.[0] ?? ""
}

function durationSeconds(brief: string): number | null {
  const match = brief.match(
    /\b(\d+(?:\.\d+)?)\s*(?:-)?\s*(seconds|second|secs|sec|minutes|minute|mins|min)\b/i,
  )
  if (!match?.[1] || !match[2]) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  return /min/i.test(match[2]) ? amount * 60 : amount
}

function aspectRatio(brief: string): string {
  const ratio = brief.match(/\b(?:16:9|9:16|1:1|4:5|3:2)\b/i)
  if (ratio) return ratio[0]
  if (/square/i.test(brief)) return "1:1"
  return ""
}

function resolution(brief: string): string {
  return brief.match(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/)?.[0] ?? ""
}

function wantsVideo(brief: string): boolean {
  return /film|video|teaser|loop|sequence|shot|cutdown|motion|ident|ad\b/i.test(brief)
}

function wantsVoice(brief: string): boolean {
  return /voice-?over|\bvo\b|narrat|spoken word|voice line|voiceover/i.test(brief)
}

function wantsStills(brief: string): boolean {
  return /still|poster|cover|keyframe|artwork|frame/i.test(brief) || !wantsVideo(brief)
}

export function catalogCapabilityBrief(): string {
  return CAPABILITIES.map((capability) => {
    const limit = APPROVED_ATTEMPT_LIMITS[capability]
    return `- ${capability}: capability only. Approved attempt limit ${limit}. Do not invent a price, endpoint, or model id.`
  }).join("\n")
}

export function buildAnalysisUserPrompt(input: AnalysisInput): string {
  const dollars = (input.budgetCents / 100).toFixed(2)
  const assets = input.assetLabels.length ? input.assetLabels.join("\n") : "None supplied."
  return [
    "Evaluate this pasted client brief and return structured output.",
    "Recommend a decision. The application will replace it with a deterministic desk decision using the model catalog. Do not include prices.",
    "",
    "Capabilities you may name:",
    catalogCapabilityBrief(),
    "",
    `Client price: $${dollars}. This is what the client pays, not a generation price.`,
    `Deadline: ${input.deadlineIso ?? "none"}`,
    "Supplied reference labels:",
    assets,
    "",
    "Brief:",
    input.rawBrief.trim(),
  ].join("\n")
}

export function buildResponsesBody(input: AnalysisInput): Record<string, unknown> {
  return {
    model: analysisModelId(),
    instructions: ANALYSIS_SYSTEM_PROMPT,
    input: buildAnalysisUserPrompt(input),
    text: {
      format: {
        type: "json_schema",
        name: "studio_brief_analysis",
        strict: true,
        schema: analysisJsonSchema(),
      },
    },
  }
}

export function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new StudioError("The model response did not include structured output. Nothing was saved.")
  }
  const record = payload as Record<string, unknown>
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text
  if (Array.isArray(record.output)) {
    const chunks: string[] = []
    for (const item of record.output) {
      if (!item || typeof item !== "object") continue
      const content = (item as { content?: unknown }).content
      if (!Array.isArray(content)) continue
      for (const part of content) {
        if (!part || typeof part !== "object") continue
        const text = (part as { text?: unknown }).text
        const type = (part as { type?: unknown }).type
        if (typeof text === "string" && (!type || type === "output_text")) chunks.push(text)
      }
    }
    if (chunks.length > 0) return chunks.join("")
  }
  throw new StudioError("The model response did not include structured output. Nothing was saved.")
}

export async function requestAstraAnalysis(
  input: AnalysisInput,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const key = openAiKey()
  if (!key) {
    throw new StudioError("OPENAI_API_KEY is not set. Nothing was saved.")
  }
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildResponsesBody(input)),
  })
  if (!response.ok) {
    throw new StudioError(`The analysis provider returned ${response.status}. Nothing was saved.`)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new StudioError("The model response was not JSON. Nothing was saved.")
  }
  const text = extractOutputText(payload)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new StudioError("The model response was not valid JSON. Nothing was saved.")
  }
}

function proposal(
  name: string,
  capability: Capability,
  purpose: string,
  attempts: number,
): { step: WorkflowProposal; attempt: AttemptEstimate } {
  return {
    step: { name, capability, purpose },
    attempt: { stepName: name, capability, attempts: Math.max(1, attempts) },
  }
}

export function mockAnalysisDraft(input: AnalysisInput): AnalysisDraft {
  const brief = input.rawBrief
  const bullets = bulletLines(brief)
  const quotes = quotedText(brief)
  const ratio = aspectRatio(brief)
  const frame = resolution(brief)
  const duration = durationLabel(brief)
  const seconds = durationSeconds(brief)
  const video = wantsVideo(brief)
  const voice = wantsVoice(brief)
  const stills = wantsStills(brief)

  const deliverables: DeliverableSpec[] = []
  const motionBullets = bullets.filter((line) =>
    /film|video|still|cutdown|voice|poster|cover|ident|loop|sequence|artwork|export|teaser/i.test(line),
  )
  if (motionBullets.length > 0) {
    for (const line of motionBullets.slice(0, 6)) {
      const lineRatio = aspectRatio(line) || ratio
      const lineFrame = resolution(line) || frame
      const lineDuration = durationLabel(line) || (video && !/still|cover|poster/i.test(line) ? duration : "")
      deliverables.push({
        name: line,
        format: /still|cover|poster|artwork/i.test(line) ? "still" : video ? "motion" : "still",
        aspectRatio: lineRatio,
        duration: /still|cover|poster/i.test(line) ? "" : lineDuration,
        resolution: lineFrame,
        exactText: quotes,
      })
    }
  } else if (video) {
    deliverables.push({
      name: seconds ? `${seconds}-second motion deliverable` : "Motion deliverable described in the brief",
      format: "motion",
      aspectRatio: ratio,
      duration,
      resolution: frame,
      exactText: quotes,
    })
  } else {
    deliverables.push({
      name: "Still deliverable described in the brief",
      format: "still",
      aspectRatio: ratio,
      duration: "",
      resolution: frame,
      exactText: quotes,
    })
  }
  if (voice && !deliverables.some((item) => /voice/i.test(item.name))) {
    deliverables.push({
      name: "Original voice line",
      format: "audio",
      aspectRatio: "",
      duration: "one line",
      resolution: "",
      exactText: quotes,
    })
  }

  const suppliedAssets = unique([
    ...input.assetLabels,
    ...brief
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          /^(references?|location|product)\b/i.test(line) ||
          (/^-\s+/.test(line) && /reference|mood|location/i.test(line)),
      )
      .map((line) => line.replace(/^[-*•]\s+/, "")),
  ]).slice(0, 8)

  const missingAssets: string[] = []
  const questions: string[] = []
  if (/logo later|send the logo|logo if|greyscale logo|logo file/i.test(brief)) {
    missingAssets.push("Client logo file")
    questions.push("Send the logo file and confirm whether it must be reproduced exactly.")
  }
  if (/end card|on-screen|wordmark|title card|caption/i.test(brief) && quotes.length === 0) {
    questions.push("What is the exact on-screen text, character for character?")
  }
  if (video && !duration) questions.push("What duration should the motion deliverable hit?")
  if (!ratio && !frame) questions.push("What aspect ratio and pixel size should the master use?")

  const brandConstraints = unique(
    brief
      .split("\n")
      .map((line) => line.trim().replace(/^[-*•]\s+/, ""))
      .filter((line) => /palette|brand|#[0-9a-f]{3,8}|wordmark|tone|no [a-z]/i.test(line)),
  ).slice(0, 8)

  const rights: string[] = []
  if (sentenceRequests(brief, /zendaya|taylor swift|elon musk|celebrity|deepfake|looks exactly like|public figure likeness/i)) {
    rights.push("The brief asks for a real person's likeness.")
  }
  if (sentenceRequests(brief, /beatles|come together|copyrighted song|licensed music|drake|beyonc/i)) {
    rights.push("The brief requests licensed or copyrighted music.")
  }
  if (
    sentenceRequests(brief, /nike|marvel|mickey mouse|disney character/i) &&
    sentenceRequests(brief, /logo|jacket|wearing|trademark/i)
  ) {
    rights.push("The brief uses a third-party trademark as wardrobe, branding, or a character.")
  }
  if (sentenceRequests(brief, /famous voice|voice clone|sounds exactly like/i)) {
    rights.push("The brief asks for a real person's voice.")
  }

  const technicalRisks: string[] = []
  if (/9:16|cutdown|stories|reel/i.test(brief) && /16:9|1920x1080/i.test(brief)) {
    technicalRisks.push("Two aspect ratios need separate finishing, not a single crop assumed to be safe.")
  }

  const explicit = explicitDemoWorkflow(brief)
  const steps: Array<{ step: WorkflowProposal; attempt: AttemptEstimate }> = []
  if (explicit) {
    for (const item of explicit) {
      steps.push(proposal(item.name, item.capability, item.purpose, item.attempts))
    }
  } else if (stills) {
    const stillCount = Number(brief.match(/\b(\d+)\s+(?:hero\s+)?stills?\b/i)?.[1] ?? (video ? 2 : 4))
    steps.push(
      proposal(
        "Key stills",
        "image",
        "Explore stills before any motion. Use the catalog image capability only.",
        Number.isFinite(stillCount) ? stillCount : 2,
      ),
    )
  }
  if (!explicit && video) {
    const shots = seconds ? Math.max(1, Math.round(seconds / 5)) : 2
    steps.push(
      proposal(
        "Motion coverage",
        "video",
        "Cover the approved duration with the catalog video capability. Extra attempts are safety takes.",
        Math.min(12, shots + 1),
      ),
    )
  }
  if (!explicit && voice) {
    steps.push(
      proposal(
        "Voice line",
        "voice",
        "Read only the approved original line. No impersonation and no licensed song.",
        2,
      ),
    )
  }
  if (!explicit && (steps.length >= 2 || /cutdown|edit|assembly|version/i.test(brief))) {
    steps.push(
      proposal(
        "Assembly",
        "editing",
        "Assemble the selects into the deliverables named in the brief.",
        /cutdown|9:16|stories|reel/i.test(brief) ? 2 : 1,
      ),
    )
  }
  if (!explicit && steps.length > 0) {
    steps.push(
      proposal(
        "Finish",
        "finishing",
        "Make the approved selects deliverable. Do not invent a new concept.",
        /cutdown|9:16|stories/i.test(brief) ? 2 : 1,
      ),
    )
  }

  let confidence = 58
  if (ratio || frame) confidence += 8
  if (duration) confidence += 8
  if (quotes.length) confidence += 8
  if (input.assetLabels.length) confidence += 6
  if (brandConstraints.length) confidence += 4
  confidence -= Math.min(24, (missingAssets.length + questions.length) * 6)
  if (rights.length) confidence -= 12
  confidence = Math.min(94, Math.max(22, confidence))

  const modelDecision: AnalysisDraft["decision"] =
    rights.some((flag) => /likeness|impersonat/i.test(flag)) ? "reject" : rights.length || missingAssets.length || questions.length ? "human_review" : "accept"

  const decisionReasons = [
    modelDecision === "accept"
      ? "The pasted brief names a deliverable that can be planned."
      : modelDecision === "human_review"
        ? "A person should resolve the open assets, text, or rights before production."
        : "Decline this job. It asks for work the studio cannot produce reliably or lawfully.",
    "This recommendation does not message the client, submit a proposal, or accept a contract.",
  ]

  return {
    jobType: video ? "motion" : voice ? "audio" : "stills",
    conciseSummary: video
      ? "Motion job parsed from the pasted brief. Prices are left to the catalog."
      : "Stills job parsed from the pasted brief. Prices are left to the catalog.",
    deliverables,
    suppliedAssets: input.assetLabels.length ? unique(input.assetLabels) : suppliedAssets,
    missingAssets,
    questionsForClient: questions,
    brandConstraints,
    rightsAndConsentFlags: rights,
    technicalRisks,
    revisionRisk: rights.length ? "high" : missingAssets.length || questions.length ? "medium" : "low",
    confidence,
    decision: modelDecision,
    decisionReasons,
    proposedWorkflow: steps.map((item) => item.step),
    estimatedAttemptsByStep: steps.map((item) => item.attempt),
    assumptions: [
      "Attempt counts are estimates. The desk prices them from the current catalog and approved limits.",
      "No marketplace message, proposal, or delivery is part of this analysis.",
    ],
  }
}

export function targetMarginBpsFromEnv(): number {
  const raw = process.env.TARGET_MARGIN_BPS?.trim()
  if (!raw) return DEFAULT_TARGET_MARGIN_BPS
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) return DEFAULT_TARGET_MARGIN_BPS
  return parsed
}

export function catalogPrices(): CommercialContext["catalog"] {
  return {
    image: { unitCostCents: MODEL_CATALOG.image.unitCostCents },
    video: { unitCostCents: MODEL_CATALOG.video.unitCostCents },
    voice: { unitCostCents: MODEL_CATALOG.voice.unitCostCents },
    editing: { unitCostCents: MODEL_CATALOG.editing.unitCostCents },
    finishing: { unitCostCents: MODEL_CATALOG.finishing.unitCostCents },
  }
}

export function commercialContext(input: AnalysisInput, now?: Date): CommercialContext {
  return {
    clientPriceCents: input.budgetCents,
    channelFeeBps: input.channelFeeBps ?? 0,
    contingencyBps: input.contingencyBps ?? 1500,
    deadlineIso: input.deadlineIso,
    now: now ?? input.now ?? new Date(),
    targetMarginBps: targetMarginBpsFromEnv(),
    catalog: catalogPrices(),
  }
}

export async function produceAnalysis(
  input: AnalysisInput,
  options?: { fetchImpl?: FetchLike; now?: Date },
): Promise<AnalysisResult> {
  const provider = resolveAnalysisProvider()
  const raw =
    provider === "openai"
      ? await requestAstraAnalysis(input, options?.fetchImpl)
      : mockAnalysisDraft(input)
  return commitValidatedAnalysis(raw, commercialContext(input, options?.now), {
    modelLabel: `GPT-6 Astra (${analysisModelId()})`,
    provider,
  })
}

export function commitValidatedAnalysis(
  raw: unknown,
  context: CommercialContext,
  meta: { modelLabel: string; provider: "mock" | "openai" },
): AnalysisResult {
  let draft: AnalysisDraft
  try {
    draft = validateAnalysisDraft(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analysis."
    throw new StudioError(`${message} Nothing was saved.`)
  }
  return {
    document: finalizeAnalysis(draft, context),
    modelLabel: meta.modelLabel,
    provider: meta.provider,
  }
}

export async function analyzeBrief(input: AnalysisInput): Promise<AnalysisResult> {
  return produceAnalysis(input)
}
