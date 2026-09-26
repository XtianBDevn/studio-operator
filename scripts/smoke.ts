import assert from "node:assert/strict"

import { PRODUCT_GUARDRAILS, assertAllowedOperation } from "../src/lib/guardrails"
import { computeProfitability } from "../src/lib/profitability"
import { prisma } from "../src/server/db"
import { PrismaJobRepository } from "../src/server/repositories/prisma-job-repository"
import { analyzeBrief } from "../src/server/services/analyze-brief"
import { requestHiggsfieldGeneration } from "../src/server/services/providers"
import {
  addRevision,
  analyzeJob,
  approveBudgetIncrease,
  approveDelivery,
  approveWorkflowAndBudget,
  approveWorkflowChange,
  decideRevision,
  intakeJob,
  planJob,
  requestWorkflowChange,
  runGeneration,
  updateCommercials,
} from "../src/server/studio"
import { estimatedGenerationCents } from "../src/lib/types"

const CLEAN_BRIEF = `Northwind Stationery brand film.

Deliverables:
- One 20-second film at 1920x1080, 16:9
- Two hero stills
- One original voiceover

Duration: 20 seconds.
On-screen text: "Northwind" and "Write the weather."
Brand constraints: ink blue #142033, paper #f4efe6, quiet analog tone, wordmark only.
Rights: original work only. No library music. No real people.
References: our own pencil sketches of the shop counter.`

const HEARTH_BRIEF = `Need a 6-second loop of bread coming out of the oven for Hearth & Rye.
Square, for Instagram. Warm, handheld, no people.
Budget is $350. Need it this weekend.
End card should have the bakery name. I'll send the logo later if I find it.`

const SODA_BRIEF = `I want a 15-second ad that looks exactly like Zendaya opening our can, wearing a Nike jacket, with the Beatles song Come Together under it.
Budget $200. Tomorrow.`

async function main() {
  process.env.STUDIO_OPERATOR_MODE = "mock"
  process.env.STUDIO_ANALYSIS_MODE = "mock"
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_COMPAT_API_KEY
  const repo = new PrismaJobRepository(prisma)

  const northline = computeProfitability({
    clientPriceCents: 220_000,
    estimatedGenerationCents: 61_800,
    contingencyBps: 1500,
    channelFeeBps: 0,
  })
  assert.equal(northline.contingencyCents, 9270)
  assert.equal(northline.channelFeeCents, 0)
  assert.equal(northline.expectedGrossMarginCents, 148_930)

  const fiverr = computeProfitability({
    clientPriceCents: 35_000,
    estimatedGenerationCents: 15_100,
    contingencyBps: 1500,
    channelFeeBps: 2000,
  })
  assert.equal(fiverr.channelFeeCents, 7000)
  assert.equal(fiverr.contingencyCents, 2265)
  assert.equal(fiverr.expectedGrossMarginCents, 10_635)

  assert.throws(() => assertAllowedOperation("marketplace.submit_proposal"), /guardrail/)
  assert.throws(() => assertAllowedOperation("marketplace.scrape"), /guardrail/)
  assert.throws(() => assertAllowedOperation("marketplace.deliver"), /guardrail/)
  for (const operation of PRODUCT_GUARDRAILS.allowed) {
    assert.doesNotThrow(() => assertAllowedOperation(operation))
  }

  const clean = await analyzeBrief({
    rawBrief: CLEAN_BRIEF,
    budgetCents: 180_000,
    deadlineIso: "2026-10-20T12:00:00.000Z",
    assetLabels: ["Shop counter sketch"],
    channelFeeBps: 0,
  })
  assert.equal(clean.document.decision, "accept", clean.document.decisionReasons.join(" "))
  assert.ok(clean.document.deliverables.length >= 2)
  assert.ok(clean.document.deliverables.some((item) => item.exactText.includes("Northwind")))
  assert.match(clean.modelLabel, /GPT-6 Astra/)
  assert.equal(clean.provider, "mock")
  assert.equal(clean.document.costing.pricesComplete, true)

  const hearth = await analyzeBrief({
    rawBrief: HEARTH_BRIEF,
    budgetCents: 35_000,
    deadlineIso: "2026-09-28T12:00:00.000Z",
    assetLabels: [],
    channelFeeBps: 2000,
  })
  assert.equal(hearth.document.decision, "human_review", hearth.document.decisionReasons.join(" "))

  const soda = await analyzeBrief({
    rawBrief: SODA_BRIEF,
    budgetCents: 20_000,
    deadlineIso: "2026-09-26T12:00:00.000Z",
    assetLabels: [],
    channelFeeBps: 2000,
  })
  assert.equal(soda.document.decision, "reject", soda.document.decisionReasons.join(" "))
  assert.ok(soda.document.rightsAndConsentFlags.length >= 2)

  const job = await intakeJob(repo, {
    title: "Northwind brand film",
    source: "email",
    rawBrief: CLEAN_BRIEF,
    budgetCents: 180_000,
    deadline: new Date("2026-10-20T12:00:00.000Z"),
    clientNotes: "Confirm scope before production.",
    assets: [{ label: "Shop counter sketch", url: "https://files.example.com/northwind/sketch.png", kind: "image" }],
  })
  assert.equal(job.status, "new")
  await analyzeJob(repo, job.id)
  await planJob(repo, job.id)
  await updateCommercials(repo, job.id, { channelFeeBps: 1000, contingencyBps: 2000 })
  let detail = await repo.getJob(job.id)
  assert.ok(detail)
  assert.equal(detail.analysis?.decision, "accept")
  assert.equal(detail.status, "needs_review")
  const kinds = new Set(detail.steps.map((step) => step.modelKind))
  for (const kind of ["image", "video", "voice", "editing", "finishing"]) {
    assert.ok(kinds.has(kind), `missing ${kind}`)
  }
  assert.ok(detail.steps.some((step) => step.selectedModel === "alibaba/qwen-image-3/edit"))
  assert.ok(detail.steps.some((step) => step.selectedModel === "kling-video/v3.0/pro/text-to-video"))
  assert.ok(detail.steps.every((step) => step.whyFit && step.failureMode && step.alternativeModel && step.routeRole))
  assert.equal(
    estimatedGenerationCents(detail.steps),
    detail.steps.reduce((sum, step) => sum + step.unitCostCents * step.estimatedAttempts, 0),
  )
  const estimate = estimatedGenerationCents(detail.steps)
  const priced = computeProfitability({
    clientPriceCents: detail.budgetCents,
    estimatedGenerationCents: estimate,
    contingencyBps: detail.contingencyBps,
    channelFeeBps: detail.channelFeeBps,
  })
  assert.equal(priced.channelFeeCents, 18_000)
  assert.ok(priced.expectedGrossMarginCents < detail.budgetCents)
  await approveWorkflowAndBudget(repo, job.id, estimate + priced.contingencyCents)
  await runGeneration(repo, job.id)
  detail = await repo.getJob(job.id)
  assert.ok(detail)
  assert.equal(detail.status, "qa")
  assert.ok(detail.generations.every((generation) => generation.status === "succeeded" && generation.outputUrl))
  assert.ok(detail.approvals.some((gate) => gate.kind === "final_delivery" && gate.status === "required"))
  await addRevision(repo, job.id, {
    clientNote: "Cool the grade a little.",
    affectedDeliverable: detail.analysis?.effective.deliverables[0]?.name ?? "Whole job",
  })
  detail = await repo.getJob(job.id)
  assert.equal(detail?.revisions[0]?.approvalStatus, "pending")
  await decideRevision(repo, job.id, detail!.revisions[0]!.id, "approved")
  await approveDelivery(repo, job.id)
  detail = await repo.getJob(job.id)
  assert.equal(detail?.status, "delivered")
  assert.equal(
    detail?.approvals.find((gate) => gate.kind === "final_delivery")?.status,
    "approved",
  )

  const tight = await intakeJob(repo, {
    title: "Northwind tight budget",
    source: "email",
    rawBrief: CLEAN_BRIEF,
    budgetCents: 180_000,
    deadline: new Date("2026-10-20T12:00:00.000Z"),
    clientNotes: "",
    assets: [],
  })
  await analyzeJob(repo, tight.id)
  await planJob(repo, tight.id)
  const tightDetail = await repo.getJob(tight.id)
  assert.ok(tightDetail)
  const tightEstimate = estimatedGenerationCents(tightDetail.steps)
  await approveWorkflowAndBudget(repo, tight.id, tightEstimate)
  await runGeneration(repo, tight.id)
  await addRevision(repo, tight.id, {
    clientNote: "Please reshoot the opening.",
    affectedDeliverable: "Motion coverage",
  })
  const tightAfter = await repo.getJob(tight.id)
  const revision = tightAfter?.revisions[0]
  assert.ok(revision)
  await assert.rejects(() => decideRevision(repo, tight.id, revision.id, "approved"), /budget/)
  const blocked = await repo.getJob(tight.id)
  assert.ok(blocked?.approvals.some((gate) => gate.kind === "budget_increase" && gate.status === "required"))
  assert.equal(blocked?.revisions[0]?.approvalStatus, "pending")
  await approveBudgetIncrease(repo, tight.id, tightEstimate + revision.expectedIncrementalCents)
  await decideRevision(repo, tight.id, revision.id, "approved")

  const changed = await intakeJob(repo, {
    title: "Northwind plan change",
    source: "contra",
    rawBrief: CLEAN_BRIEF,
    budgetCents: 180_000,
    deadline: new Date("2026-10-22T12:00:00.000Z"),
    clientNotes: "",
    assets: [],
  })
  await analyzeJob(repo, changed.id)
  await planJob(repo, changed.id)
  const changedPlan = await repo.getJob(changed.id)
  assert.ok(changedPlan)
  await approveWorkflowAndBudget(
    repo,
    changed.id,
    estimatedGenerationCents(changedPlan.steps) + 1000,
  )
  await requestWorkflowChange(repo, changed.id, "Drop the voice line and add a second cutdown.")
  await assert.rejects(() => planJob(repo, changed.id), /workflow change/)
  await assert.rejects(() => runGeneration(repo, changed.id), /approved|blocked|waiting|workflow/i)
  await approveWorkflowChange(repo, changed.id)
  await planJob(repo, changed.id)
  const rebuilt = await repo.getJob(changed.id)
  assert.equal(rebuilt?.status, "needs_review")
  assert.equal(
    rebuilt?.approvals.filter((gate) => gate.kind === "workflow_budget").at(-1)?.status,
    "required",
  )

  const bad = await intakeJob(repo, {
    title: "Lookalike test",
    source: "fiverr",
    rawBrief: SODA_BRIEF,
    budgetCents: 20_000,
    deadline: new Date("2026-09-26T12:00:00.000Z"),
    clientNotes: "",
    assets: [],
  })
  await analyzeJob(repo, bad.id)
  const badDetail = await repo.getJob(bad.id)
  assert.equal(badDetail?.status, "rejected")
  assert.equal(badDetail?.analysis?.decision, "reject")
  assert.ok(badDetail?.approvals.some((gate) => gate.kind === "rights" && gate.status === "required"))
  await assert.rejects(() => runGeneration(repo, bad.id), /cannot generate|approved|Rejected/)

  process.env.STUDIO_OPERATOR_MODE = "live"
  await assert.rejects(
    () =>
      requestHiggsfieldGeneration({
        model: "higgsfield/dop",
        title: "Live",
        subtitle: "Should not send",
        kind: "video",
        costEstimateCents: 100,
      }),
    /No request was sent/,
  )
  process.env.STUDIO_OPERATOR_MODE = "mock"
  process.env.STUDIO_ANALYSIS_MODE = "mock"

  const listed = await repo.listSummaries()
  assert.ok(listed.some((item) => item.id === job.id && item.status === "delivered"))
  console.log("smoke ok")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
