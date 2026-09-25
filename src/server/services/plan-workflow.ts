import { MODEL_CATALOG, type CatalogModel } from "@/server/services/models"

export type PlannedStep = {
  position: number
  name: string
  selectedModel: string
  modelKind: string
  purpose: string
  inputs: string[]
  expectedOutputs: string[]
  estimatedAttempts: number
  unitCostCents: number
  estimatedTotalCents: number
}

function step(
  position: number,
  name: string,
  model: CatalogModel,
  purpose: string,
  inputs: string[],
  outputs: string[],
  attempts: number,
): PlannedStep {
  const estimatedAttempts = Math.max(1, attempts)
  return {
    position,
    name,
    selectedModel: model.id,
    modelKind: model.kind,
    purpose,
    inputs,
    expectedOutputs: outputs,
    estimatedAttempts,
    unitCostCents: model.unitCostCents,
    estimatedTotalCents: model.unitCostCents * estimatedAttempts,
  }
}

function firstNumber(text: string, pattern: RegExp, fallback: number): number {
  const match = text.match(pattern)
  if (!match?.[1]) return fallback
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function durationSeconds(text: string): number | null {
  const match = text.match(
    /\b(\d+(?:\.\d+)?)\s*(?:-)?\s*(seconds|second|secs|sec|minutes|minute|mins|min)\b/i,
  )
  if (!match?.[1] || !match[2]) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  return /min/i.test(match[2]) ? amount * 60 : amount
}

export function planWorkflow(input: {
  title: string
  rawBrief: string
  deliverables: string[]
}): PlannedStep[] {
  const text = `${input.title}\n${input.rawBrief}\n${input.deliverables.join("\n")}`
  const wantsVideo = /film|video|teaser|loop|sequence|shot|cutdown|motion|ident/i.test(text)
  const wantsVoice = /voice-?over|\bvo\b|narrat|spoken word|voice line|voiceover/i.test(text)
  const wantsStills = /still|poster|cover|keyframe|image|artwork|frame/i.test(text) || !wantsVideo
  const seconds = durationSeconds(text)

  const steps: PlannedStep[] = []
  const sharedInputs = [
    "Pasted brief",
    input.deliverables[0] ? `Primary deliverable: ${input.deliverables[0]}` : input.title,
  ]

  if (wantsStills) {
    const stills = firstNumber(text, /\b(\d+)\s+(?:hero\s+)?stills?\b/i, wantsVideo ? 4 : 6)
    steps.push(
      step(
        steps.length + 1,
        "Key stills",
        MODEL_CATALOG.image,
        "Generate the stills and storyboard frames the edit will be built from.",
        sharedInputs,
        [`${stills} selected stills`, "Contact sheet"],
        stills,
      ),
    )
  }

  if (wantsVideo) {
    const shots = seconds ? Math.max(1, Math.round(seconds / 5)) : 3
    const attempts = Math.min(12, shots + 1)
    steps.push(
      step(
        steps.length + 1,
        "Motion coverage",
        MODEL_CATALOG.video,
        "Generate the approved shots. Extra attempts are safety takes, not a new concept.",
        [...sharedInputs, seconds ? `Target duration about ${seconds}s` : "Duration from the brief"],
        ["Picture selects", seconds ? `${seconds}s timeline coverage` : "Short motion selects"],
        attempts,
      ),
    )
  }

  if (wantsVoice) {
    steps.push(
      step(
        steps.length + 1,
        "Voice line",
        MODEL_CATALOG.voice,
        "Record the original line only. No licensed song and no impersonation.",
        [...sharedInputs, "Exact text from the brief"],
        ["One approved voice line", "Alternate read"],
        2,
      ),
    )
  }

  if (steps.length >= 2 || /cutdown|edit|assembly|version/i.test(text)) {
    const passes = /cutdown|9:16|stories|reel/i.test(text) ? 2 : 1
    steps.push(
      step(
        steps.length + 1,
        "Assembly",
        MODEL_CATALOG.editing,
        "Cut the selects into the deliverable lengths named in the brief.",
        ["Approved stills and motion", "Exact on-screen text"],
        ["Master assembly", passes > 1 ? "Secondary cut" : "Picture lock candidate"],
        passes,
      ),
    )
  }

  if (steps.length > 0) {
    steps.push(
      step(
        steps.length + 1,
        "Finish",
        MODEL_CATALOG.finishing,
        "Grade, place supers, and export the files listed in the plan.",
        ["Picture lock candidate", "Brand constraints"],
        ["Finished master", "QA stills"],
        /cutdown|9:16|stories/i.test(text) ? 2 : 1,
      ),
    )
  }

  return steps.map((item, index) => ({ ...item, position: index + 1 }))
}
