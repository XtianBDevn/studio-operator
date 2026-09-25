import type { Decision } from "@/lib/types"

export type AnalysisDraft = {
  deliverables: string[]
  dimensions: string[]
  durations: string[]
  referenceNotes: string[]
  exactText: string[]
  brandConstraints: string[]
  rightsConcerns: string[]
  missingInformation: string[]
  confidence: number
  decision: Decision
  rationale: string
  modelLabel: string
}

export type AnalysisProviderConfig = {
  label: string
  model: string
  baseUrl: string
  mode: "mock" | "live"
}

/**
 * Analysis is labeled GPT-6 Astra and reads OPENAI_COMPAT_MODEL.
 * Prompt 1 never calls the endpoint. Mock mode structures the pasted brief locally.
 * Live mode is refused by the stub so an empty key cannot leak into a request.
 */
export function getAnalysisProviderConfig(): AnalysisProviderConfig {
  return {
    label: "GPT-6 Astra",
    model: process.env.OPENAI_COMPAT_MODEL?.trim() || "gpt-6-astra",
    baseUrl: process.env.OPENAI_COMPAT_BASE_URL?.trim() || "",
    mode: process.env.STUDIO_OPERATOR_MODE === "live" ? "live" : "mock",
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
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

function sentenceRequests(brief: string, pattern: RegExp): boolean {
  return brief.split(/[\n.]/).some((sentence) => {
    if (!pattern.test(sentence)) return false
    return !/\b(no|not|without|don't|do not|never)\b/i.test(sentence)
  })
}

function rightsFromBrief(brief: string): { severe: string[]; review: string[] } {
  const severe: string[] = []
  if (
    sentenceRequests(
      brief,
      /zendaya|taylor swift|elon musk|celebrity|deepfake|looks exactly like|public figure likeness/i,
    )
  ) {
    severe.push(
      "The brief asks for a real person's likeness. That is a rights block, not a generation prompt.",
    )
  }
  if (
    sentenceRequests(
      brief,
      /beatles|come together|copyrighted song|drake|beyonc/i,
    )
  ) {
    severe.push(
      "The brief requests a copyrighted music track. This desk will not generate or attach uncleared audio.",
    )
  }
  if (
    sentenceRequests(brief, /nike|marvel|mickey mouse|disney character/i) &&
    sentenceRequests(brief, /logo|jacket|wearing|trademark/i)
  ) {
    severe.push("The brief uses a third-party trademark as wardrobe, branding, or a character.")
  }

  const review: string[] = []
  if (/trending audio|viral sound|famous voice|sounds like\s+[A-Z]/i.test(brief)) {
    review.push("The audio reference may be uncleared. Confirm an original track before production.")
  }
  return { severe, review }
}

function inferDeliverables(brief: string, bullets: string[]): string[] {
  const fromBullets = bullets.filter((line) =>
    /film|video|still|cutdown|voice|poster|cover|ident|loop|sequence|artwork|export/i.test(line),
  )
  if (fromBullets.length > 0) return unique(fromBullets).slice(0, 8)

  const inferred: string[] = []
  if (/concept film|brand film|title sequence|teaser|video|loop/i.test(brief)) {
    inferred.push("Motion deliverable described in the brief")
  }
  if (/still|cover|poster|artwork/i.test(brief)) {
    inferred.push("Still deliverable described in the brief")
  }
  if (/voice-?over|voice line|narrat/i.test(brief)) {
    inferred.push("Original voice line")
  }
  if (inferred.length === 0) inferred.push("Scope still needs a concrete deliverable list")
  return inferred
}

export function analyzeBrief(input: {
  rawBrief: string
  budgetCents: number
  deadlineIso: string | null
  assetLabels: string[]
}): AnalysisDraft {
  const provider = getAnalysisProviderConfig()
  if (provider.mode === "live") {
    throw new Error(
      "Live analysis is stubbed in this build. Keep STUDIO_OPERATOR_MODE=mock. No request was sent to the model provider.",
    )
  }

  const brief = input.rawBrief
  const bullets = bulletLines(brief)
  const deliverables = inferDeliverables(brief, bullets)
  const dimensions = unique([
    ...(brief.match(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/g) ?? []),
    ...(brief.match(/\b(?:16:9|9:16|1:1|4:5|3:2)\b/gi) ?? []),
    /square/i.test(brief) ? "1:1" : "",
  ])
  const durations = unique(
    brief.match(
      /\b\d+(?:\.\d+)?\s*(?:-)?\s*(?:seconds|second|secs|sec|minutes|minute|mins|min)\b|\b\d+\s*s\b/gi,
    ) ?? [],
  )
  const exactText = quotedText(brief)
  const brandConstraints = unique(
    brief
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /palette|brand|#[0-9a-f]{3,8}|wordmark|tone|no [a-z]/i.test(line)),
  ).slice(0, 8)
  const rights = rightsFromBrief(brief)
  const rightsConcerns = unique([...rights.severe, ...rights.review])
  const referenceNotes = unique([
    ...input.assetLabels,
    ...brief
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /reference|mood|location/i.test(line)),
  ]).slice(0, 8)

  const missing: string[] = []
  const wantsVideo = /film|video|teaser|loop|sequence|shot|cutdown|motion|ident/i.test(brief)
  if (wantsVideo && durations.length === 0) missing.push("Duration is not stated")
  if (dimensions.length === 0) missing.push("Frame size or aspect ratio is not stated")
  if (/end card|on-screen|wordmark|title card|caption/i.test(brief) && exactText.length === 0) {
    missing.push("Exact on-screen text is not quoted")
  }
  if (!input.deadlineIso) missing.push("Deadline is empty")
  if (/logo later|send the logo|tbd|to be determined/i.test(brief)) {
    missing.push("A required asset is still unsent")
  }

  const budgetTight =
    (wantsVideo && input.budgetCents < 40_000) ||
    (wantsVideo && /45-second|45 second|60-second|one minute/i.test(brief) && input.budgetCents < 150_000)

  let decision: Decision = "accept"
  if (rights.severe.length > 0) decision = "reject"
  else if (rights.review.length > 0 || missing.length > 0 || budgetTight) decision = "review"

  let confidence = 0.58
  if (dimensions.length) confidence += 0.08
  if (durations.length) confidence += 0.08
  if (exactText.length) confidence += 0.08
  if (input.assetLabels.length) confidence += 0.05
  if (brandConstraints.length) confidence += 0.04
  confidence -= Math.min(0.2, missing.length * 0.05)
  if (rightsConcerns.length) confidence -= 0.12
  confidence = Math.min(0.94, Math.max(0.22, Number(confidence.toFixed(2))))

  const rationaleParts = [
    decision === "accept"
      ? "The pasted brief is specific enough to plan production."
      : decision === "review"
        ? "A person should review this brief before any generation is approved."
        : "Decline this job. The brief asks for work the studio should not produce.",
  ]
  if (rights.severe.length) rationaleParts.push(rights.severe.join(" "))
  if (budgetTight) {
    rationaleParts.push("The client price is thin for the motion scope at the mock catalog rates.")
  }
  if (missing.length) rationaleParts.push(`Missing information: ${missing.join("; ")}.`)
  rationaleParts.push(
    "This recommendation does not message the client, submit a proposal, or accept a contract.",
  )

  return {
    deliverables,
    dimensions,
    durations,
    referenceNotes,
    exactText,
    brandConstraints,
    rightsConcerns,
    missingInformation: missing,
    confidence,
    decision,
    rationale: rationaleParts.join(" "),
    modelLabel: `${provider.label} (${provider.model})`,
  }
}
