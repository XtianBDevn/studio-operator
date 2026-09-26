import type { Capability } from "@/lib/analysis"
import { PLANNING_RATES } from "@/lib/planning-rates"

export type TemplateRecipeStep = {
  name: string
  capability: Capability
  modelId: string
  role: "SEARCH" | "CONTROL" | "SHIP" | "FINISH"
  attempts: number
  note: string
}

export type ServiceTemplate = {
  id: "launch_video" | "ugc_ad_pack" | "localization_pack"
  name: string
  summary: string
  deliverables: string[]
  timeline: string
  includedRevisionRounds: number
  exclusions: string[]
  requiredInputs: string[]
  acceptedFileTypes: string[]
  recipe: TemplateRecipeStep[]
  qualityChecklist: string[]
  deliveryPackage: string[]
  targetMarginBps: number
  maxProductionSpendCents: number
  packagePriceCents: number
  escalation: string[]
}

const FILES = ["png", "jpg", "webp", "mp4", "wav", "pdf"]

const SHARED_ESCALATION = [
  "Likeness or voice of a real person.",
  "Unclear asset ownership.",
  "Factual advertising claims.",
  "Exact packaging or regulated copy.",
  "Negative expected margin.",
  "Missed deadline risk.",
  "A client dispute.",
]

function lineCents(capability: Capability, attempts: number): number {
  return PLANNING_RATES[capability].unitCostCents * attempts
}

export const LAUNCH_VIDEO: ServiceTemplate = {
  id: "launch_video",
  name: "Launch Video",
  summary: "One 15-second video, two aspect ratios, three stills, two revision rounds, 72-hour delivery.",
  deliverables: [
    "One 15-second film in 16:9",
    "The same film framed in 9:16",
    "Three approved stills",
  ],
  timeline: "72 hours from approval of the brief and the production maximum.",
  includedRevisionRounds: 2,
  exclusions: [
    "A new concept after the route is approved.",
    "Extra durations, extra languages, or a media buy.",
    "Marketplace delivery. Files are prepared on this desk for a person to send.",
  ],
  requiredInputs: [
    "Approved product or monument reference",
    "Brand guide or a written palette and tone",
    "Exact on-screen copy, if any line must be spelled a certain way",
    "Examples the client likes and examples the client dislikes",
  ],
  acceptedFileTypes: FILES,
  recipe: [
    {
      name: "Concept stills",
      capability: "image",
      modelId: "z-image/turbo",
      role: "SEARCH",
      attempts: 2,
      note: "Inexpensive concept search at the image planning rate.",
    },
    {
      name: "Controlled stills",
      capability: "image",
      modelId: "marketing-studio/image",
      role: "CONTROL",
      attempts: 3,
      note: "Marketing Studio holds product references. Seedream and Flux are not in the catalog.",
    },
    {
      name: "Final motion",
      capability: "video",
      modelId: "kling-video/v3.0/pro/text-to-video",
      role: "SHIP",
      attempts: 3,
      note: "Kling 3.0 Pro is the premium motion pick. Kling 3.0 Standard is the live-wired alternative.",
    },
    {
      name: "Continuity repair",
      capability: "video",
      modelId: "bytedance/seedance-2.5/video-edit",
      role: "CONTROL",
      attempts: 1,
      note: "One targeted repair if geometry, water, or a reflection fails.",
    },
    {
      name: "Finish",
      capability: "finishing",
      modelId: "local/finish",
      role: "FINISH",
      attempts: 1,
      note: "Captions and export stay on the desk. No caption tool was on the indexes.",
    },
  ],
  qualityChecklist: [
    "Deliverable type, duration, aspect ratio, and resolution match the package.",
    "Product, material, and site stay consistent.",
    "Exact text is checked by a person when the brief requires it.",
    "Required scenes are present and prohibited elements are absent.",
    "Motion and reflections stay believable.",
  ],
  deliveryPackage: [
    "16:9 master",
    "9:16 master",
    "Three stills",
    "Usage note: the package covers the agreed film and stills. It does not grant a new likeness or a new media buy.",
  ],
  targetMarginBps: 2500,
  maxProductionSpendCents: lineCents("image", 5) + lineCents("video", 4) + lineCents("finishing", 1),
  packagePriceCents: 240_000,
  escalation: [
    ...SHARED_ESCALATION,
    "A third revision round or a new duration.",
    "Any repair above the automatic per-repair spend.",
  ],
}

export const UGC_AD_PACK: ServiceTemplate = {
  id: "ugc_ad_pack",
  name: "UGC Ad Pack",
  summary: "Three hooks, one body, three final variations, captions, and one revision round.",
  deliverables: [
    "Three hook openings",
    "One body",
    "Three final variations",
    "Captions for each variation",
  ],
  timeline: "Five days from approval of the brief and the production maximum.",
  includedRevisionRounds: 1,
  exclusions: [
    "A real person's likeness or voice without a fresh consent for this exact use.",
    "Licensed music.",
    "Extra variations beyond the three included finals.",
  ],
  requiredInputs: [
    "Product image",
    "Brand guide",
    "Exact spoken and on-screen copy",
    "Pronunciation for the product name",
    "Examples the client likes and examples the client dislikes",
    "Voice or likeness consent when a real person appears or speaks",
  ],
  acceptedFileTypes: FILES,
  recipe: [
    {
      name: "Hook stills",
      capability: "image",
      modelId: "higgsfield-ai/soul/v2/standard",
      role: "SHIP",
      attempts: 3,
      note: "SOUL V2 explores people and editorial hooks. A real likeness always pauses.",
    },
    {
      name: "Body",
      capability: "video",
      modelId: "pixverse/v6/text-to-video",
      role: "SEARCH",
      attempts: 1,
      note: "PixVerse V6 is the documented talking-video substitute. Speak and lip sync were not on the indexes.",
    },
    {
      name: "Variations",
      capability: "video",
      modelId: "kling-video/v3.0/std/text-to-video",
      role: "SHIP",
      attempts: 3,
      note: "Kling 3.0 Standard is the live-wired video model for the final variations.",
    },
    {
      name: "Captions",
      capability: "finishing",
      modelId: "local/finish",
      role: "FINISH",
      attempts: 1,
      note: "Caption tools were not on the indexes. Captions are a desk finish pass.",
    },
  ],
  qualityChecklist: [
    "Three hooks, one body, and three finals are all present.",
    "Product and brand stay consistent.",
    "Spoken copy and captions match the approved line.",
    "No unapproved likeness, voice, or licensed music.",
  ],
  deliveryPackage: [
    "Three final variations",
    "Caption file for each variation",
    "Usage note limited to the agreed ad pack.",
  ],
  targetMarginBps: 2500,
  maxProductionSpendCents: lineCents("image", 3) + lineCents("video", 4) + lineCents("finishing", 1),
  packagePriceCents: 180_000,
  escalation: [
    ...SHARED_ESCALATION,
    "Any real person's likeness or voice.",
    "A second revision round.",
  ],
}

export const LOCALIZATION_PACK: ServiceTemplate = {
  id: "localization_pack",
  name: "Localization Pack",
  summary: "One approved source ad adapted into five languages with translated graphics, voice, captions, and lip sync.",
  deliverables: [
    "Five language masters from one approved source ad",
    "Translated graphics",
    "A voice line per language",
    "Captions per language",
  ],
  timeline: "Seven days from the approved source ad and the production maximum.",
  includedRevisionRounds: 1,
  exclusions: [
    "A new creative concept.",
    "Languages beyond the five named in the order.",
    "A marketplace upload.",
  ],
  requiredInputs: [
    "The approved source ad",
    "The five languages",
    "Translated copy, or a request for the studio to draft it for approval",
    "Pronunciation notes",
    "Voice consent for each speaker and each language",
  ],
  acceptedFileTypes: FILES,
  recipe: [
    {
      name: "Translated graphics",
      capability: "image",
      modelId: "alibaba/qwen-image-3/edit",
      role: "CONTROL",
      attempts: 5,
      note: "Qwen Image 3 edit needs the source still. Exact translated text still needs a person.",
    },
    {
      name: "Voice lines",
      capability: "voice",
      modelId: "local/voice",
      role: "FINISH",
      attempts: 5,
      note: "Speak was not in the catalog. Voice lines stay on the desk.",
    },
    {
      name: "Language masters",
      capability: "video",
      modelId: "pixverse/v6/text-to-video",
      role: "SEARCH",
      attempts: 5,
      note: "Lip sync was not on the indexes. PixVerse V6 is the documented video-with-sound substitute, and a person approves it.",
    },
    {
      name: "Captions",
      capability: "finishing",
      modelId: "local/finish",
      role: "FINISH",
      attempts: 1,
      note: "Caption tools were not on the indexes.",
    },
  ],
  qualityChecklist: [
    "Each language matches the approved source picture and the approved translation.",
    "Graphics, voice, and captions agree.",
    "No voice is reused for a different person or a different use.",
    "Lip sync is flagged for a person because no lip-sync endpoint is in the catalog.",
  ],
  deliveryPackage: [
    "Five language masters",
    "Translated stills",
    "Caption files",
    "Usage note: one source ad, five named languages, no new campaign.",
  ],
  targetMarginBps: 2500,
  maxProductionSpendCents: lineCents("image", 5) + lineCents("voice", 5) + lineCents("video", 5) + lineCents("finishing", 1),
  packagePriceCents: 400_000,
  escalation: [
    ...SHARED_ESCALATION,
    "Lip sync, because no lip-sync endpoint is in the catalog.",
    "A voice or likeness that was approved for a different person or a different use.",
  ],
}

export const SERVICE_TEMPLATES = [LAUNCH_VIDEO, UGC_AD_PACK, LOCALIZATION_PACK] as const

export function templateById(id: string): ServiceTemplate | null {
  return SERVICE_TEMPLATES.find((template) => template.id === id) ?? null
}

export function templateSpendCents(template: ServiceTemplate): number {
  return template.recipe.reduce((sum, step) => sum + lineCents(step.capability, step.attempts), 0)
}
