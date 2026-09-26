import { StudioError } from "@/lib/errors"

/**
 * Layer 3 — Live-submittable workflows.
 *
 * Only these two Higgsfield workflows may be submitted when STUDIO_OPERATOR_MODE=live.
 * Every other routable model stays planning or mock until a dated live evidence note
 * says otherwise. Do not add an endpoint here without that evidence.
 *
 * Image: SOUL V2 still — POST /higgsfield-ai/soul/v2/standard
 * Video: Kling 3.0 Standard text-to-video — POST /kling-video/v3.0/std/text-to-video
 */
export const LIVE_SUBMITTABLE_WORKFLOWS = {
  soul: {
    id: "soul",
    modelId: "higgsfield-ai/soul/v2/standard",
    label: "Higgsfield SOUL V2",
    kind: "image",
    docsUrl: "https://docs.higgsfield.ai/docs/models/soul-2/generate.md",
  },
  kling: {
    id: "kling",
    modelId: "kling-video/v3.0/std/text-to-video",
    label: "Kling 3.0 Standard",
    kind: "video",
    docsUrl: "https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md",
  },
} as const

export type LiveWorkflowId = keyof typeof LIVE_SUBMITTABLE_WORKFLOWS

const BY_MODEL_ID = new Map<string, LiveWorkflowId>(
  Object.values(LIVE_SUBMITTABLE_WORKFLOWS).map((workflow) => [workflow.modelId, workflow.id]),
)

export function liveWorkflowForModel(modelId: string): LiveWorkflowId | null {
  return BY_MODEL_ID.get(modelId) ?? null
}

/** Same two ids as layer 3. Kept for callers that already branch on "soul" | "kling". */
export function wiredLiveEndpoint(modelId: string): LiveWorkflowId | null {
  return liveWorkflowForModel(modelId)
}

export function isLiveSubmittable(modelId: string): boolean {
  return liveWorkflowForModel(modelId) != null
}

export function liveNonSubmittableMessage(modelId: string): string {
  const soul = LIVE_SUBMITTABLE_WORKFLOWS.soul
  const kling = LIVE_SUBMITTABLE_WORKFLOWS.kling
  return `No request was sent. ${modelId} is not a live-submittable workflow. Live submit is only ${soul.label} (${soul.modelId}) and ${kling.label} text-to-video (${kling.modelId}). This id can stay on a planning route. Switch to mock mode for a local preview, or choose one of those two workflows. No provider call was made.`
}

/**
 * Refuse a live submit that is not layer 3.
 * Call this before constructing a provider client or touching the network.
 */
export function assertLiveSubmittable(modelId: string): LiveWorkflowId {
  const workflow = liveWorkflowForModel(modelId)
  if (!workflow) throw new StudioError(liveNonSubmittableMessage(modelId))
  return workflow
}

/** Operator-facing layer. Planning-only models are not live-wired. */
export function modelLayerLabel(modelId: string): "Live submit" | "Planning only" {
  return isLiveSubmittable(modelId) ? "Live submit" : "Planning only"
}

export const CATALOG_OPERATOR_NOTE =
  "Routable models are proposals, including documented substitutes. Live submit is only SOUL V2 and Kling 3.0 Standard text-to-video. Any other model is planning-only and fails in live mode before a provider call."
