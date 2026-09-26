import type { Capability } from "@/lib/analysis"

export const DEMO_JOB_IDS = ["job_glass_monument", "job_night_orchard"] as const

export type DemoJobId = (typeof DEMO_JOB_IDS)[number]

export type DemoAsset = {
  label: string
  url: string
  kind: string
}

export type DemoWorkflowStep = {
  name: string
  capability: Capability
  purpose: string
  attempts: number
}

export type DemoSpec = {
  id: DemoJobId
  title: string
  source: "upwork"
  budgetCents: number
  channelFeeBps: number
  contingencyBps: number
  deadlineOffsetHours: number
  clientNotes: string
  rawBrief: string
  assets: DemoAsset[]
  workflow: DemoWorkflowStep[]
}

const GLASS_MARKERS = [
  /inexpensive concept stills/i,
  /controlled keyframes/i,
  /premium cinematic motion/i,
  /continuity repair/i,
] as const

const ORCHARD_MARKERS = [/controlled hero still/i, /orbiting camera/i] as const

export const GLASS_MONUMENT: DemoSpec = {
  id: "job_glass_monument",
  title: "After the Rain: Glass Monument",
  source: "upwork",
  budgetCents: 480_000,
  channelFeeBps: 1000,
  contingencyBps: 1500,
  deadlineOffsetHours: 72,
  clientNotes:
    "Pasted from an Upwork thread for Harbor Atelier. Nothing was sent back through Upwork.",
  rawBrief: `Upwork thread, pasted by the operator. Nothing was sent back through Upwork.

Client: Harbor Atelier
Package: After the Rain: Glass Monument
Turnaround: 72 hours from approval.

Deliverables:
- One 20-second cinematic film, 1920x1080, 16:9
- One 20-second cinematic film, 1080x1920, 9:16
- Three approved keyframe stills, 1920x1080, 16:9

Inputs already supplied:
- Approved monument silhouette reference
- Glass-material references
- Site direction for a quiet coastal jetty
- Weather arc from storm to clear
- Visual references the client likes
- Examples the client dislikes

Production route requested in the brief:
- inexpensive concept stills for weather and glass
- controlled keyframes of the monument
- premium cinematic motion for both frames
- one continuity repair if water, reflections, or the monument drift

Constraints:
- Monument architecture, material, scale, and site stay consistent across shots
- Water, reflections, and the transition after the storm stay believable
- No people
- No dialogue`,
  assets: [
    {
      label: "Approved monument silhouette",
      url: "https://files.example.com/harbor/monument-silhouette.png",
      kind: "reference",
    },
    {
      label: "Glass material reference",
      url: "https://files.example.com/harbor/glass-material.png",
      kind: "reference",
    },
    {
      label: "Site direction, quiet coastal jetty",
      url: "https://files.example.com/harbor/jetty-direction.png",
      kind: "reference",
    },
    {
      label: "Weather arc reference",
      url: "https://files.example.com/harbor/weather-arc.png",
      kind: "reference",
    },
    {
      label: "Liked visual reference",
      url: "https://files.example.com/harbor/liked-reference.png",
      kind: "reference",
    },
    {
      label: "Disliked visual reference",
      url: "https://files.example.com/harbor/disliked-reference.png",
      kind: "reference",
    },
  ],
  workflow: [
    {
      name: "Concept stills",
      capability: "image",
      purpose: "Explore inexpensive weather and glass concepts.",
      attempts: 4,
    },
    {
      name: "Controlled keyframes",
      capability: "image",
      purpose: "Lock the monument, glass, scale, and site in three keyframes.",
      attempts: 3,
    },
    {
      name: "Final motion",
      capability: "video",
      purpose: "Premium cinematic motion for the 16:9 film and the 9:16 frame.",
      attempts: 3,
    },
    {
      name: "Continuity repair",
      capability: "video",
      purpose: "Repair one continuity failure if needed.",
      attempts: 1,
    },
    {
      name: "Finish",
      capability: "finishing",
      purpose: "Export both frames and the approved keyframes.",
      attempts: 1,
    },
  ],
}

export const NIGHT_ORCHARD: DemoSpec = {
  id: "job_night_orchard",
  title: "Night Orchard: Slow Orbit",
  source: "upwork",
  budgetCents: 160_000,
  channelFeeBps: 1000,
  contingencyBps: 1500,
  deadlineOffsetHours: 96,
  clientNotes:
    "Pasted from an Upwork thread for Lumen Orchard. Nothing was sent back through Upwork.",
  rawBrief: `Upwork thread, pasted by the operator. Nothing was sent back through Upwork.

Client: Lumen Orchard
Package: Night Orchard: Slow Orbit
Turnaround: 96 hours from approval.

Deliverables:
- One 12-second atmospheric sequence, 1920x1080, 16:9
- One hero still, 1920x1080, 16:9

Inputs already supplied:
- Approved orchard-world keyframe
- Low-light palette reference
- Camera direction for a slow orbit
- Pacing reference
- Delivery format 1920x1080, 16:9

Production route requested in the brief:
- one controlled hero still locked to the approved orchard keyframe
- one orbiting camera move that preserves the world

Constraints:
- Preserve the world, depth, low-light detail, and spatial continuity throughout the orbit
- No people
- No dialogue
- No separate continuity repair is authorized`,
  assets: [
    {
      label: "Approved orchard-world keyframe",
      url: "https://files.example.com/lumen/orchard-keyframe.png",
      kind: "reference",
    },
    {
      label: "Low-light palette",
      url: "https://files.example.com/lumen/low-light-palette.png",
      kind: "reference",
    },
    {
      label: "Camera direction",
      url: "https://files.example.com/lumen/camera-direction.png",
      kind: "reference",
    },
    {
      label: "Pacing reference",
      url: "https://files.example.com/lumen/pacing-reference.png",
      kind: "reference",
    },
  ],
  workflow: [
    {
      name: "Hero still",
      capability: "image",
      purpose: "Lock the hero still to the approved orchard keyframe.",
      attempts: 1,
    },
    {
      name: "Orbit",
      capability: "video",
      purpose: "Premium orbiting camera move that preserves the world.",
      attempts: 2,
    },
    {
      name: "Finish",
      capability: "finishing",
      purpose: "Export the orbit and the hero still.",
      attempts: 1,
    },
  ],
}

export const DEMO_SPECS: DemoSpec[] = [GLASS_MONUMENT, NIGHT_ORCHARD]

export function isDemoJobId(id: string): id is DemoJobId {
  return (DEMO_JOB_IDS as readonly string[]).includes(id)
}

export function demoById(id: string): DemoSpec | null {
  return DEMO_SPECS.find((spec) => spec.id === id) ?? null
}

export function demoDeadline(spec: DemoSpec, now = new Date()): Date {
  return new Date(now.getTime() + spec.deadlineOffsetHours * 3_600_000)
}

export function explicitDemoWorkflow(brief: string): DemoWorkflowStep[] | null {
  if (GLASS_MARKERS.every((pattern) => pattern.test(brief))) return GLASS_MONUMENT.workflow
  if (ORCHARD_MARKERS.every((pattern) => pattern.test(brief)) && !/inexpensive concept stills/i.test(brief)) {
    return NIGHT_ORCHARD.workflow
  }
  return null
}
