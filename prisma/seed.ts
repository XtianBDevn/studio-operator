/**
 * Demo fixtures for every pipeline column and job tab.
 * Intake text is pasted-source copy only. Nothing here contacts a marketplace.
 */
import { PrismaClient } from "@prisma/client"

import { finalizeAnalysis, type AnalysisDraft, type StoredAnalysis } from "../src/lib/analysis"
import { catalogPrices } from "../src/server/services/analyze-brief"
import { mockOutputUrl } from "../src/server/services/providers"
import { catalogById } from "../src/lib/router-catalog"
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
  modelId?: string
  purpose: string
  inputs: string[]
  outputs: string[]
  attempts: number
  approvalStatus: string
  status: string
}) {
  const selectedModel = input.modelId ?? input.model.id
  const entry = catalogById(selectedModel)
  return {
    position: input.position,
    name: input.name,
    selectedModel,
    modelKind: input.model.kind,
    purpose: input.purpose,
    inputs: json(input.inputs),
    expectedOutputs: json(input.outputs),
    estimatedAttempts: input.attempts,
    unitCostCents: input.model.unitCostCents,
    estimatedTotalCents: input.model.unitCostCents * input.attempts,
    routeStage: entry?.id === "local/edit" ? "repair" : entry?.role === "SEARCH" ? "explore" : entry?.role === "CONTROL" ? "control" : entry?.role === "SHIP" ? "ship" : "finish",
    routeRole: entry?.id === "local/edit" ? "CONTROL" : entry?.role ?? null,
    whyFit: entry ? `Saved plan. ${entry.why} Purpose: ${input.purpose}` : input.purpose,
    failureMode: entry?.constraint ?? null,
    alternativeModel: entry?.alternativeId ?? null,
    docsUrl: entry?.docsUrl ?? null,
    substituteNote: entry?.substituteNote ?? null,
    approvalStatus: input.approvalStatus,
    status: input.status,
  }
}

function analysisColumns(input: {
  draft: AnalysisDraft
  budgetCents: number
  channelFeeBps: number
  contingencyBps: number
  deadlineIso: string
  nowIso: string
  editedFrom?: (document: StoredAnalysis) => StoredAnalysis
}) {
  const document = finalizeAnalysis(input.draft, {
    clientPriceCents: input.budgetCents,
    channelFeeBps: input.channelFeeBps,
    contingencyBps: input.contingencyBps,
    deadlineIso: input.deadlineIso,
    now: new Date(input.nowIso),
    catalog: catalogPrices(),
  })
  const edited = input.editedFrom ? input.editedFrom(document) : null
  const effective = edited ?? document
  return {
    originalJson: JSON.stringify(document),
    editedJson: edited ? JSON.stringify(edited) : null,
    decision: effective.decision,
    confidence: document.confidence,
    modelLabel: "GPT-6 Astra (gpt-6-astra)",
    provider: "mock",
    createdAt: at(input.nowIso),
  }
}

function workflow(
  steps: Array<[string, AnalysisDraft["proposedWorkflow"][number]["capability"], string, number]>,
): Pick<AnalysisDraft, "proposedWorkflow" | "estimatedAttemptsByStep"> {
  return {
    proposedWorkflow: steps.map(([name, capability, purpose]) => ({ name, capability, purpose })),
    estimatedAttemptsByStep: steps.map(([name, capability, , attempts]) => ({
      stepName: name,
      capability,
      attempts,
    })),
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
        create: analysisColumns({
          budgetCents: 220_000,
          channelFeeBps: 0,
          contingencyBps: 1500,
          deadlineIso: "2026-10-18T12:00:00.000Z",
          nowIso: "2026-09-12T15:24:00.000Z",
          draft: {
            jobType: "motion",
            conciseSummary:
              "A 45-second concept film with a vertical cutdown, four stills, and one original line. Catalog prices decide the margin.",
            deliverables: [
              {
                name: "45-second concept film",
                format: "motion",
                aspectRatio: "16:9",
                duration: "45 seconds",
                resolution: "1920x1080",
                exactText: ["Northline", "Built for the hour before weather."],
              },
              {
                name: "15-second cutdown",
                format: "motion",
                aspectRatio: "9:16",
                duration: "15 seconds",
                resolution: "1080x1920",
                exactText: ["Northline", "Built for the hour before weather."],
              },
              {
                name: "Four hero stills",
                format: "still",
                aspectRatio: "3:2",
                duration: "",
                resolution: "3:2 stills",
                exactText: [],
              },
              {
                name: "Original voice line",
                format: "audio",
                aspectRatio: "",
                duration: "one line",
                resolution: "",
                exactText: ["Built for the hour before weather."],
              },
            ],
            suppliedAssets: ["Dawn platform reference", "Case study still"],
            missingAssets: [],
            questionsForClient: [],
            brandConstraints: [
              "Oxidized brass #8A6A3B, night navy #141820, fog #D5D8DC",
              "No diamond sparkle or luxury clichés",
              "Wordmark only at the end",
              "Original score, no library tracks",
            ],
            rightsAndConsentFlags: [],
            technicalRisks: ["The 9:16 cutdown needs its own assembly pass."],
            revisionRisk: "low",
            confidence: 90,
            decision: "accept",
            decisionReasons: [
              "Duration, frames, exact lines, and ownership are in the pasted email.",
            ],
            assumptions: ["Fictional talent only. The client owns the product design."],
            ...workflow([
              ["Key stills", "image", "Platform, case, dial macro, and the end frame.", 6],
              ["Motion coverage", "video", "45-second master coverage plus safety takes.", 10],
              ["Voice line", "voice", "One original line. No impersonation.", 2],
              ["Assembly", "editing", "Cut the 45-second master and the 15-second vertical.", 2],
              ["Finish", "finishing", "Grade, place the wordmark, export both frames.", 2],
            ]),
          },
        }),
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
        create: analysisColumns({
          budgetCents: 35_000,
          channelFeeBps: 2000,
          contingencyBps: 1500,
          deadlineIso: "2026-09-28T12:00:00.000Z",
          nowIso: "2026-09-24T09:48:00.000Z",
          draft: {
            jobType: "motion",
            conciseSummary: "A 6-second square loaf loop. The end card and logo are not ready to produce.",
            deliverables: [
              {
                name: "6-second oven loop",
                format: "motion",
                aspectRatio: "1:1",
                duration: "6 seconds",
                resolution: "square",
                exactText: [],
              },
            ],
            suppliedAssets: [],
            missingAssets: ["Client logo file"],
            questionsForClient: ["What is the exact end-card text, character for character?"],
            brandConstraints: ["Warm, handheld, no people"],
            rightsAndConsentFlags: ["Exact logo is required and has not been supplied."],
            technicalRisks: [],
            revisionRisk: "medium",
            confidence: 46,
            decision: "human_review",
            decisionReasons: ["The logo and the end-card line are still missing."],
            assumptions: ["Attempt counts are estimates. The desk prices them from the catalog."],
            ...workflow([
              ["Key stills", "image", "Oven light and loaf stills.", 2],
              ["Motion coverage", "video", "One 6-second loop with a safety take.", 2],
              ["Assembly", "editing", "Cut the loop and leave room for the end card.", 1],
              ["Finish", "finishing", "Grade and hold a space for the missing logo.", 1],
            ]),
          },
        }),
      },
      steps: {
        create: [
          step({
            position: 1,
            name: "Key stills",
            model: image,
            modelId: "marketing-studio/image",
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
        create: analysisColumns({
          budgetCents: 120_000,
          channelFeeBps: 0,
          contingencyBps: 1500,
          deadlineIso: "2026-10-06T12:00:00.000Z",
          nowIso: "2026-09-18T13:10:00.000Z",
          editedFrom: (document) => ({
            ...document,
            missingAssets: [],
            questionsForClient: [],
            rightsAndConsentFlags: [],
            decision: "accept",
            decisionReasons: [
              "The sequence, frame, and title are explicit.",
              "A person confirmed the greyscale logo will arrive before finishing and accepted the job for planning.",
            ],
          }),
          draft: {
            jobType: "motion",
            conciseSummary: "A 12-second abstract title sequence. The greyscale logo file is not in hand yet.",
            deliverables: [
              {
                name: "12-second title sequence",
                format: "motion",
                aspectRatio: "16:9",
                duration: "12 seconds",
                resolution: "1920x1080",
                exactText: ["Hollow Current"],
              },
            ],
            suppliedAssets: ["Director description of abstract water and a lantern"],
            missingAssets: ["Greyscale logo file"],
            questionsForClient: ["When will the greyscale logo file arrive?"],
            brandConstraints: ["Abstract water and a lantern", "No characters", "No dialogue"],
            rightsAndConsentFlags: ["Exact logo file has not arrived."],
            technicalRisks: [],
            revisionRisk: "medium",
            confidence: 74,
            decision: "human_review",
            decisionReasons: ["The title and frame are clear, but the logo file is outstanding."],
            assumptions: ["No characters and no dialogue."],
            ...workflow([
              ["Key stills", "image", "Lantern and water stills before any motion.", 4],
              ["Motion coverage", "video", "12 seconds of abstract coverage plus one safety take.", 4],
              ["Assembly", "editing", "Lock the 12-second sequence.", 1],
              ["Finish", "finishing", "Grade and place the title.", 1],
            ]),
          },
        }),
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
        create: analysisColumns({
          budgetCents: 90_000,
          channelFeeBps: 1000,
          contingencyBps: 1500,
          deadlineIso: "2026-10-08T12:00:00.000Z",
          nowIso: "2026-09-21T08:20:00.000Z",
          draft: {
            jobType: "motion",
            conciseSummary: "A silent 15-second travel teaser in 16:9 and 9:16, with two exact lines.",
            deliverables: [
              {
                name: "15-second 16:9 teaser",
                format: "motion",
                aspectRatio: "16:9",
                duration: "15 seconds",
                resolution: "1920x1080",
                exactText: ["Atlas Rail", "Overnight"],
              },
              {
                name: "9:16 cut",
                format: "motion",
                aspectRatio: "9:16",
                duration: "15 seconds",
                resolution: "1080x1920",
                exactText: ["Atlas Rail", "Overnight"],
              },
            ],
            suppliedAssets: ["Boarding at dusk", "Window light", "Arrival at dawn"],
            missingAssets: [],
            questionsForClient: [],
            brandConstraints: ["Silent picture", "No voice"],
            rightsAndConsentFlags: [],
            technicalRisks: ["Two aspect ratios need separate finishing."],
            revisionRisk: "low",
            confidence: 80,
            decision: "accept",
            decisionReasons: ["Duration, both frames, and the exact words are in the paste."],
            assumptions: ["The channel fee is a planning assumption. Nothing is sent back to the marketplace."],
            ...workflow([
              ["Key stills", "image", "Dusk platform, window, and dawn arrival stills.", 3],
              ["Motion coverage", "video", "15-second silent coverage.", 6],
              ["Assembly", "editing", "Cut 16:9 and 9:16 silent pictures.", 1],
              ["Finish", "finishing", "Grade and place the two lines of text.", 1],
            ]),
          },
        }),
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
        create: analysisColumns({
          budgetCents: 64_000,
          channelFeeBps: 0,
          contingencyBps: 1500,
          deadlineIso: "2026-09-12T12:00:00.000Z",
          nowIso: "2026-09-02T11:20:00.000Z",
          draft: {
            jobType: "stills",
            conciseSummary: "Eight product stills of a pour-over the client owns, at a stated frame size.",
            deliverables: [
              {
                name: "Eight product stills",
                format: "still",
                aspectRatio: "4:5",
                duration: "",
                resolution: "2400x3000",
                exactText: [],
              },
            ],
            suppliedAssets: ["Maker photo of the pour-over"],
            missingAssets: [],
            questionsForClient: [],
            brandConstraints: [
              "Neutral plaster wall",
              "Morning side light",
              "No people",
              "No unowned props",
            ],
            rightsAndConsentFlags: [],
            technicalRisks: [],
            revisionRisk: "low",
            confidence: 88,
            decision: "accept",
            decisionReasons: ["The subject, frame size, and ownership are explicit."],
            assumptions: ["Delivery was recorded inside Studio Operator."],
            ...workflow([
              ["Key stills", "image", "Eight views of the pour-over.", 8],
              ["Finish", "finishing", "Match the plaster wall and morning light.", 1],
            ]),
          },
        }),
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
        create: analysisColumns({
          budgetCents: 20_000,
          channelFeeBps: 2000,
          contingencyBps: 1500,
          deadlineIso: "2026-09-26T12:00:00.000Z",
          nowIso: "2026-09-23T19:16:00.000Z",
          draft: {
            jobType: "motion",
            conciseSummary: "A 15-second spot that asks for a protected likeness, a trademark, and a copyrighted song.",
            deliverables: [
              {
                name: "15-second ad",
                format: "motion",
                aspectRatio: "",
                duration: "15 seconds",
                resolution: "",
                exactText: [],
              },
            ],
            suppliedAssets: [],
            missingAssets: ["Frame size"],
            questionsForClient: ["Which frame size should the master use?"],
            brandConstraints: [],
            rightsAndConsentFlags: [
              "The brief asks for a likeness that looks exactly like Zendaya.",
              "Nike jacket trademark wardrobe.",
              "Licensed music: the Beatles song Come Together.",
            ],
            technicalRisks: [],
            revisionRisk: "high",
            confidence: 91,
            decision: "reject",
            decisionReasons: ["This asks for deceptive impersonation and uncleared third-party material."],
            assumptions: ["No proposal will be sent."],
            ...workflow([
              ["Motion coverage", "video", "Would cover 15 seconds if the job were lawful.", 4],
              ["Finish", "finishing", "Would finish a master if the job were lawful.", 1],
            ]),
          },
        }),
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
