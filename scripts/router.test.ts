import assert from "node:assert/strict"

import { finalizeAnalysis, type AnalysisDraft, type CommercialContext } from "../src/lib/analysis"
import { PLANNING_RATES } from "../src/lib/planning-rates"
import { applyOverride, maxSpendCents, proposeRoute, type RouteLine } from "../src/lib/route"
import { catalogById, catalogByRole, ROUTE_ROLES, ROUTER_CATALOG, wiredLiveEndpoint } from "../src/lib/router-catalog"
import { planFromAnalysis } from "../src/server/services/plan-from-analysis"
import { MODEL_CATALOG } from "../src/server/services/models"

const NOW = new Date("2026-09-25T12:00:00.000Z")

function draft(overrides: Partial<AnalysisDraft> = {}): AnalysisDraft {
  return {
    jobType: "motion",
    conciseSummary: "A scoped production job.",
    deliverables: [
      {
        name: "Master",
        format: "motion",
        aspectRatio: "16:9",
        duration: "20 seconds",
        resolution: "1920x1080",
        exactText: [],
      },
    ],
    suppliedAssets: [],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: [],
    rightsAndConsentFlags: [],
    technicalRisks: [],
    revisionRisk: "low",
    confidence: 80,
    decision: "accept",
    decisionReasons: ["The deliverable is specific."],
    proposedWorkflow: [
      { name: "Key stills", capability: "image", purpose: "Explore still concepts." },
      { name: "Motion coverage", capability: "video", purpose: "Cover the approved duration." },
      { name: "Voice line", capability: "voice", purpose: "Read the approved line." },
      { name: "Assembly", capability: "editing", purpose: "Assemble the selects." },
      { name: "Finish", capability: "finishing", purpose: "Export the master." },
    ],
    estimatedAttemptsByStep: [
      { stepName: "Key stills", capability: "image", attempts: 2 },
      { stepName: "Motion coverage", capability: "video", attempts: 5 },
      { stepName: "Voice line", capability: "voice", attempts: 2 },
      { stepName: "Assembly", capability: "editing", attempts: 1 },
      { stepName: "Finish", capability: "finishing", attempts: 1 },
    ],
    assumptions: ["Attempt counts are estimates."],
    ...overrides,
  }
}

function stored(overrides: Partial<AnalysisDraft> = {}, deadlineIso = "2026-10-20T12:00:00.000Z") {
  const context: CommercialContext = {
    clientPriceCents: 180_000,
    channelFeeBps: 0,
    contingencyBps: 1500,
    deadlineIso,
    now: NOW,
    targetMarginBps: 2500,
    catalog: {
      image: { unitCostCents: PLANNING_RATES.image.unitCostCents },
      video: { unitCostCents: PLANNING_RATES.video.unitCostCents },
      voice: { unitCostCents: PLANNING_RATES.voice.unitCostCents },
      editing: { unitCostCents: PLANNING_RATES.editing.unitCostCents },
      finishing: { unitCostCents: PLANNING_RATES.finishing.unitCostCents },
    },
  }
  return finalizeAnalysis(draft(overrides), context)
}

function line(proposal: ReturnType<typeof proposeRoute>, capability: RouteLine["capability"]) {
  const found = proposal.billed.find((item) => item.capability === capability)
  assert.ok(found, capability)
  return found
}

function main() {
  for (const role of ROUTE_ROLES) {
    assert.ok(catalogByRole(role).length > 0, role)
  }
  for (const model of ROUTER_CATALOG) {
    assert.equal(catalogById(model.alternativeId)?.id, model.alternativeId)
    assert.equal(model.id.includes("seedream"), false)
    assert.equal(model.id.includes("flux"), false)
    assert.equal(model.id.includes("veo"), false)
    assert.equal(model.id.includes("topaz"), false)
    assert.equal(/speak/i.test(model.id), false)
  }
  assert.deepEqual(
    ROUTER_CATALOG.filter((model) => model.liveSubmit).map((model) => model.id).sort(),
    ["higgsfield-ai/soul/v2/standard", "kling-video/v3.0/std/text-to-video"],
  )
  assert.equal(wiredLiveEndpoint("higgsfield-ai/soul/v2/standard"), "soul")
  assert.equal(wiredLiveEndpoint("kling-video/v3.0/pro/text-to-video"), null)
  for (const kind of ["image", "video", "voice", "editing", "finishing"] as const) {
    assert.equal(MODEL_CATALOG[kind].unitCostCents, PLANNING_RATES[kind].unitCostCents)
  }

  const concepts = proposeRoute(
    stored({
      conciseSummary: "Loose still concepts for an abstract background.",
      deliverables: [
        {
          name: "Concepts",
          format: "still",
          aspectRatio: "1:1",
          duration: "",
          resolution: "1024x1024",
          exactText: [],
        },
      ],
      proposedWorkflow: [{ name: "Key stills", capability: "image", purpose: "Explore rough concept variants." }],
      estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 8 }],
    }),
    { rawBrief: "Explore eight abstract background concepts. No text.", now: NOW, referenceCount: 0 },
  )
  const concept = line(concepts, "image")
  assert.equal(concept.modelId, "z-image/turbo")
  assert.equal(concept.role, "SEARCH")
  assert.equal(concept.stage, "explore")
  assert.equal(concept.attempts, 8)
  assert.equal(concept.lineCents, 8 * 800)
  assert.equal(concepts.stages.map((stage) => stage.stage).join(","), "explore,choose,control,ship,repair,finish,qa")
  assert.equal(concepts.stages.find((stage) => stage.stage === "choose")?.skipped, false)
  assert.equal(concepts.stages.find((stage) => stage.stage === "qa")?.lines.length, 0)

  const packaging = proposeRoute(
    stored({
      conciseSummary: "Correct the label on the owned bottle.",
      deliverables: [
        {
          name: "Label still",
          format: "still",
          aspectRatio: "1:1",
          duration: "",
          resolution: "2000x2000",
          exactText: ["Northwind"],
        },
      ],
      suppliedAssets: ["Bottle photo"],
      proposedWorkflow: [{ name: "Key stills", capability: "image", purpose: "Correct the packaging text." }],
      estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 2 }],
    }),
    { rawBrief: "Fix the wordmark on the bottle label.", now: NOW, referenceCount: 1 },
  )
  const edited = line(packaging, "image")
  assert.equal(edited.modelId, "alibaba/qwen-image-3/edit")
  assert.equal(edited.role, "CONTROL")
  assert.match(edited.failureMode, /1–3|1-3/)
  assert.equal(packaging.stages.find((stage) => stage.stage === "explore")?.skipped, true)

  const product = proposeRoute(
    stored({
      conciseSummary: "Lifestyle still of a bottle the client owns.",
      deliverables: [
        {
          name: "Lifestyle still",
          format: "still",
          aspectRatio: "4:5",
          duration: "",
          resolution: "1080x1350",
          exactText: [],
        },
      ],
      proposedWorkflow: [{ name: "Key stills", capability: "image", purpose: "Hold the bottle consistent." }],
      estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 3 }],
    }),
    { rawBrief: "Lifestyle product photo of the bottle on a table. No people.", now: NOW, referenceCount: 1 },
  )
  const marketed = line(product, "image")
  assert.equal(marketed.modelId, "marketing-studio/image")
  assert.match(marketed.substituteNote ?? "", /Seedream/)
  assert.match(marketed.substituteNote ?? "", /Flux/)

  const poster = proposeRoute(
    stored({
      conciseSummary: "A typography poster.",
      deliverables: [
        {
          name: "Poster",
          format: "still",
          aspectRatio: "2:3",
          duration: "",
          resolution: "1080x1620",
          exactText: ["Write the weather"],
        },
      ],
      proposedWorkflow: [{ name: "Key stills", capability: "image", purpose: "Set the poster headline." }],
      estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 2 }],
    }),
    { rawBrief: "Design a typography poster. No reference file yet.", now: NOW, referenceCount: 0 },
  )
  const typeStep = line(poster, "image")
  assert.equal(typeStep.modelId, "ideogram/v4.0")
  assert.equal(typeStep.alternativeModelId, "recraft/v4.1/text-to-image")

  const fashion = proposeRoute(
    stored({
      conciseSummary: "Editorial fashion portrait.",
      deliverables: [
        {
          name: "Portrait",
          format: "still",
          aspectRatio: "3:4",
          duration: "",
          resolution: "1080x1440",
          exactText: [],
        },
      ],
      proposedWorkflow: [{ name: "Key stills", capability: "image", purpose: "Final editorial portrait." }],
      estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 2 }],
    }),
    { rawBrief: "Fashion editorial portrait. No text.", now: NOW, referenceCount: 0 },
  )
  assert.equal(line(fashion, "image").modelId, "higgsfield-ai/soul/v2/standard")
  assert.equal(line(fashion, "image").role, "SHIP")

  const fashionSearch = proposeRoute(
    stored({
      conciseSummary: "Fashion concept stills.",
      deliverables: [
        {
          name: "Concepts",
          format: "still",
          aspectRatio: "3:4",
          duration: "",
          resolution: "1080x1440",
          exactText: [],
        },
      ],
      proposedWorkflow: [{ name: "Key stills", capability: "image", purpose: "Explore fashion concept variants." }],
      estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 4 }],
    }),
    { rawBrief: "Explore fashion editorial concepts. No text.", now: NOW, referenceCount: 0 },
  )
  assert.equal(line(fashionSearch, "image").modelId, "higgsfield-ai/soul/v2/standard")
  assert.equal(line(fashionSearch, "image").role, "SEARCH")
  assert.equal(line(fashionSearch, "image").lineCents, 4 * 800)

  const fast = proposeRoute(
    stored({
      proposedWorkflow: [{ name: "Motion coverage", capability: "video", purpose: "Explore rough motion concepts." }],
      estimatedAttemptsByStep: [{ stepName: "Motion coverage", capability: "video", attempts: 4 }],
    }),
    { rawBrief: "Test a few motion concepts before a final.", now: NOW, referenceCount: 0 },
  )
  assert.equal(line(fast, "video").modelId, "lightricks/ltx-2.5/text-to-video/fast")
  assert.equal(line(fast, "video").role, "SEARCH")
  assert.match(line(fast, "video").substituteNote ?? "", /Seedance Fast/)

  const premium = proposeRoute(
    stored(),
    { rawBrief: "A 20 second cinematic brand film. No people.", now: NOW, referenceCount: 0 },
  )
  const motion = line(premium, "video")
  assert.equal(motion.modelId, "kling-video/v3.0/pro/text-to-video")
  assert.match(motion.substituteNote ?? "", /Veo/)
  assert.equal(motion.lineCents, 5 * 4500)
  assert.equal(line(premium, "voice").modelId, "local/voice")
  assert.match(line(premium, "voice").substituteNote ?? "", /Speak/)
  assert.equal(line(premium, "finishing").modelId, "local/finish")
  assert.match(line(premium, "finishing").substituteNote ?? "", /Topaz/)
  const repair = premium.billed.find((item) => item.stage === "repair")
  assert.ok(repair)
  assert.equal(repair.alternativeModelId, "bytedance/seedance-2.5/video-edit")
  const expected =
    2 * 800 + 5 * 4500 + 2 * 1500 + 1 * 2500 + 1 * 2000
  assert.equal(premium.maxSpendCents, expected)
  assert.equal(maxSpendCents(premium.billed), expected)

  const planned = planFromAnalysis(stored(), {
    rawBrief: "A 20 second cinematic brand film. No people.",
    now: NOW,
    referenceCount: 0,
  })
  assert.equal(
    planned.reduce((sum, step) => sum + step.estimatedTotalCents, 0),
    expected,
  )
  assert.ok(planned.every((step) => step.whyFit && step.failureMode && step.alternativeModel))

  const voiceover = proposeRoute(
    stored(),
    {
      rawBrief: "A 20 second brand film with one original voiceover. No people.",
      now: NOW,
      referenceCount: 0,
    },
  )
  assert.equal(line(voiceover, "video").modelId, "kling-video/v3.0/pro/text-to-video")
  assert.equal(line(voiceover, "voice").modelId, "local/voice")

  const tight = proposeRoute(stored({}, "2026-09-26T12:00:00.000Z"), {
    rawBrief: "Need the film tomorrow.",
    deadlineIso: "2026-09-26T12:00:00.000Z",
    now: NOW,
    referenceCount: 0,
  })
  assert.equal(line(tight, "video").modelId, "kling-video/v3.0/std/text-to-video")
  assert.equal(line(tight, "video").liveSubmit, true)

  const talking = proposeRoute(
    stored({
      conciseSummary: "The founder speaks to camera.",
      proposedWorkflow: [{ name: "Motion coverage", capability: "video", purpose: "Final talking shot." }],
      estimatedAttemptsByStep: [{ stepName: "Motion coverage", capability: "video", attempts: 2 }],
    }),
    { rawBrief: "The founder speaks to camera for 8 seconds.", now: NOW, referenceCount: 0 },
  )
  assert.equal(line(talking, "video").modelId, "pixverse/v6/text-to-video")
  assert.match(line(talking, "video").why, /MiniMax|Speak/)

  const base = line(concepts, "image")
  const sameRate = applyOverride(base, { modelId: "higgsfield-ai/soul/v2/standard", attempts: 8 })
  assert.ok(sameRate)
  assert.equal(sameRate.unitCostCents, 800)
  assert.equal(sameRate.lineCents, 6400)
  assert.equal(sameRate.role, "SHIP")

  const videoOverride = applyOverride(base, { modelId: "kling-video/v3.0/pro/text-to-video", attempts: 2 })
  assert.ok(videoOverride)
  assert.equal(videoOverride.unitCostCents, 4500)
  assert.equal(videoOverride.lineCents, 9000)
  assert.equal(videoOverride.stage, "ship")
  assert.match(videoOverride.why, /Operator override/)

  const capped = applyOverride(base, { modelId: "z-image/turbo", attempts: 20 })
  assert.ok(capped)
  assert.equal(capped.attempts, 8)
  assert.equal(capped.requestedAttempts, 20)
  assert.equal(capped.capped, true)
  assert.equal(capped.lineCents, 6400)

  assert.equal(applyOverride(base, { modelId: "not-a-model", attempts: 1 }), null)

  const attemptsOnly = applyOverride(base, { modelId: base.modelId, attempts: 3 })
  assert.ok(attemptsOnly)
  assert.equal(attemptsOnly.lineCents, 2400)
  assert.equal(attemptsOnly.why, base.why)

  console.log("router tests passed")
}

main()
