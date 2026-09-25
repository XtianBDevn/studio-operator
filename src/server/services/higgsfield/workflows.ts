/**
 * Connected workflows from the current Higgsfield catalog.
 *
 * Image: SOUL V2 — https://docs.higgsfield.ai/docs/models/soul-2/generate.md
 *   POST https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard
 * Video: Kling 3.0 Standard text-to-video —
 *   https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md
 *   POST https://api.higgsfield.ai/kling-video/v3.0/std/text-to-video
 *
 * Voice, editing, and finishing do not have a verified generation endpoint
 * in the pages this desk uses, so live mode does not invent one.
 */

export const HIGGSFIELD_DOCS = {
  authentication: "https://docs.higgsfield.ai/docs/authentication.md",
  requests: "https://docs.higgsfield.ai/docs/concepts/requests.md",
  polling: "https://docs.higgsfield.ai/docs/concepts/polling.md",
  billing: "https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md",
  sdk: "https://docs.higgsfield.ai/docs/how-to/sdk.md",
  soulV2: "https://docs.higgsfield.ai/docs/models/soul-2/generate.md",
  klingStandard: "https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md",
} as const

export const SOUL_V2 = {
  endpointId: "higgsfield-ai/soul/v2/standard",
  label: "Higgsfield SOUL V2",
  kind: "image",
} as const

export const KLING_V3_STANDARD = {
  endpointId: "kling-video/v3.0/std/text-to-video",
  label: "Kling 3.0 Standard",
  kind: "video",
} as const

export const CONNECTION_TEST_PROMPT = "A plain light-gray square centered on a white background."

const SOUL_ASPECTS = ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"] as const
const KLING_ASPECTS = ["16:9", "9:16", "1:1"] as const

export type SoulV2Input = {
  prompt: string
  aspect_ratio: (typeof SOUL_ASPECTS)[number]
  resolution: "720p" | "1080p"
  enhance_prompt: false
  batch_size: 1
}

export type KlingStandardInput = {
  prompt: string
  duration: number
  aspect_ratio: (typeof KLING_ASPECTS)[number]
  sound: "on" | "off"
  cfg_scale: 0.5
  multi_shots: false
}

export function buildSoulV2Input(input: {
  prompt: string
  aspectRatio?: string | null
  resolution?: string | null
}): SoulV2Input {
  const prompt = input.prompt.trim().slice(0, 2000)
  if (!prompt) throw new Error("SOUL V2 requires a prompt. No request was sent.")
  const aspect = SOUL_ASPECTS.find((value) => value === input.aspectRatio) ?? "1:1"
  const resolution = input.resolution === "1080p" ? "1080p" : "720p"
  return {
    prompt,
    aspect_ratio: aspect,
    resolution,
    enhance_prompt: false,
    batch_size: 1,
  }
}

export function connectionTestInput(): SoulV2Input {
  return buildSoulV2Input({
    prompt: CONNECTION_TEST_PROMPT,
    aspectRatio: "1:1",
    resolution: "720p",
  })
}

export function buildKlingStandardInput(input: {
  prompt: string
  aspectRatio?: string | null
  durationSeconds?: number | null
  sound?: "on" | "off" | null
}): KlingStandardInput {
  const prompt = input.prompt.trim().slice(0, 2500)
  if (!prompt) throw new Error("Kling 3.0 Standard requires a prompt. No request was sent.")
  const aspect = KLING_ASPECTS.find((value) => value === input.aspectRatio) ?? "16:9"
  let duration = input.durationSeconds ?? 5
  if (!Number.isInteger(duration) || duration < 3 || duration > 15) duration = 5
  return {
    prompt,
    duration,
    aspect_ratio: aspect,
    sound: input.sound === "on" ? "on" : "off",
    cfg_scale: 0.5,
    multi_shots: false,
  }
}

export function connectedWorkflow(kind: string): typeof SOUL_V2 | typeof KLING_V3_STANDARD | null {
  if (kind === "image") return SOUL_V2
  if (kind === "video") return KLING_V3_STANDARD
  return null
}
