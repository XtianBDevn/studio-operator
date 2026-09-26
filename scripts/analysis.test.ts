import assert from "node:assert/strict"

import {
  ANALYSIS_SYSTEM_PROMPT,
  AnalysisValidationError,
  finalizeAnalysis,
  validateAnalysisDraft,
  type AnalysisDraft,
  type CommercialContext,
  type PriceCatalog,
} from "../src/lib/analysis"
import { StudioError } from "../src/lib/errors"
import {
  buildResponsesBody,
  catalogCapabilityBrief,
  commitValidatedAnalysis,
  extractOutputText,
  requestAstraAnalysis,
} from "../src/server/services/analyze-brief"

const FULL_CATALOG: PriceCatalog = {
  image: { unitCostCents: 800 },
  video: { unitCostCents: 4500 },
  voice: { unitCostCents: 1500 },
  editing: { unitCostCents: 2500 },
  finishing: { unitCostCents: 2000 },
}

function draft(overrides: Partial<AnalysisDraft> = {}): AnalysisDraft {
  return {
    jobType: "stills",
    conciseSummary: "A clear still of a product the client owns.",
    deliverables: [
      {
        name: "Hero still",
        format: "still",
        aspectRatio: "1:1",
        duration: "",
        resolution: "2000x2000",
        exactText: ["Northwind"],
      },
    ],
    suppliedAssets: ["Product photo"],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: ["Wordmark only", "No logo on the product"],
    rightsAndConsentFlags: [],
    technicalRisks: [],
    revisionRisk: "low",
    confidence: 80,
    decision: "accept",
    decisionReasons: ["The deliverable is specific."],
    proposedWorkflow: [
      { name: "Key stills", capability: "image", purpose: "Make the still with the image capability." },
    ],
    estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 2 }],
    assumptions: ["The client owns the product."],
    ...overrides,
  }
}

function context(overrides: Partial<CommercialContext> = {}): CommercialContext {
  return {
    clientPriceCents: 100_000,
    channelFeeBps: 0,
    contingencyBps: 1500,
    deadlineIso: "2026-10-20T12:00:00.000Z",
    now: new Date("2026-09-25T12:00:00.000Z"),
    targetMarginBps: 2500,
    catalog: FULL_CATALOG,
    ...overrides,
  }
}

async function main() {
  process.env.OPENAI_MODEL = "gpt-6-astra"
  process.env.STUDIO_ANALYSIS_MODE = "mock"
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_COMPAT_API_KEY
  const valid = validateAnalysisDraft(draft())
  assert.equal(valid.deliverables[0]?.exactText[0], "Northwind")
  assert.equal(valid.confidence, 80)

  assert.throws(() => validateAnalysisDraft(null), AnalysisValidationError)
  assert.throws(() => validateAnalysisDraft("nope"), /must be an object/)
  assert.throws(() => validateAnalysisDraft({ jobType: "stills" }), /missing conciseSummary/)
  assert.throws(() => validateAnalysisDraft({ ...draft(), confidence: 80.5 }), /confidence must be an integer/)
  assert.throws(() => validateAnalysisDraft({ ...draft(), confidence: 101 }), /0 to 100/)
  assert.throws(
    () => validateAnalysisDraft({ ...draft(), decision: "review" } as unknown),
    /human_review/,
  )
  assert.throws(
    () =>
      validateAnalysisDraft({
        ...draft(),
        proposedWorkflow: [
          { name: "Key stills", capability: "higgsfield/soul", purpose: "Invent an endpoint." },
        ],
      }),
    /catalog capability/,
  )
  assert.throws(
    () => validateAnalysisDraft({ ...draft(), unitCostCents: 800 }),
    /unexpected field unitCostCents/,
  )

  const accepted = finalizeAnalysis(draft(), context())
  assert.equal(accepted.decision, "accept")
  assert.equal(accepted.deskDecision, "accept")
  assert.equal(accepted.costing.pricesComplete, true)
  assert.equal(accepted.costing.generationCents, 1600)
  assert.equal(accepted.costing.contingencyCents, 240)
  assert.ok((accepted.costing.spendCents ?? 0) < accepted.costing.productionBudgetCents)
  assert.equal(JSON.stringify(accepted).includes("unitCostCents\":800"), true)

  const negated = finalizeAnalysis(
    draft({ brandConstraints: ["No logo on the product", "No real people", "No library music"] }),
    context(),
  )
  assert.equal(negated.decision, "accept", negated.decisionReasons.join(" "))

  const logo = finalizeAnalysis(
    draft({
      missingAssets: ["Client logo file"],
      rightsAndConsentFlags: ["Exact logo is required and has not been supplied."],
    }),
    context(),
  )
  assert.equal(logo.decision, "human_review")
  assert.equal(logo.deskDecision, "human_review")
  assert.ok(logo.decisionReasons.some((reason) => reason.startsWith("Desk:")))

  const missingPrice = finalizeAnalysis(draft(), context({
    catalog: { ...FULL_CATALOG, image: { unitCostCents: null } },
  }))
  assert.equal(missingPrice.decision, "human_review")
  assert.equal(missingPrice.costing.pricesComplete, false)
  assert.equal(missingPrice.costing.generationCents, null)
  assert.equal(missingPrice.costing.spendCents, null)
  assert.ok(missingPrice.decisionReasons.some((reason) => /will not guess/i.test(reason)))

  const overLimit = finalizeAnalysis(
    draft({
      estimatedAttemptsByStep: [{ stepName: "Key stills", capability: "image", attempts: 20 }],
    }),
    context(),
  )
  assert.equal(overLimit.decision, "human_review")
  assert.equal(overLimit.costing.lines[0]?.billedAttempts, 8)
  assert.equal(overLimit.costing.lines[0]?.estimatedAttempts, 20)

  const overBudget = finalizeAnalysis(
    draft({
      proposedWorkflow: [
        { name: "Motion coverage", capability: "video", purpose: "Cover the shot." },
      ],
      estimatedAttemptsByStep: [{ stepName: "Motion coverage", capability: "video", attempts: 4 }],
    }),
    context({ clientPriceCents: 1_000, contingencyBps: 0 }),
  )
  assert.equal(overBudget.decision, "reject")
  assert.ok(overBudget.decisionReasons.some((reason) => /production budget/i.test(reason)))

  const impersonation = finalizeAnalysis(
    draft({
      conciseSummary: "Make it look exactly like Zendaya.",
      decision: "accept",
    }),
    context(),
  )
  assert.equal(impersonation.decision, "reject")
  assert.ok(impersonation.rightsAndConsentFlags.some((flag) => /impersonation|likeness/i.test(flag)))

  const modelReject = finalizeAnalysis(draft({ decision: "reject", decisionReasons: ["Operator already declined it."] }), context())
  assert.equal(modelReject.decision, "reject")
  assert.equal(modelReject.deskDecision, "accept")

  const past = finalizeAnalysis(draft(), context({ deadlineIso: "2026-09-01T12:00:00.000Z" }))
  assert.equal(past.decision, "reject")

  const noDeadline = finalizeAnalysis(draft(), context({ deadlineIso: null }))
  assert.equal(noDeadline.decision, "human_review")

  const empty = finalizeAnalysis(draft({ deliverables: [], proposedWorkflow: [], estimatedAttemptsByStep: [] }), context())
  assert.equal(empty.decision, "reject")

  let saved = 0
  async function persist(raw: unknown) {
    const result = commitValidatedAnalysis(raw, context(), {
      modelLabel: "GPT-6 Astra (gpt-6-astra)",
      provider: "mock",
    })
    saved += 1
    return result
  }
  await assert.rejects(() => persist({ jobType: "stills", priceCents: 800 }), /Nothing was saved/)
  await assert.rejects(() => persist(null), /Nothing was saved/)
  assert.equal(saved, 0)
  const kept = await persist(draft())
  assert.equal(saved, 1)
  assert.equal(kept.document.decision, "accept")

  const body = buildResponsesBody({
    rawBrief: "One still of a blue cup.",
    budgetCents: 180_000,
    deadlineIso: "2026-10-20T12:00:00.000Z",
    assetLabels: ["Cup photo"],
  })
  const encoded = JSON.stringify(body)
  assert.equal(body.model, "gpt-6-astra")
  assert.equal(body.instructions, ANALYSIS_SYSTEM_PROMPT)
  const format = (body.text as { format: { type: string; strict: boolean; name: string } }).format
  assert.equal(format.type, "json_schema")
  assert.equal(format.strict, true)
  assert.equal(format.name, "studio_brief_analysis")
  assert.equal(encoded.includes("unitCostCents"), false)
  assert.equal(encoded.includes("higgsfield/"), false)
  assert.equal(encoded.includes("4500"), false)
  assert.match(catalogCapabilityBrief(), /image/)
  assert.doesNotMatch(catalogCapabilityBrief(), /800|4500|higgsfield/)

  const parsed = extractOutputText({
    output: [{ content: [{ type: "output_text", text: "{\"jobType\":\"stills\"}" }] }],
  })
  assert.match(parsed, /stills/)
  assert.throws(() => extractOutputText({ output: [] }), /Nothing was saved/)

  process.env.OPENAI_API_KEY = "test-key"
  process.env.STUDIO_ANALYSIS_MODE = "openai"
  let seenAuth = ""
  let seenBody = ""
  await requestAstraAnalysis(
    {
      rawBrief: "One still.",
      budgetCents: 50_000,
      deadlineIso: "2026-10-20T12:00:00.000Z",
      assetLabels: [],
    },
    async (_url, init) => {
      seenAuth = String(init?.headers && (init.headers as Record<string, string>).Authorization)
      seenBody = String(init?.body)
      return new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 })
    },
  ).then(
    () => {
      throw new Error("expected invalid JSON to fail")
    },
    (error: unknown) => {
      assert.ok(error instanceof StudioError)
      assert.match(error.message, /not valid JSON/)
      assert.equal(error.message.includes("test-key"), false)
    },
  )
  assert.equal(seenAuth, "Bearer test-key")
  assert.equal(seenBody.includes("gpt-6-astra"), true)
  assert.equal(seenBody.includes("4500"), false)
  delete process.env.OPENAI_API_KEY
  delete process.env.STUDIO_ANALYSIS_MODE

  console.log("analysis tests ok")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
