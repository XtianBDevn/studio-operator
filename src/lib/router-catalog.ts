import type { Capability } from "@/lib/analysis"
import { isLiveSubmittable } from "@/lib/live-workflows"
import { PLANNING_RATES } from "@/lib/planning-rates"

export { wiredLiveEndpoint } from "@/lib/live-workflows"

export const ROUTE_ROLES = ["SEARCH", "CONTROL", "SHIP", "FINISH"] as const
export type RouteRole = (typeof ROUTE_ROLES)[number]

export const ROUTE_STAGES = ["explore", "choose", "control", "ship", "repair", "finish", "qa"] as const
export type RouteStage = (typeof ROUTE_STAGES)[number]

export const STAGE_LABELS: Record<RouteStage, string> = {
  explore: "Explore",
  choose: "Choose",
  control: "Control",
  ship: "Ship",
  repair: "Repair",
  finish: "Finish",
  qa: "QA",
}

export const PATTERN_LABEL = "Explore → Choose → Control → Ship → Repair → Finish → QA"

/**
 * Layer 2 — Routable model ids.
 *
 * Models the transparent router may propose. Request pages were read on 2026-09-25.
 * Image index: 13 families. Video index: 22 families.
 * Seedream, Flux, Veo, Topaz, Speak, lip sync, and caption tools were not on those indexes.
 * Substitutes are documented on the entry. `liveSubmit` is derived from layer 3
 * (SOUL V2 and Kling 3.0 Standard text-to-video only). It is not a separate price.
 */
export type CatalogEntry = {
  id: string
  label: string
  role: RouteRole
  capability: Capability
  docsUrl: string
  why: string
  constraint: string
  alternativeId: string
  substituteNote: string | null
  liveSubmit: boolean
}

const DOCS = "https://docs.higgsfield.ai/docs/models"

function entry(input: Omit<CatalogEntry, "liveSubmit">): CatalogEntry {
  return { ...input, liveSubmit: isLiveSubmittable(input.id) }
}

export const ROUTER_CATALOG: readonly CatalogEntry[] = [
  entry({
    id: "z-image/turbo",
    label: "Z-Image Turbo",
    role: "SEARCH",
    capability: "image",
    docsUrl: `${DOCS}/z-image-turbo/generate.md`,
    why: "Z-Image Turbo is a text-to-image model for inexpensive concept stills.",
    constraint:
      "Text-to-image only. The prompt must be non-empty and at most 800 characters. Resolution tiers are 1k and 2k. Enabling prompt_extend uses an enhanced pricing tier that this desk does not price.",
    alternativeId: "higgsfield-ai/soul/v2/standard",
    substituteNote: null,
  }),
  entry({
    id: "lightricks/ltx-2.5/text-to-video/fast",
    label: "LTX-2.5 Fast",
    role: "SEARCH",
    capability: "video",
    docsUrl: `${DOCS}/ltx-2-5/text-to-video-fast.md`,
    why: "LTX-2.5 Fast is the documented fast text-to-video lane for concept tests.",
    constraint:
      "Duration is required and defaults to 6 seconds. Fast supports 720p, 1080p, 2k, or 4k. generate_audio defaults to true. Seedance Fast was not a separate endpoint on the video index.",
    alternativeId: "wan/v2.6/text-to-video",
    substituteNote:
      "Seedance Fast was not a separate documented endpoint. LTX-2.5 Fast is the fast lane used instead.",
  }),
  entry({
    id: "wan/v2.6/text-to-video",
    label: "Wan 2.6",
    role: "SEARCH",
    capability: "video",
    docsUrl: `${DOCS}/wan-2-6/text-to-video.md`,
    why: "Wan 2.6 accepts a public audio_url, so it can follow a supplied voice reference.",
    constraint:
      "Setting multi_shots to true also enables prompt_extend. The page documents audio_url as a public audio reference, not a Speak voice model.",
    alternativeId: "pixverse/v6/text-to-video",
    substituteNote: "No Speak endpoint was found. Wan 2.6 is the documented lane when a voice reference URL exists.",
  }),
  entry({
    id: "pixverse/v6/text-to-video",
    label: "PixVerse V6",
    role: "SEARCH",
    capability: "video",
    docsUrl: `${DOCS}/pixverse-v6/text-to-video.md`,
    why: "PixVerse V6 is documented as text or image video with optional sound.",
    constraint:
      "Duration is a number from 1 to 15. generate_audio defaults to true. The video index describes optional sound. A negative prompt, if sent, must be 1–2,048 characters.",
    alternativeId: "lightricks/ltx-2.5/text-to-video/fast",
    substituteNote:
      "Speak was not in the catalog. MiniMax H3 text-to-video does not document generate_audio or audio_url, so talking scenes use PixVerse or Wan.",
  }),
  entry({
    id: "marketing-studio/image",
    label: "Marketing Studio Image",
    role: "CONTROL",
    capability: "image",
    docsUrl: `${DOCS}/marketing-studio-image/generate-and-edit.md`,
    why: "Marketing Studio Image generates and edits campaign images and can take product reference URLs.",
    constraint:
      "Omit image_urls for text-to-image, or send up to 16 URLs when enhance_prompt is false. enhance_prompt true needs a preset_id and 1–2 images, product first. References must be JPEG, PNG, or WebP.",
    alternativeId: "xai/grok-imagine-image-2.0",
    substituteNote:
      "Seedream and Flux are not on the image index. Marketing Studio Image is the documented product and reference substitute.",
  }),
  entry({
    id: "xai/grok-imagine-image-2.0",
    label: "Grok Image 2.0",
    role: "CONTROL",
    capability: "image",
    docsUrl: `${DOCS}/grok-image-2/generate-and-edit.md`,
    why: "Grok Image 2.0 accepts up to ten reference images for generation or editing.",
    constraint:
      "Quality is low or medium only. Resolution is 1k or 2k. The request produces one image. References may be resized before submission.",
    alternativeId: "marketing-studio/image",
    substituteNote:
      "Seedream and Flux are not on the image index. Grok Image 2.0 is the documented multi-reference substitute.",
  }),
  entry({
    id: "alibaba/qwen-image-3/edit",
    label: "Qwen Image 3 Edit",
    role: "CONTROL",
    capability: "image",
    docsUrl: `${DOCS}/qwen-image-3/edit.md`,
    why: "Qwen Image 3 edit is the documented way to change packaging, labels, or text on reference stills.",
    constraint:
      "The edit endpoint requires 1–3 ordered reference image URLs. It cannot run from text alone. The 2k square tier maps to 1536 by 1536.",
    alternativeId: "ideogram/v4.0",
    substituteNote: null,
  }),
  entry({
    id: "alibaba/qwen-image-3/text-to-image",
    label: "Qwen Image 3",
    role: "CONTROL",
    capability: "image",
    docsUrl: `${DOCS}/qwen-image-3/text-to-image.md`,
    why: "Qwen Image 3 text-to-image is the documented still model when no reference file exists yet.",
    constraint:
      "This endpoint accepts no reference images. The 2k square tier maps to 1536 by 1536, not 2048 by 2048. Prompt length guidance is advisory.",
    alternativeId: "alibaba/qwen-image-3/edit",
    substituteNote: null,
  }),
  entry({
    id: "ideogram/v4.0",
    label: "Ideogram 4.0",
    role: "CONTROL",
    capability: "image",
    docsUrl: `${DOCS}/ideogram-4/generate.md`,
    why: "Ideogram 4.0 is the documented model for posters, headlines, and designed type.",
    constraint:
      "The prompt must be 2–2,048 characters. Square 1:1 is the default, including when an input image is supplied. rendering_speed is TURBO, DEFAULT, or QUALITY.",
    alternativeId: "recraft/v4.1/text-to-image",
    substituteNote: null,
  }),
  entry({
    id: "recraft/v4.1/text-to-image",
    label: "Recraft V4.1",
    role: "CONTROL",
    capability: "image",
    docsUrl: `${DOCS}/recraft-v4-1/text-to-image.md`,
    why: "Recraft V4.1 is the documented 1k design model for promotional layouts and color-controlled graphics.",
    constraint:
      "This variant accepts only resolution 1k. No reference-image input is declared. The prompt must be 1–10,000 characters.",
    alternativeId: "ideogram/v4.0",
    substituteNote: null,
  }),
  entry({
    id: "kling-video/v3.0/std/image-to-video",
    label: "Kling 3.0 Standard image-to-video",
    role: "CONTROL",
    capability: "video",
    docsUrl: `${DOCS}/kling-3/standard-image-to-video.md`,
    why: "Kling 3.0 Standard image-to-video starts from a still and can lock the last frame.",
    constraint:
      "image_url is required as the first frame. The prompt must be non-empty and is truncated past 2,500 characters. Custom shots are 1–15 seconds each.",
    alternativeId: "kling-video/v3.0/std/text-to-video",
    substituteNote: null,
  }),
  entry({
    id: "bytedance/seedance-2.5/video-edit",
    label: "Seedance 2.5 video edit",
    role: "CONTROL",
    capability: "video",
    docsUrl: `${DOCS}/seedance-2-5/video-edit.md`,
    why: "Seedance 2.5 video edit is the documented repair for a source clip.",
    constraint:
      "Do not send duration. Output framing follows the source video, which is normalized to at least 4 seconds. asset:// URLs are rejected. The source counts toward the 10-video limit.",
    alternativeId: "kling-video/v3.0/std/image-to-video",
    substituteNote: null,
  }),
  entry({
    id: "higgsfield-ai/soul/v2/standard",
    label: "Higgsfield SOUL V2",
    role: "SHIP",
    capability: "image",
    docsUrl: `${DOCS}/soul-2/generate.md`,
    why: "SOUL V2 is the documented portraits, fashion, and editorial image model.",
    constraint:
      "The generate page documents batch size 1 or 4 and resolutions 720p or 1080p. An explicit null seed is invalid. This desk's live request does not send custom_reference.",
    alternativeId: "higgsfield-ai/soul/cinema",
    substituteNote: null,
  }),
  entry({
    id: "higgsfield-ai/soul/cinema",
    label: "SOUL Cinema",
    role: "SHIP",
    capability: "image",
    docsUrl: `${DOCS}/soul-cinema/generate.md`,
    why: "SOUL Cinema is the documented cinema-style still model when the frame should look filmed.",
    constraint:
      "Batch size is 1 or 4. A custom_reference_id must already be trained on the calling account. Client style_id is ignored because cinema uses a fixed style.",
    alternativeId: "higgsfield-ai/soul/v2/standard",
    substituteNote: null,
  }),
  entry({
    id: "recraft/v4.1/pro/text-to-image",
    label: "Recraft V4.1 Pro",
    role: "SHIP",
    capability: "image",
    docsUrl: `${DOCS}/recraft-v4-1-pro/generate.md`,
    why: "Recraft V4.1 Pro is the documented 2k design model for a finished promotional still.",
    constraint: "This variant accepts only resolution 2k. No reference-image input is declared.",
    alternativeId: "ideogram/v4.0",
    substituteNote: null,
  }),
  entry({
    id: "kling-video/v3.0/pro/text-to-video",
    label: "Kling 3.0 Pro",
    role: "SHIP",
    capability: "video",
    docsUrl: `${DOCS}/kling-3/pro-text-to-video.md`,
    why: "Kling 3.0 Pro is the documented premium Kling text-to-video lane for final motion.",
    constraint:
      "The prompt is truncated past 2,500 characters. Custom shots are 1–15 seconds each and their durations are summed for billing. Native audio is sound on or off, default on.",
    alternativeId: "bytedance/seedance-2.5/text-to-video",
    substituteNote: "Veo is not on the video index. Kling 3.0 Pro is the premium motion substitute.",
  }),
  entry({
    id: "kling-video/v3.0/std/text-to-video",
    label: "Kling 3.0 Standard",
    role: "SHIP",
    capability: "video",
    docsUrl: `${DOCS}/kling-3/standard-text-to-video.md`,
    why: "Kling 3.0 Standard is the premium-capable video model this desk can submit live.",
    constraint:
      "Duration is an integer from 3 to 15. The prompt is truncated past 2,500 characters. Sound defaults to on. A longer film is multiple requests.",
    alternativeId: "kling-video/v3.0/pro/text-to-video",
    substituteNote: "Veo is not on the video index. This standard Kling workflow is the live-wired substitute.",
  }),
  entry({
    id: "higgsfield/cinema-studio/4.0",
    label: "Cinema Studio 4.0",
    role: "SHIP",
    capability: "video",
    docsUrl: `${DOCS}/cinema-studio-4/generate.md`,
    why: "Cinema Studio 4.0 is the documented cinematic camera lane with image, video, and audio references.",
    constraint:
      "References are limited to 30 images, 10 videos, and 10 audio files, at most 50 items. This endpoint produces a new video. Editing uses other endpoints.",
    alternativeId: "kling-video/v3.0/pro/text-to-video",
    substituteNote: "Veo is not on the video index. Cinema Studio 4.0 is a documented cinematic substitute.",
  }),
  entry({
    id: "bytedance/seedance-2.5/text-to-video",
    label: "Seedance 2.5",
    role: "SHIP",
    capability: "video",
    docsUrl: `${DOCS}/seedance-2-5/text-to-video.md`,
    why: "Seedance 2.5 text-to-video is a documented final-motion lane with generated audio.",
    constraint:
      "This endpoint does not take media inputs. asset:// URLs are rejected. generate_audio defaults to true. Image or reference motion uses the other Seedance 2.5 endpoints.",
    alternativeId: "kling-video/v3.0/pro/text-to-video",
    substituteNote: "Veo is not on the video index. Seedance 2.5 is a documented premium substitute.",
  }),
  entry({
    id: "minimax/h3/text-to-video",
    label: "MiniMax H3",
    role: "SHIP",
    capability: "video",
    docsUrl: `${DOCS}/minimax-h3/text-to-video.md`,
    why: "MiniMax H3 is the documented text, frame, and multimodal video model in that family.",
    constraint:
      'Resolution is fixed to the case-sensitive value "2K". The provider serializer uses the first 7,000 characters of the prompt. This text-to-video page does not document generate_audio or audio_url.',
    alternativeId: "bytedance/seedance-2.5/text-to-video",
    substituteNote:
      "MiniMax is in the catalog, but this page does not document native audio. Talking scenes use PixVerse or Wan instead of MiniMax.",
  }),
  entry({
    id: "local/voice",
    label: "Desk voice line",
    role: "FINISH",
    capability: "voice",
    docsUrl: "https://docs.higgsfield.ai/docs/models/video-generation.md",
    why: "A separate voice line stays on the desk because no Speak endpoint was found.",
    constraint:
      "The image and video indexes checked on 2026-09-25 do not list Speak, lip sync, or a voice-line endpoint. This step is planning-only. Live mode refuses it before any network call.",
    alternativeId: "pixverse/v6/text-to-video",
    substituteNote: "Speak is not in the catalog. PixVerse V6 can generate a video with sound, which is a different deliverable.",
  }),
  entry({
    id: "local/edit",
    label: "Desk assembly",
    role: "FINISH",
    capability: "editing",
    docsUrl: "https://docs.higgsfield.ai/docs/models/seedance-2-5/video-edit.md",
    why: "Assembly is planned locally. One continuity repair can be swapped to Seedance 2.5 video edit.",
    constraint:
      "No verified assembly endpoint is wired. Selecting Seedance 2.5 video edit changes this line to the video planning rate and needs a source video. Neither id is live-submittable.",
    alternativeId: "bytedance/seedance-2.5/video-edit",
    substituteNote: null,
  }),
  entry({
    id: "local/finish",
    label: "Desk finish",
    role: "FINISH",
    capability: "finishing",
    docsUrl: "https://docs.higgsfield.ai/docs/models/image-generation.md",
    why: "Finish covers grade, captions, and export inside the desk.",
    constraint:
      "Topaz, a ByteDance upscale endpoint, lip sync, and caption tools were not on the indexes checked. This pass is planning-only, not an upscale job. Live mode refuses it before any network call.",
    alternativeId: "alibaba/qwen-image-3/edit",
    substituteNote:
      "No documented upscaler was found. Qwen Image 3 edit is the still-repair substitute. It is not Topaz and it is not an upscale.",
  }),
]

const BY_ID = new Map(ROUTER_CATALOG.map((item) => [item.id, item]))

export function catalogById(id: string): CatalogEntry | undefined {
  return BY_ID.get(id)
}

export function catalogByRole(role: RouteRole): CatalogEntry[] {
  return ROUTER_CATALOG.filter((item) => item.role === role)
}

export function requireCatalog(id: string): CatalogEntry {
  const found = BY_ID.get(id)
  if (!found) {
    throw new Error(`Model ${id} is not in the capability catalog.`)
  }
  return found
}

export function defaultStage(entry: CatalogEntry): RouteStage {
  if (entry.id === "local/edit" || entry.id === "bytedance/seedance-2.5/video-edit") return "repair"
  if (entry.id === "local/voice" || entry.id === "local/finish") return "finish"
  if (entry.role === "SEARCH") return "explore"
  if (entry.role === "CONTROL") return "control"
  if (entry.role === "SHIP") return "ship"
  return "finish"
}

export function unitCostCents(capability: Capability): number {
  return PLANNING_RATES[capability].unitCostCents
}

