/**
 * Demo fixtures for every pipeline column and job tab.
 * Intake text is pasted-source copy only. Nothing here contacts a marketplace.
 */
import { PrismaClient } from "@prisma/client"

import { mockOutputUrl } from "../src/server/services/providers"
import { MODEL_CATALOG } from "../src/server/services/models"

const prisma = new PrismaClient()

const image = MODEL_CATALOG.image
const video = MODEL_CATALOG.video
const voice = MODEL_CATALOG.voice
const editing = MODEL_CATALOG.editing
const finishing = MODEL_CATALOG.finishing

function at(iso: string) {
  return new Date(iso)
}

function json(values: string[]) {
  return JSON.stringify(values)
}

function step(input: {
  position: number
  name: string
  model: typeof image
  purpose: string
  inputs: string[]
  outputs: string[]
  attempts: number
  approvalStatus: string
  status: string
}) {
  return {
    position: input.position,
    name: input.name,
    selectedModel: input.model.id,
    modelKind: input.model.kind,
    purpose: input.purpose,
    inputs: json(input.inputs),
    expectedOutputs: json(input.outputs),
    estimatedAttempts: input.attempts,
    unitCostCents: input.model.unitCostCents,
    estimatedTotalCents: input.model.unitCostCents * input.attempts,
    approvalStatus: input.approvalStatus,
    status: input.status,
  }
}

async function main() {
  const existing = await prisma.job.count()
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} job(s) already stored.`)
    return
  }

  const northline = await prisma.job.create({
    data: {
      id: "job_northline",
      title: "Meridian — Northline concept film",
      source: "email",
      budgetCents: 220_000,
      deadline: at("2026-10-18T12:00:00.000Z"),
      status: "qa",
      channelFeeBps: 0,
      contingencyBps: 1500,
      maxBudgetCents: 71_070,
      clientNotes:
        "Producer asked for a quiet film, not a product demo. Hold the wordmark until the last four seconds.",
      createdAt: at("2026-09-12T15:10:00.000Z"),
      rawBrief: `From: Amira Shah <amira@meridian-objects.example>
Subject: Northline — 45s concept film

We need a cinematic concept film for Meridian, a small-batch field watch. Not a launch ad. More like a short film that happens to end on the object.

Deliverables:
- One 45-second film, 1920x1080, 16:9
- One 15-second 1080x1920 cutdown
- Four hero stills at 3:2
- Original voiceover, one line only

Exact on-screen text:
"Northline"
"Built for the hour before weather."

Brand constraints:
- Palette: oxidized brass #8A6A3B, night navy #141820, fog #D5D8DC
- No diamond sparkle, no luxury clichés
- Wordmark only at the end
- Sound: original score, no library tracks

References:
- Location mood: empty concrete platform at dawn
- Product: round steel case, cream dial, no logo on the dial

Rights: fictional talent only. No real public figures. No third-party marks. We own the product design.

Budget is $2,200. Deadline 18 Oct 2026. Please confirm scope before production.`,
      assets: {
        create: [
          {
            label: "Dawn platform reference",
            url: "https://files.example.com/meridian/dawn-platform.jpg",
            kind: "image",
          },
          {
            label: "Case study still",
            url: "https://files.example.com/meridian/case-study.jpg",
            kind: "image",
          },
        ],
      },
      analysis: {
        create: {
          deliverables: json([
            "45-second concept film, 1920x1080",
            "15-second 1080x1920 cutdown",
            "Four hero stills",
            "One original voice line",
          ]),
          dimensions: json(["1920x1080", "1080x1920", "16:9", "3:2"]),
          durations: json(["45-second", "15-second"]),
          referenceNotes: json([
            "Dawn platform reference",
            "Empty concrete platform at dawn",
            "Round steel case, cream dial",
          ]),
          exactText: json(["Northline", "Built for the hour before weather."]),
          brandConstraints: json([
            "Oxidized brass #8A6A3B, night navy #141820, fog #D5D8DC",
            "No diamond sparkle or luxury clichés",
            "Wordmark only at the end",
            "Original score, no library tracks",
          ]),
          rightsConcerns: json([]),
          missingInformation: json([]),
          confidence: 0.9,
          decision: "accept",
          rationale:
            "The pasted email names duration, frames, exact lines, palette, and ownership. It is specific enough to plan. This recommendation does not message the client or submit a proposal.",
          modelLabel: "GPT-6 Astra (gpt-6-astra)",
          createdAt: at("2026-09-12T15:24:00.000Z"),
        },
      },
      steps: {
        create: [
          step({
            position: 1,
            name: "Key stills",
            model: image,
            purpose: "Platform, case, dial macro, and the end-frame wordmark.",
            inputs: ["Pasted email", "Dawn platform reference", "Case study still"],
            outputs: ["Four hero stills", "Contact sheet"],
            attempts: 6,
            approvalStatus: "approved",
            status: "complete",
          }),
          step({
            position: 2,
            name: "Motion coverage",
            model: video,
            purpose: "45-second master coverage plus safety takes. No extra concept.",
            inputs: ["Approved stills", "45-second target"],
            outputs: ["Picture selects"],
            attempts: 10,
            approvalStatus: "approved",
            status: "complete",
          }),
          step({
            position: 3,
            name: "Voice line",
            model: voice,
            purpose: "One original line. No impersonation and no licensed song.",
            inputs: ["Exact line: Built for the hour before weather."],
            outputs: ["Approved read", "Alternate read"],
            attempts: 2,
            approvalStatus: "approved",
            status: "complete",
          }),
          step({
            position: 4,
            name: "Assembly",
            model: editing,
            purpose: "Cut the 45-second master and the 15-second vertical.",
            inputs: ["Selects", "Exact on-screen text"],
            outputs: ["45s master", "15s cutdown"],
            attempts: 2,
            approvalStatus: "approved",
            status: "complete",
          }),
          step({
            position: 5,
            name: "Finish",
            model: finishing,
            purpose: "Grade, place the wordmark, export both frames.",
            inputs: ["Picture lock", "Brand palette"],
            outputs: ["Finished master", "QA stills"],
            attempts: 2,
            approvalStatus: "approved",
            status: "complete",
          }),
        ],
      },
      approvals: {
        create: [
          {
            kind: "workflow_budget",
            status: "approved",
            summary: "Workflow and maximum budget approved",
            detail: "Maximum production budget set to 710.70 USD.",
            createdAt: at("2026-09-12T16:00:00.000Z"),
            resolvedAt: at("2026-09-12T16:20:00.000Z"),
          },
          {
            kind: "final_delivery",
            status: "required",
            summary: "Final delivery needs a person",
            detail:
              "Approving delivery records the job as delivered in Studio Operator. It does not upload files to a marketplace.",
            createdAt: at("2026-09-18T18:00:00.000Z"),
          },
        ],
      },
      revisions: {
        create: [
          {
            clientNote: "Hold the wordmark two seconds longer and cool the dawn grade.",
            affectedDeliverable: "45-second concept film, 1920x1080",
            recommendedAction: "Run one additional finishing pass on the 45-second master.",
            expectedIncrementalCents: finishing.unitCostCents,
            approvalStatus: "pending",
            createdAt: at("2026-09-20T11:05:00.000Z"),
          },
        ],
      },
    },
    include: { steps: true },
  })

  const northSteps = Object.fromEntries(northline.steps.map((item) => [item.name, item]))
  await prisma.generation.createMany({
    data: ["Key stills", "Motion coverage", "Voice line", "Assembly", "Finish"].map((name, index) => {
      const item = northSteps[name]
      if (!item) throw new Error(`Missing step ${name}`)
      return {
        jobId: northline.id,
        stepId: item.id,
        providerRequestId: `mock_hf_northline_${index + 1}`,
        model: item.selectedModel,
        status: "succeeded",
        costEstimateCents: item.estimatedTotalCents,
        actualCostCents: item.estimatedTotalCents,
        outputUrl: mockOutputUrl({
          title: "Northline",
          subtitle: name,
          kind: item.modelKind,
        }),
        completedAt: at(`2026-09-18T1${index}:00:00.000Z`),
        createdAt: at(`2026-09-17T1${index}:00:00.000Z`),
      }
    }),
  })

  await prisma.job.create({
    data: {
      id: "job_hearth",
      title: "Hearth & Rye — weekend loaf loop",
      source: "fiverr",
      budgetCents: 35_000,
      deadline: at("2026-09-28T12:00:00.000Z"),
      status: "needs_review",
      channelFeeBps: 2000,
      contingencyBps: 1500,
      clientNotes: "Client said they will send the logo if they can find the file.",
      createdAt: at("2026-09-24T09:40:00.000Z"),
      rawBrief: `Need a 6-second loop of bread coming out of the oven for Hearth & Rye.
Square, for Instagram. Warm, handheld, no people.
Budget is $350. Need it this weekend.
End card should have the bakery name. I'll send the logo later if I find it.`,
      analysis: {
        create: {
          deliverables: json(["6-second oven loop", "Square end card"]),
          dimensions: json(["1:1"]),
          durations: json(["6-second"]),
          referenceNotes: json([]),
          exactText: json([]),
          brandConstraints: json(["Warm, handheld, no people"]),
          rightsConcerns: json([]),
          missingInformation: json([
            "Exact on-screen text is not quoted",
            "Logo file has not been sent",
            "Pixel dimensions are not stated",
          ]),
          confidence: 0.46,
          decision: "review",
          rationale:
            "A person should review this before production. The price is thin for motion, the end card has no quoted line, and the logo is still missing. This recommendation does not message the client or submit a proposal.",
          modelLabel: "GPT-6 Astra (gpt-6-astra)",
          createdAt: at("2026-09-24T09:48:00.000Z"),
        },
      },
      steps: {
        create: [
          step({
            position: 1,
            name: "Key stills",
            model: image,
            purpose: "Oven light and loaf stills to lock the grade before motion.",
            inputs: ["Pasted brief"],
            outputs: ["Two stills"],
            attempts: 2,
            approvalStatus: "pending",
            status: "planned",
          }),
          step({
            position: 2,
            name: "Motion coverage",
            model: video,
            purpose: "One 6-second loop with a safety take.",
            inputs: ["Stills", "6-second target"],
            outputs: ["Loop selects"],
            attempts: 2,
            approvalStatus: "pending",
            status: "planned",
          }),
          step({
            position: 3,
            name: "Assembly",
            model: editing,
            purpose: "Cut the loop and leave room for the end card.",
            inputs: ["Selects"],
            outputs: ["6s assembly"],
            attempts: 1,
            approvalStatus: "pending",
            status: "planned",
          }),
          step({
            position: 4,
            name: "Finish",
            model: finishing,
            purpose: "Grade and hold a space for the missing logo.",
            inputs: ["Assembly"],
            outputs: ["Square export"],
            attempts: 1,
            approvalStatus: "pending",
            status: "planned",
          }),
        ],
      },
      approvals: {
        create: [
          {
            kind: "workflow_budget",
            status: "required",
            summary: "Approve the plan and a maximum production budget",
            detail: "Estimated generation is 151.00 USD before contingency. Generation cannot start until this gate is approved.",
            createdAt: at("2026-09-24T09:55:00.000Z"),
          },
        ],
      },
    },
  })

  const hollow = await prisma.job.create({
    data: {
      id: "job_hollow",
      title: "Hollow Current — title sequence",
      source: "contra",
      budgetCents: 120_000,
      deadline: at("2026-10-06T12:00:00.000Z"),
      status: "approved",
      channelFeeBps: 0,
      contingencyBps: 1500,
      maxBudgetCents: 29_555,
      clientNotes: "Director wants abstract water and a lantern. No characters.",
      createdAt: at("2026-09-18T13:00:00.000Z"),
      rawBrief: `Hollow Current — indie game title sequence, 12 seconds, 1920x1080.
Abstract water, a lantern, no characters, no dialogue.
On-screen text: "Hollow Current" only.
Original audio. We will send a greyscale logo.
Budget $1,200. First pass in 10 days.`,
      analysis: {
        create: {
          deliverables: json(["12-second title sequence"]),
          dimensions: json(["1920x1080"]),
          durations: json(["12 seconds"]),
          referenceNotes: json(["Greyscale logo incoming"]),
          exactText: json(["Hollow Current"]),
          brandConstraints: json(["Abstract water and a lantern", "No characters", "No dialogue"]),
          rightsConcerns: json([]),
          missingInformation: json([]),
          confidence: 0.84,
          decision: "accept",
          rationale:
            "The sequence is short, the frame and the only line of text are explicit, and the price covers the mock catalog. Workflow approval is still a separate human step. This recommendation does not message the client.",
          modelLabel: "GPT-6 Astra (gpt-6-astra)",
        },
      },
      steps: {
        create: [
          step({
            position: 1,
            name: "Key stills",
            model: image,
            purpose: "Lantern and water stills before any motion.",
            inputs: ["Pasted brief", "Exact title"],
            outputs: ["Four stills"],
            attempts: 4,
            approvalStatus: "approved",
            status: "ready",
          }),
          step({
            position: 2,
            name: "Motion coverage",
            model: video,
            purpose: "12 seconds of abstract coverage plus one safety take.",
            inputs: ["Stills"],
            outputs: ["Title selects"],
            attempts: 4,
            approvalStatus: "approved",
            status: "ready",
          }),
          step({
            position: 3,
            name: "Assembly",
            model: editing,
            purpose: "Lock the 12-second sequence.",
            inputs: ["Selects", "Title text"],
            outputs: ["Picture lock"],
            attempts: 1,
            approvalStatus: "approved",
            status: "ready",
          }),
          step({
            position: 4,
            name: "Finish",
            model: finishing,
            purpose: "Grade and place the title.",
            inputs: ["Picture lock"],
            outputs: ["Finished title sequence"],
            attempts: 1,
            approvalStatus: "approved",
            status: "ready",
          }),
        ],
      },
      approvals: {
        create: [
          {
            kind: "workflow_budget",
            status: "approved",
            summary: "Workflow and maximum budget approved",
            detail: "Maximum production budget set to 295.55 USD. Generation has not started.",
            createdAt: at("2026-09-18T14:00:00.000Z"),
            resolvedAt: at("2026-09-18T14:12:00.000Z"),
          },
        ],
      },
    },
  })
  void hollow

  const atlas = await prisma.job.create({
    data: {
      id: "job_atlas",
      title: "Atlas Rail — overnight teaser",
      source: "upwork",
      budgetCents: 90_000,
      deadline: at("2026-10-08T12:00:00.000Z"),
      status: "generating",
      channelFeeBps: 1000,
      contingencyBps: 1500,
      maxBudgetCents: 38_985,
      clientNotes: "Deliver silent picture. Their editor replaces the bed.",
      createdAt: at("2026-09-21T08:15:00.000Z"),
      rawBrief: `15-second travel teaser for Atlas Rail's overnight coastal line.
16:9 and a 9:16 cut. No voice.
Shots: boarding at dusk, window light, arrival at dawn.
On-screen text: "Atlas Rail" and "Overnight".
Budget $900. Deadline in 12 days.`,
      analysis: {
        create: {
          deliverables: json(["15-second 16:9 teaser", "9:16 cut"]),
          dimensions: json(["16:9", "9:16"]),
          durations: json(["15-second"]),
          referenceNotes: json(["Boarding at dusk", "Window light", "Arrival at dawn"]),
          exactText: json(["Atlas Rail", "Overnight"]),
          brandConstraints: json(["Silent picture", "No voice"]),
          rightsConcerns: json([]),
          missingInformation: json([]),
          confidence: 0.8,
          decision: "accept",
          rationale:
            "The teaser has a duration, two frames, and exact words. The Upwork fee is only a margin assumption. Nothing is submitted back to the marketplace.",
          modelLabel: "GPT-6 Astra (gpt-6-astra)",
        },
      },
      steps: {
        create: [
          step({
            position: 1,
            name: "Key stills",
            model: image,
            purpose: "Dusk platform, window, and dawn arrival stills.",
            inputs: ["Pasted brief"],
            outputs: ["Three stills"],
            attempts: 3,
            approvalStatus: "approved",
            status: "complete",
          }),
          step({
            position: 2,
            name: "Motion coverage",
            model: video,
            purpose: "15-second silent coverage.",
            inputs: ["Stills"],
            outputs: ["Motion selects"],
            attempts: 6,
            approvalStatus: "approved",
            status: "running",
          }),
          step({
            position: 3,
            name: "Assembly",
            model: editing,
            purpose: "Cut 16:9 and 9:16 silent pictures.",
            inputs: ["Selects"],
            outputs: ["Two assemblies"],
            attempts: 1,
            approvalStatus: "approved",
            status: "ready",
          }),
          step({
            position: 4,
            name: "Finish",
            model: finishing,
            purpose: "Grade and place the two lines of text.",
            inputs: ["Assemblies"],
            outputs: ["Silent masters"],
            attempts: 1,
            approvalStatus: "approved",
            status: "ready",
          }),
        ],
      },
      approvals: {
        create: [
          {
            kind: "workflow_budget",
            status: "approved",
            summary: "Workflow and maximum budget approved",
            detail: "Maximum production budget set to 389.85 USD.",
            createdAt: at("2026-09-21T10:00:00.000Z"),
            resolvedAt: at("2026-09-21T10:18:00.000Z"),
          },
        ],
      },
    },
    include: { steps: true },
  })

  const atlasStills = atlas.steps.find((item) => item.name === "Key stills")
  const atlasMotion = atlas.steps.find((item) => item.name === "Motion coverage")
  if (!atlasStills || !atlasMotion) throw new Error("Atlas steps missing")
  await prisma.generation.createMany({
    data: [
      {
        jobId: atlas.id,
        stepId: atlasStills.id,
        providerRequestId: "mock_hf_atlas_stills",
        model: atlasStills.selectedModel,
        status: "succeeded",
        costEstimateCents: atlasStills.estimatedTotalCents,
        actualCostCents: atlasStills.estimatedTotalCents,
        outputUrl: mockOutputUrl({ title: "Atlas Rail", subtitle: "Key stills", kind: "image" }),
        createdAt: at("2026-09-22T12:00:00.000Z"),
        completedAt: at("2026-09-22T12:04:00.000Z"),
      },
      {
        jobId: atlas.id,
        stepId: atlasMotion.id,
        providerRequestId: "mock_hf_atlas_motion",
        model: atlasMotion.selectedModel,
        status: "running",
        costEstimateCents: atlasMotion.estimatedTotalCents,
        createdAt: at("2026-09-22T12:06:00.000Z"),
      },
    ],
  })

  const lumen = await prisma.job.create({
    data: {
      id: "job_lumen",
      title: "Lumen Clay — pour-over stills",
      source: "intake",
      budgetCents: 64_000,
      deadline: at("2026-09-12T12:00:00.000Z"),
      status: "delivered",
      channelFeeBps: 0,
      contingencyBps: 1500,
      maxBudgetCents: 12_000,
      clientNotes: "Delivered from this desk. Files were handed over directly, not through a marketplace.",
      createdAt: at("2026-09-02T11:00:00.000Z"),
      rawBrief: `Direct intake.

Lumen Clay needs eight product stills of a stoneware pour-over, neutral plaster wall, morning side light.
Dimensions 2400x3000. No text on the stills.
No people. No props we do not own.
Budget $640.`,
      assets: {
        create: [
          {
            label: "Maker photo of the pour-over",
            url: "https://files.example.com/lumen/pourover.jpg",
            kind: "image",
          },
        ],
      },
      analysis: {
        create: {
          deliverables: json(["Eight product stills"]),
          dimensions: json(["2400x3000"]),
          durations: json([]),
          referenceNotes: json(["Maker photo of the pour-over"]),
          exactText: json([]),
          brandConstraints: json([
            "Neutral plaster wall",
            "Morning side light",
            "No people",
            "No unowned props",
          ]),
          rightsConcerns: json([]),
          missingInformation: json([]),
          confidence: 0.88,
          decision: "accept",
          rationale:
            "A stills-only job with a frame size, a subject the client owns, and a clear price. Delivery was recorded inside Studio Operator.",
          modelLabel: "GPT-6 Astra (gpt-6-astra)",
        },
      },
      steps: {
        create: [
          step({
            position: 1,
            name: "Key stills",
            model: image,
            purpose: "Eight views of the pour-over.",
            inputs: ["Intake form", "Maker photo"],
            outputs: ["Eight stills"],
            attempts: 8,
            approvalStatus: "approved",
            status: "complete",
          }),
          step({
            position: 2,
            name: "Finish",
            model: finishing,
            purpose: "Match the plaster wall and morning light.",
            inputs: ["Selects"],
            outputs: ["Finished stills"],
            attempts: 1,
            approvalStatus: "approved",
            status: "complete",
          }),
        ],
      },
      revisions: {
        create: [
          {
            clientNote: "Soften the shadow under the spout.",
            affectedDeliverable: "Eight product stills",
            recommendedAction: "Run one additional finishing pass on the stills.",
            expectedIncrementalCents: finishing.unitCostCents,
            approvalStatus: "approved",
            createdAt: at("2026-09-08T16:00:00.000Z"),
          },
        ],
      },
      approvals: {
        create: [
          {
            kind: "workflow_budget",
            status: "approved",
            summary: "Workflow and maximum budget approved",
            detail: "Initial maximum covered generation plus contingency.",
            createdAt: at("2026-09-02T12:00:00.000Z"),
            resolvedAt: at("2026-09-02T12:10:00.000Z"),
          },
          {
            kind: "budget_increase",
            status: "approved",
            summary: "Budget increase approved for the spout note",
            detail: "Maximum production budget raised to 120.00 USD.",
            createdAt: at("2026-09-08T16:10:00.000Z"),
            resolvedAt: at("2026-09-08T16:14:00.000Z"),
          },
          {
            kind: "final_delivery",
            status: "approved",
            summary: "Final delivery approved",
            detail: "Delivered inside Studio Operator. No marketplace upload was performed.",
            createdAt: at("2026-09-09T15:00:00.000Z"),
            resolvedAt: at("2026-09-09T15:06:00.000Z"),
          },
        ],
      },
    },
    include: { steps: true },
  })

  const lumenStills = lumen.steps.find((item) => item.name === "Key stills")
  const lumenFinish = lumen.steps.find((item) => item.name === "Finish")
  if (!lumenStills || !lumenFinish) throw new Error("Lumen steps missing")
  await prisma.generation.createMany({
    data: [
      {
        jobId: lumen.id,
        stepId: lumenStills.id,
        providerRequestId: "mock_hf_lumen_stills",
        model: lumenStills.selectedModel,
        status: "succeeded",
        costEstimateCents: lumenStills.estimatedTotalCents,
        actualCostCents: lumenStills.estimatedTotalCents,
        outputUrl: mockOutputUrl({ title: "Lumen Clay", subtitle: "Product stills", kind: "image" }),
        createdAt: at("2026-09-04T10:00:00.000Z"),
        completedAt: at("2026-09-04T10:08:00.000Z"),
      },
      {
        jobId: lumen.id,
        stepId: lumenFinish.id,
        providerRequestId: "mock_hf_lumen_finish",
        model: lumenFinish.selectedModel,
        status: "succeeded",
        costEstimateCents: lumenFinish.estimatedTotalCents,
        actualCostCents: lumenFinish.estimatedTotalCents,
        outputUrl: mockOutputUrl({ title: "Lumen Clay", subtitle: "Finish", kind: "finishing" }),
        createdAt: at("2026-09-04T11:00:00.000Z"),
        completedAt: at("2026-09-04T11:05:00.000Z"),
      },
      {
        jobId: lumen.id,
        stepId: null,
        providerRequestId: "mock_hf_lumen_revision",
        model: finishing.id,
        status: "succeeded",
        costEstimateCents: finishing.unitCostCents,
        actualCostCents: finishing.unitCostCents,
        outputUrl: mockOutputUrl({ title: "Lumen Clay", subtitle: "Softer spout shadow", kind: "finishing" }),
        createdAt: at("2026-09-08T16:20:00.000Z"),
        completedAt: at("2026-09-08T16:24:00.000Z"),
      },
    ],
  })

  await prisma.job.create({
    data: {
      id: "job_fieldnotes",
      title: "Field Notes Audio — cover refresh",
      source: "email",
      budgetCents: 40_000,
      deadline: at("2026-10-30T12:00:00.000Z"),
      status: "new",
      channelFeeBps: 0,
      contingencyBps: 1500,
      clientNotes: "",
      createdAt: at("2026-09-25T14:05:00.000Z"),
      rawBrief: `Email from Field Notes Audio.

Can you refresh our podcast cover and a 5-second sonic ident?
Show art 3000x3000. The ident has no spoken words, just a soft click and room tone.
Palette is forest green. Deadline is the end of next month. Budget $400.`,
    },
  })

  await prisma.job.create({
    data: {
      id: "job_soda",
      title: "Lookalike cola spot",
      source: "fiverr",
      budgetCents: 20_000,
      deadline: at("2026-09-26T12:00:00.000Z"),
      status: "rejected",
      channelFeeBps: 2000,
      contingencyBps: 1500,
      clientNotes: "Declined on rights. No reply was sent through Fiverr.",
      createdAt: at("2026-09-23T19:12:00.000Z"),
      rawBrief: `I want a 15-second ad that looks exactly like Zendaya opening our can, wearing a Nike jacket, with the Beatles song Come Together under it.
Budget $200. Tomorrow.`,
      analysis: {
        create: {
          deliverables: json(["15-second ad"]),
          dimensions: json([]),
          durations: json(["15-second"]),
          referenceNotes: json([]),
          exactText: json([]),
          brandConstraints: json([]),
          rightsConcerns: json([
            "Real-person likeness",
            "Third-party apparel mark",
            "Copyrighted song",
          ]),
          missingInformation: json(["Frame size is not stated", "Deadline is overnight"]),
          confidence: 0.9,
          decision: "reject",
          rationale:
            "Decline this job. It asks for a real person's likeness, a third-party mark, and a copyrighted song. No proposal was sent.",
          modelLabel: "GPT-6 Astra (gpt-6-astra)",
        },
      },
      approvals: {
        create: [
          {
            kind: "rights",
            status: "required",
            summary: "Rights concern needs a person",
            detail:
              "Likeness, trademark wardrobe, and a copyrighted track. Production stays blocked. Clearing this gate does not create a license.",
            createdAt: at("2026-09-23T19:16:00.000Z"),
          },
        ],
      },
    },
  })

  console.log("Seeded 7 jobs across the pipeline.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
