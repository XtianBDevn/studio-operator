import { finalizeAnalysis, validateAnalysisDraft, type StoredAnalysis } from "@/lib/analysis"
import { demoById, demoDeadline, isDemoJobId } from "@/lib/demos"
import { assertAllowedOperation } from "@/lib/guardrails"
import { evaluateQa, isConditionalRepair, type QaEvaluation } from "@/lib/qa"
import { recordingPause, type RecordingSnapshot } from "@/lib/recording"
import { StudioError } from "@/lib/errors"
import { computeProfitability } from "@/lib/profitability"
import { defaultChannelFeeBps, isSourceId, type SourceId } from "@/lib/sources"
import type { Decision, JobDetail } from "@/lib/types"
import { estimatedGenerationCents, spentGenerationCents } from "@/lib/types"
import { canRebuildPlan, hasOpenGate } from "@/lib/workflow-policy"
import type { JobRepository } from "@/server/repositories/job-repository"
import { catalogPrices, produceAnalysis, targetMarginBpsFromEnv } from "@/server/services/analyze-brief"
import { draftClientDeliveryNote } from "@/server/services/delivery-note"
import { MODEL_CATALOG } from "@/server/services/models"
import { planFromAnalysis } from "@/server/services/plan-from-analysis"
import { applyOverride, linesFromStored, maxSpendCents, restage } from "@/lib/route"
import { requestHiggsfieldGeneration, localPreviewGeneration } from "@/server/services/providers"
import {
  cancelGeneration,
  refreshGenerationStatus,
  retryGeneration,
  runLiveSteps,
} from "@/server/services/live-generation"
import { readHiggsfieldCredentials } from "@/server/services/higgsfield"
import { recommendRevision } from "@/server/services/revisions"

const DEFAULT_CONTINGENCY_BPS = 1500

async function mustGet(repo: JobRepository, id: string): Promise<JobDetail> {
  const job = await repo.getJob(id)
  if (!job) throw new StudioError("Job not found.")
  return job
}

function withHumanDecision(document: StoredAnalysis, decision: Decision, note: string): StoredAnalysis {
  const decisionReasons = document.decisionReasons.filter((reason) => reason !== note)
  return { ...document, decision, decisionReasons: [...decisionReasons, note] }
}

function assertBps(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new StudioError(`${label} must be between 0% and 100%.`)
  }
}

export async function intakeJob(
  repo: JobRepository,
  input: {
    title: string
    source: string
    rawBrief: string
    budgetCents: number
    deadline: Date | null
    clientNotes: string
    assets: Array<{ label: string; url: string; kind: string }>
  },
): Promise<JobDetail> {
  assertAllowedOperation("intake.paste_brief")
  const title = input.title.trim()
  const rawBrief = input.rawBrief.trim()
  if (title.length < 3) throw new StudioError("Add a short working title.")
  if (rawBrief.length < 20) throw new StudioError("Paste the brief. A few words is not enough to qualify.")
  if (!Number.isInteger(input.budgetCents) || input.budgetCents <= 0) {
    throw new StudioError("Enter a client price greater than zero.")
  }
  if (!isSourceId(input.source)) throw new StudioError("Choose an intake source.")

  return repo.createJob({
    title,
    source: input.source,
    rawBrief,
    budgetCents: input.budgetCents,
    deadline: input.deadline,
    clientNotes: input.clientNotes.trim(),
    channelFeeBps: defaultChannelFeeBps(input.source),
    contingencyBps: DEFAULT_CONTINGENCY_BPS,
    status: "new",
    assets: input.assets,
  })
}

export async function analyzeJob(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("analysis.structure_requirements")
  const job = await mustGet(repo, jobId)
  if (!["new", "needs_review", "rejected"].includes(job.status)) {
    throw new StudioError("Analysis is closed once production has been approved.")
  }

  const analysis = await produceAnalysis({
    rawBrief: job.rawBrief,
    budgetCents: job.budgetCents,
    deadlineIso: job.deadline,
    assetLabels: job.assets.map((asset) => asset.label),
    channelFeeBps: job.channelFeeBps,
    contingencyBps: job.contingencyBps,
  })
  await repo.saveAnalysis(jobId, analysis)

  if (analysis.document.rightsAndConsentFlags.length > 0) {
    await repo.openGate({
      jobId,
      kind: "rights",
      summary: "Rights concern needs a person",
      detail: analysis.document.rightsAndConsentFlags.join(" "),
    })
  }

  await repo.updateJob(jobId, {
    status: analysis.document.decision === "reject" ? "rejected" : "needs_review",
  })
}

export async function setHumanDecision(
  repo: JobRepository,
  jobId: string,
  decision: Decision,
): Promise<void> {
  assertAllowedOperation("decision.qualify")
  const job = await mustGet(repo, jobId)
  if (!job.analysis) throw new StudioError("Analyze the brief before overriding the decision.")
  if (["generating", "qa", "delivered"].includes(job.status)) {
    throw new StudioError("The qualification is locked while work is in production or already delivered.")
  }

  const note =
    decision === "accept"
      ? "A person accepted the job for planning. Workflow and budget still need approval."
      : decision === "human_review"
        ? "A person sent the job back to human review."
        : "A person rejected the job. No proposal was sent."
  await repo.saveEditedAnalysis(jobId, withHumanDecision(job.analysis.effective, decision, note))
  await repo.updateJob(jobId, {
    status: decision === "reject" ? "rejected" : "needs_review",
  })
}

export async function saveHumanAnalysis(
  repo: JobRepository,
  jobId: string,
  raw: unknown,
  intent: "save" | "approve" | "reject",
): Promise<void> {
  assertAllowedOperation("decision.qualify")
  const job = await mustGet(repo, jobId)
  if (!job.analysis) throw new StudioError("Analyze the brief before editing it.")
  if (["generating", "qa", "delivered"].includes(job.status)) {
    throw new StudioError("The analysis is locked while work is in production or already delivered.")
  }

  let draft
  try {
    draft = validateAnalysisDraft(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analysis."
    throw new StudioError(`${message} Nothing was saved.`)
  }
  draft = {
    ...draft,
    decisionReasons: draft.decisionReasons.filter((reason) => !reason.startsWith("Desk:")),
  }
  let document = finalizeAnalysis(draft, {
    clientPriceCents: job.budgetCents,
    channelFeeBps: job.channelFeeBps,
    contingencyBps: job.contingencyBps,
    deadlineIso: job.deadline,
    targetMarginBps: targetMarginBpsFromEnv(),
    catalog: catalogPrices(),
  })
  if (intent === "approve") {
    document = withHumanDecision(
      document,
      "accept",
      "A person approved this analysis for planning. Workflow and budget still need approval.",
    )
  } else if (intent === "reject") {
    document = withHumanDecision(
      document,
      "reject",
      "A person rejected this analysis. No proposal was sent.",
    )
  }

  await repo.saveEditedAnalysis(jobId, document)
  if (document.rightsAndConsentFlags.length > 0 && !hasOpenGate(job.approvals, "rights")) {
    await repo.openGate({
      jobId,
      kind: "rights",
      summary: "Rights concern needs a person",
      detail: document.rightsAndConsentFlags.join(" "),
    })
  }
  await repo.updateJob(jobId, {
    status: document.decision === "reject" ? "rejected" : "needs_review",
  })
}

export async function planJob(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("workflow.plan")
  const job = await mustGet(repo, jobId)
  if (!job.analysis) throw new StudioError("Analyze the brief before building a plan.")
  if (job.analysis.decision === "reject" || job.status === "rejected") {
    throw new StudioError("This job is rejected. Change the decision before planning.")
  }
  if (!canRebuildPlan(job)) {
    throw new StudioError(
      "The approved plan is locked. Request a material workflow change and approve it before rebuilding.",
    )
  }

  const steps = planFromAnalysis(job.analysis.effective, {
    rawBrief: job.rawBrief,
    deadlineIso: job.deadline,
    referenceCount: job.assets.length,
  })
  if (steps.length === 0) throw new StudioError("The brief did not produce any production steps.")

  await repo.replaceSteps(jobId, steps)
  const total = steps.reduce((sum, step) => sum + step.estimatedTotalCents, 0)
  await repo.openGate({
    jobId,
    kind: "workflow_budget",
    summary: "Approve the plan and a maximum production budget",
    detail: `Estimated generation spend is ${(total / 100).toFixed(2)} USD before contingency. Generation cannot start until this gate is approved.`,
  })
  await repo.updateJob(jobId, { status: "needs_review", maxBudgetCents: null })
}

export async function saveRouteOverrides(
  repo: JobRepository,
  jobId: string,
  patches: Array<{ position: number; modelId: string; attempts: number }>,
): Promise<void> {
  assertAllowedOperation("workflow.plan")
  const job = await mustGet(repo, jobId)
  if (!canRebuildPlan(job)) {
    throw new StudioError("The approved route is locked. Approve a workflow change before changing models or spend.")
  }
  if (!hasOpenGate(job.approvals, "workflow_budget")) {
    throw new StudioError("Build a plan before changing the route. Approval still has to cover the new maximum.")
  }
  if (job.steps.length === 0) throw new StudioError("Build a production plan first.")

  const current = linesFromStored(job.steps)
  const overridden = current.map((line) => {
    const patch = patches.find((item) => item.position === line.position)
    if (!patch) return line
    const next = applyOverride(line, patch)
    if (!next) throw new StudioError(`Model ${patch.modelId} is not in the capability catalog.`)
    return next
  })
  const ordered = restage(overridden)
  const outputs = job.analysis?.effective.deliverables.map((item) => item.name).slice(0, 4) ?? []
  await repo.replaceSteps(
    jobId,
    ordered.map((line) => ({
      position: line.position,
      name: line.name,
      selectedModel: line.modelId,
      modelKind: line.capability,
      purpose: line.why,
      inputs: [
        "Approved brief",
        `Route ${line.stage}`,
        `Role ${line.role}`,
        `Alternative ${line.alternativeLabel}`,
      ],
      expectedOutputs: outputs.length > 0 ? outputs : [line.name],
      estimatedAttempts: line.attempts,
      unitCostCents: line.unitCostCents,
      estimatedTotalCents: line.lineCents,
      routeStage: line.stage,
      routeRole: line.role,
      whyFit: line.why,
      failureMode: line.failureMode,
      alternativeModel: line.alternativeModelId,
      docsUrl: line.docsUrl,
      substituteNote: line.substituteNote,
    })),
  )
  const total = maxSpendCents(ordered)
  await repo.openGate({
    jobId,
    kind: "workflow_budget",
    summary: "Approve the plan and a maximum production budget",
    detail: `Estimated generation spend is ${(total / 100).toFixed(2)} USD before contingency. Generation cannot start until this gate is approved.`,
  })
  await repo.updateJob(jobId, { status: "needs_review", maxBudgetCents: null })
}

export async function updatePackagePrice(
  repo: JobRepository,
  jobId: string,
  budgetCents: number,
): Promise<void> {
  assertAllowedOperation("cost.estimate")
  const job = await mustGet(repo, jobId)
  if (job.status === "delivered") throw new StudioError("The package price is locked after delivery.")
  if (!Number.isInteger(budgetCents) || budgetCents < 1) {
    throw new StudioError("Enter a package price above zero.")
  }
  await repo.updateJob(jobId, { budgetCents })
}

export async function updateCommercials(
  repo: JobRepository,
  jobId: string,
  input: { channelFeeBps: number; contingencyBps: number },
): Promise<void> {
  assertAllowedOperation("cost.estimate")
  const job = await mustGet(repo, jobId)
  if (job.status === "delivered") {
    throw new StudioError("Commercial terms are locked after delivery.")
  }
  assertBps(input.channelFeeBps, "Channel fee")
  assertBps(input.contingencyBps, "Contingency")
  await repo.updateJob(jobId, {
    channelFeeBps: input.channelFeeBps,
    contingencyBps: input.contingencyBps,
  })
}

export async function approveWorkflowAndBudget(
  repo: JobRepository,
  jobId: string,
  maxBudgetCents: number,
): Promise<void> {
  assertAllowedOperation("approval.human")
  const job = await mustGet(repo, jobId)
  if (!job.analysis || job.analysis.decision === "reject") {
    throw new StudioError("Approve a job only after a non-reject decision.")
  }
  if (job.steps.length === 0) throw new StudioError("Build a production plan first.")
  if (hasOpenGate(job.approvals, "rights")) {
    throw new StudioError("Clear the rights issue before approving production.")
  }
  if (hasOpenGate(job.approvals, "workflow_change")) {
    throw new StudioError("Resolve the workflow change before approving a budget.")
  }
  if (!hasOpenGate(job.approvals, "workflow_budget")) {
    throw new StudioError("There is no open workflow approval.")
  }
  const estimate = estimatedGenerationCents(job.steps)
  if (!Number.isInteger(maxBudgetCents) || maxBudgetCents < estimate) {
    throw new StudioError("The maximum production budget must cover the estimated generation spend.")
  }

  await repo.resolveGate(
    jobId,
    "workflow_budget",
    "approved",
    `Maximum production budget set to ${(maxBudgetCents / 100).toFixed(2)} USD. The desk may generate only inside this limit.`,
  )
  await repo.updateAllSteps(jobId, { approvalStatus: "approved", status: "ready" })
  await repo.updateJob(jobId, { status: "approved", maxBudgetCents })
}

export async function clearRights(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("approval.human")
  const job = await mustGet(repo, jobId)
  if (!hasOpenGate(job.approvals, "rights")) {
    throw new StudioError("There is no open rights approval.")
  }
  await repo.resolveGate(
    jobId,
    "rights",
    "approved",
    "A person cleared the rights concern for production inside this desk. This does not grant a marketplace license.",
  )
}

export async function runGeneration(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("generation.run_within_limits")
  const job = await mustGet(repo, jobId)
  if (job.status !== "approved" && job.status !== "generating") {
    throw new StudioError("Generation runs only after the workflow and budget are approved.")
  }
  if (job.analysis?.decision === "reject") throw new StudioError("Rejected jobs cannot generate.")
  if (hasOpenGate(job.approvals, "rights")) {
    throw new StudioError("Generation is blocked until the rights issue is cleared.")
  }
  if (hasOpenGate(job.approvals, "workflow_change")) {
    throw new StudioError("Generation is blocked while a workflow change is waiting.")
  }
  if (hasOpenGate(job.approvals, "budget_increase")) {
    throw new StudioError("Generation is blocked until the budget increase is approved or dropped.")
  }
  if (job.maxBudgetCents == null) {
    throw new StudioError("Set a maximum production budget before generating.")
  }
  if (process.env.STUDIO_OPERATOR_MODE === "live" && !readHiggsfieldCredentials()) {
    throw new StudioError("Higgsfield credentials are not configured on the server. No request was sent.")
  }

  const pending = job.steps.filter((step) => {
    if (step.approvalStatus !== "approved") return false
    if (isConditionalRepair(step.purpose)) return false
    return !job.generations.some(
      (generation) => generation.stepId === step.id && generation.status === "succeeded",
    )
  })
  if (pending.length === 0) throw new StudioError("Every approved step already has an output.")

  const freshCost = pending.reduce((sum, step) => {
    const open = job.generations.find(
      (generation) =>
        generation.stepId === step.id &&
        (generation.status === "running" || generation.status === "queued"),
    )
    return open ? sum : sum + step.estimatedTotalCents
  }, 0)
  const committed = spentGenerationCents(job.generations)
  if (committed + freshCost > job.maxBudgetCents) {
    await repo.openGate({
      jobId,
      kind: "budget_increase",
      summary: "Generation would exceed the approved maximum",
      detail: `Committed ${(committed / 100).toFixed(2)} USD plus ${(freshCost / 100).toFixed(2)} USD exceeds the ${(job.maxBudgetCents / 100).toFixed(2)} USD cap.`,
    })
    throw new StudioError(
      "That run exceeds the approved production budget. Approve a higher maximum, or change the plan.",
    )
  }

  await repo.updateJob(jobId, { status: "generating" })

  if (process.env.STUDIO_OPERATOR_MODE === "live") {
    await runLiveSteps(repo, job)
  } else {
    await runMockSteps(repo, job, pending)
  }

  await finishIfReady(repo, jobId)
}

async function runMockSteps(
  repo: JobRepository,
  job: JobDetail,
  pending: JobDetail["steps"],
): Promise<void> {
  for (const step of pending) {
    const running = job.generations.find(
      (generation) =>
        generation.stepId === step.id &&
        (generation.status === "running" || generation.status === "queued"),
    )
    await repo.updateStep(step.id, { status: "running" })
    const result = await requestHiggsfieldGeneration({
      model: step.selectedModel,
      title: job.title,
      subtitle: step.name,
      kind: step.modelKind,
      costEstimateCents: running?.costEstimateCents ?? step.estimatedTotalCents,
    })
    const settingsJson = JSON.stringify({
      mode: "mock",
      model: step.selectedModel,
      kind: step.modelKind,
      purpose: step.purpose,
    })
    if (running) {
      await repo.completeGeneration(running.id, {
        status: "succeeded",
        actualCostCents: result.actualCostCents,
        outputUrl: result.outputUrl,
        error: null,
        completedAt: new Date(),
      })
      await repo.updateGeneration(running.id, { settingsJson, costSource: "mock", providerStatus: null })
    } else {
      await repo.createGeneration({
        jobId: job.id,
        stepId: step.id,
        providerRequestId: result.providerRequestId,
        model: step.selectedModel,
        status: "succeeded",
        costEstimateCents: step.estimatedTotalCents,
        actualCostCents: result.actualCostCents,
        outputUrl: result.outputUrl,
        error: null,
        settingsJson,
        costSource: "mock",
        completedAt: new Date(),
      })
    }
    await repo.updateStep(step.id, { status: "complete" })
  }
}

export async function cancelJobGeneration(
  repo: JobRepository,
  jobId: string,
  generationId: string,
): Promise<void> {
  assertAllowedOperation("generation.run_within_limits")
  await cancelGeneration(repo, jobId, generationId)
  await finishIfReady(repo, jobId)
}

export async function retryJobGeneration(
  repo: JobRepository,
  jobId: string,
  generationId: string,
): Promise<void> {
  assertAllowedOperation("generation.run_within_limits")
  await retryGeneration(repo, jobId, generationId)
  await finishIfReady(repo, jobId)
}

export async function refreshJobGeneration(
  repo: JobRepository,
  jobId: string,
  generationId: string,
): Promise<void> {
  assertAllowedOperation("generation.run_within_limits")
  await refreshGenerationStatus(repo, jobId, generationId)
  await finishIfReady(repo, jobId)
}

async function finishIfReady(repo: JobRepository, jobId: string): Promise<void> {
  const refreshed = await mustGet(repo, jobId)
  const finished = refreshed.steps
    .filter((step) => step.approvalStatus === "approved" && !isConditionalRepair(step.purpose))
    .every((step) =>
      refreshed.generations.some(
        (generation) => generation.stepId === step.id && generation.status === "succeeded",
      ),
    )
  if (finished) {
    await repo.updateJob(jobId, { status: "qa" })
    await repo.openGate({
      jobId,
      kind: "final_delivery",
      summary: "Final delivery needs a person",
      detail:
        "Approving delivery records the job as delivered in Studio Operator. It does not upload files to a marketplace.",
    })
  }
}

export async function addRevision(
  repo: JobRepository,
  jobId: string,
  input: { clientNote: string; affectedDeliverable: string },
): Promise<void> {
  assertAllowedOperation("qa.revision_notes")
  const job = await mustGet(repo, jobId)
  if (job.status !== "qa") throw new StudioError("Revision notes are collected during QA.")
  const clientNote = input.clientNote.trim()
  const affectedDeliverable = input.affectedDeliverable.trim()
  if (clientNote.length < 3) throw new StudioError("Write the client note.")
  if (!affectedDeliverable) throw new StudioError("Name the affected deliverable.")

  const recommendation = recommendRevision({
    clientNote,
    affectedDeliverable,
    stepCosts: job.steps.map((step) => ({
      name: step.name,
      modelKind: step.modelKind,
      estimatedTotalCents: step.estimatedTotalCents,
    })),
  })
  await repo.createRevision({
    jobId,
    clientNote,
    affectedDeliverable,
    recommendedAction: recommendation.recommendedAction,
    expectedIncrementalCents: recommendation.expectedIncrementalCents,
    approvalStatus: "pending",
  })
}

export async function decideRevision(
  repo: JobRepository,
  jobId: string,
  revisionId: string,
  approval: "approved" | "rejected",
): Promise<void> {
  assertAllowedOperation("approval.human")
  const job = await mustGet(repo, jobId)
  if (job.status !== "qa") throw new StudioError("Revisions are decided during QA.")
  const revision = job.revisions.find((item) => item.id === revisionId)
  if (!revision || revision.approvalStatus !== "pending") {
    throw new StudioError("That revision is not waiting for approval.")
  }
  if (approval === "rejected") {
    await repo.updateRevision(revisionId, "rejected")
    return
  }
  if (job.maxBudgetCents == null) throw new StudioError("This job has no approved budget.")
  const spent = spentGenerationCents(job.generations)
  if (spent + revision.expectedIncrementalCents > job.maxBudgetCents) {
    await repo.openGate({
      jobId,
      kind: "budget_increase",
      summary: "Revision exceeds the approved maximum",
      detail: `Spent ${(spent / 100).toFixed(2)} USD plus ${(revision.expectedIncrementalCents / 100).toFixed(2)} USD exceeds the ${(job.maxBudgetCents / 100).toFixed(2)} USD cap.`,
    })
    throw new StudioError(
      "Approving this revision would exceed the production budget. Raise the maximum first.",
    )
  }

  const live = process.env.STUDIO_OPERATOR_MODE === "live"
  const result = live
    ? localPreviewGeneration({
        model: MODEL_CATALOG.finishing.id,
        title: job.title,
        subtitle: revision.affectedDeliverable,
        kind: "finishing",
        costEstimateCents: revision.expectedIncrementalCents,
      })
    : await requestHiggsfieldGeneration({
        model: MODEL_CATALOG.finishing.id,
        title: job.title,
        subtitle: revision.affectedDeliverable,
        kind: "finishing",
        costEstimateCents: revision.expectedIncrementalCents,
      })
  await repo.updateRevision(revisionId, "approved")
  await repo.createGeneration({
    jobId,
    stepId: null,
    providerRequestId: result.providerRequestId,
    model: MODEL_CATALOG.finishing.id,
    status: "succeeded",
    costEstimateCents: revision.expectedIncrementalCents,
    actualCostCents: result.actualCostCents,
    outputUrl: result.outputUrl,
    error: null,
    costSource: live ? "local_preview" : "mock",
    settingsJson: JSON.stringify({
      mode: live ? "local_preview" : "mock",
      model: MODEL_CATALOG.finishing.id,
      kind: "finishing",
      note: "Finishing has no verified Higgsfield endpoint.",
    }),
    completedAt: new Date(),
  })
}

export async function requestWorkflowChange(
  repo: JobRepository,
  jobId: string,
  reason: string,
): Promise<void> {
  assertAllowedOperation("approval.human")
  const job = await mustGet(repo, jobId)
  if (!["approved", "generating", "qa"].includes(job.status)) {
    throw new StudioError("A workflow change applies only after the first plan is approved.")
  }
  const note = reason.trim()
  if (note.length < 3) throw new StudioError("Say what needs to change.")
  await repo.openGate({
    jobId,
    kind: "workflow_change",
    summary: "Material workflow change needs a person",
    detail: note,
  })
  await repo.updateAllSteps(jobId, { approvalStatus: "changes_requested", status: "blocked" })
  await repo.updateJob(jobId, { status: "needs_review" })
}

export async function approveWorkflowChange(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("approval.human")
  const job = await mustGet(repo, jobId)
  if (!hasOpenGate(job.approvals, "workflow_change")) {
    throw new StudioError("There is no open workflow change.")
  }
  await repo.resolveGate(
    jobId,
    "workflow_change",
    "approved",
    "A person approved replacing the plan. Rebuild the plan, then approve the new budget before generating.",
  )
}

export async function approveBudgetIncrease(
  repo: JobRepository,
  jobId: string,
  maxBudgetCents: number,
): Promise<void> {
  assertAllowedOperation("approval.human")
  const job = await mustGet(repo, jobId)
  if (!hasOpenGate(job.approvals, "budget_increase")) {
    throw new StudioError("There is no open budget increase.")
  }
  if (job.maxBudgetCents != null && maxBudgetCents <= job.maxBudgetCents) {
    throw new StudioError("The new maximum has to be higher than the current one.")
  }
  await repo.updateJob(jobId, { maxBudgetCents })
  await repo.resolveGate(
    jobId,
    "budget_increase",
    "approved",
    `Maximum production budget raised to ${(maxBudgetCents / 100).toFixed(2)} USD.`,
  )
}

export async function approveDelivery(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("delivery.record_internal")
  const job = await mustGet(repo, jobId)
  if (job.status !== "qa") throw new StudioError("Delivery is available from QA.")
  if (job.revisions.some((revision) => revision.approvalStatus === "pending")) {
    throw new StudioError("Decide the open revision notes before delivery.")
  }
  if (
    hasOpenGate(job.approvals, "rights") ||
    hasOpenGate(job.approvals, "budget_increase") ||
    hasOpenGate(job.approvals, "qa_repair")
  ) {
    throw new StudioError("Resolve open rights, budget, and QA repair approvals before delivery.")
  }
  if (!hasOpenGate(job.approvals, "final_delivery")) {
    await repo.openGate({
      jobId,
      kind: "final_delivery",
      summary: "Final delivery needs a person",
      detail:
        "Approving delivery records the job as delivered in Studio Operator. It does not upload files to a marketplace.",
    })
  }
  await repo.resolveGate(
    jobId,
    "final_delivery",
    "approved",
    "Delivered inside Studio Operator. No marketplace upload was performed.",
  )
  await repo.updateJob(jobId, { status: "delivered" })
}

export async function rejectJob(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("decision.qualify")
  const job = await mustGet(repo, jobId)
  if (job.status === "delivered") throw new StudioError("Delivered jobs stay on the record.")
  if (job.analysis) {
    await repo.saveEditedAnalysis(
      jobId,
      withHumanDecision(
        job.analysis.effective,
        "reject",
        "A person rejected the job before delivery. No marketplace message was sent.",
      ),
    )
  }
  await repo.updateJob(jobId, { status: "rejected" })
}

export async function appendClientNote(
  repo: JobRepository,
  jobId: string,
  note: string,
): Promise<void> {
  assertAllowedOperation("intake.paste_brief")
  const job = await mustGet(repo, jobId)
  const next = note.trim()
  if (next.length < 2) throw new StudioError("Write a note.")
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
  const combined = job.clientNotes ? `${job.clientNotes}\n${stamp} UTC — ${next}` : next
  await repo.updateJob(jobId, { clientNotes: combined })
}

export function marginForJob(job: Pick<
  JobDetail,
  "budgetCents" | "steps" | "contingencyBps" | "channelFeeBps" | "generations" | "maxBudgetCents"
>) {
  return computeProfitability({
    clientPriceCents: job.budgetCents,
    estimatedGenerationCents: estimatedGenerationCents(job.steps),
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
    actualGenerationCents: job.generations.length
      ? spentGenerationCents(job.generations)
      : null,
    maxBudgetCents: job.maxBudgetCents,
  })
}

export function defaultSourceFee(source: SourceId): number {
  return defaultChannelFeeBps(source)
}

export function recordingSnapshot(job: JobDetail): RecordingSnapshot {
  return {
    status: job.status,
    hasAnalysis: Boolean(job.analysis),
    stepCount: job.steps.length,
    decision: job.analysis?.decision ?? null,
    openGates: job.approvals.filter((gate) => gate.status === "required").map((gate) => gate.kind),
    latestVerdict: job.qaReports[0]?.verdict ?? null,
  }
}

export async function runQa(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("qa.revision_notes")
  const job = await mustGet(repo, jobId)
  if (job.status !== "qa") throw new StudioError("QA runs after generation finishes.")
  if (hasOpenGate(job.approvals, "qa_repair")) {
    throw new StudioError("A QA repair is waiting for a person.")
  }
  const before = evaluateJobQa(job)
  if (before.verdict === "controlled_edit" && before.withinLimits) {
    await runApprovedRepair(repo, job, before)
    const refreshed = await mustGet(repo, jobId)
    const after = evaluateJobQa(refreshed)
    const spent = spentGenerationCents(refreshed.generations)
    await persistQa(repo, refreshed, {
      ...after,
      reason: before.reason,
      repairModelId: before.repairModelId,
      repairModelLabel: before.repairModelLabel,
      incrementalCents: before.incrementalCents,
      newTotalCents: spent,
      updatedMarginCents: marginAfter(refreshed, spent),
      withinLimits: true,
    }, true)
    if (after.verdict === "ready") await ensureDeliveryNote(repo, refreshed)
    return
  }
  if (before.verdict === "controlled_edit" && !before.withinLimits) {
    await repo.openGate({
      jobId,
      kind: "qa_repair",
      summary: "QA repair needs a person",
      detail: qaRepairDetail(before),
    })
  }
  await persistQa(repo, job, before, false)
  if (before.verdict === "ready") await ensureDeliveryNote(repo, job)
}

export async function approveQaRepair(
  repo: JobRepository,
  jobId: string,
  maxBudgetCents: number,
): Promise<void> {
  assertAllowedOperation("approval.human")
  const job = await mustGet(repo, jobId)
  if (!hasOpenGate(job.approvals, "qa_repair")) {
    throw new StudioError("There is no open QA repair.")
  }
  if (job.status !== "qa") throw new StudioError("QA repair is decided during QA.")
  const before = evaluateJobQa(job)
  if (!Number.isInteger(maxBudgetCents) || before.incrementalCents < 1) {
    throw new StudioError("Enter a maximum that covers the repair.")
  }
  const needed = spentGenerationCents(job.generations) + before.incrementalCents
  if (maxBudgetCents < needed) {
    throw new StudioError("The new maximum has to cover the spent cost plus this repair.")
  }
  await repo.updateJob(jobId, { maxBudgetCents })
  await repo.resolveGate(
    jobId,
    "qa_repair",
    "approved",
    `A person approved the repair. Maximum production budget is ${(maxBudgetCents / 100).toFixed(2)} USD.`,
  )
  const approved = await mustGet(repo, jobId)
  await runApprovedRepair(repo, approved, before)
  const refreshed = await mustGet(repo, jobId)
  const after = evaluateJobQa(refreshed)
  const spent = spentGenerationCents(refreshed.generations)
  await persistQa(repo, refreshed, {
    ...after,
    reason: before.reason,
    repairModelId: before.repairModelId,
    repairModelLabel: before.repairModelLabel,
    incrementalCents: before.incrementalCents,
    newTotalCents: spent,
    updatedMarginCents: marginAfter(refreshed, spent),
    withinLimits: true,
  }, true)
  if (after.verdict === "ready") await ensureDeliveryNote(repo, refreshed)
}

export async function continueRecording(repo: JobRepository, jobId: string): Promise<void> {
  const job = await mustGet(repo, jobId)
  const pause = recordingPause(recordingSnapshot(job))
  if (pause.id === "analysis") {
    assertAllowedOperation("analysis.structure_requirements")
    await analyzeJob(repo, jobId)
    const analyzed = await mustGet(repo, jobId)
    if (analyzed.analysis && analyzed.analysis.decision !== "reject" && analyzed.steps.length === 0) {
      await planJob(repo, jobId)
    }
    return
  }
  if (pause.id === "plan") {
    await planJob(repo, jobId)
    return
  }
  if (pause.id === "approval") {
    const estimate = estimatedGenerationCents(job.steps)
    const contingency = Math.round((estimate * job.contingencyBps) / 10_000)
    await approveWorkflowAndBudget(repo, jobId, estimate + contingency)
    return
  }
  if (pause.id === "generation") {
    await runGeneration(repo, jobId)
    return
  }
  if (pause.id === "qa") {
    await runQa(repo, jobId)
    return
  }
  if (pause.id === "repair") {
    const before = evaluateJobQa(job)
    const needed = spentGenerationCents(job.generations) + before.incrementalCents
    const nextMax = Math.max(job.maxBudgetCents ?? 0, needed)
    await approveQaRepair(repo, jobId, nextMax)
    return
  }
  if (pause.id === "delivery") {
    await approveDelivery(repo, jobId)
    return
  }
  throw new StudioError("This recording step is already finished.")
}

export async function resetDemoJob(repo: JobRepository, jobId: string, now = new Date()): Promise<void> {
  assertAllowedOperation("intake.paste_brief")
  if (!isDemoJobId(jobId)) throw new StudioError("Reset is only available for a seeded demo.")
  const spec = demoById(jobId)
  if (!spec) throw new StudioError("Reset is only available for a seeded demo.")
  const job = await mustGet(repo, jobId)
  if (job.status === "generating") throw new StudioError("Wait until generation finishes before resetting.")
  await repo.clearProduction(jobId)
  await repo.replaceAssets(jobId, spec.assets)
  await repo.updateJob(jobId, {
    status: "new",
    title: spec.title,
    rawBrief: spec.rawBrief,
    clientNotes: spec.clientNotes,
    channelFeeBps: spec.channelFeeBps,
    contingencyBps: spec.contingencyBps,
    maxBudgetCents: null,
    budgetCents: spec.budgetCents,
    deadline: demoDeadline(spec, now),
  })
}

function evaluateJobQa(job: JobDetail): QaEvaluation {
  return evaluateQa({
    brief: job.rawBrief,
    deliverables: job.analysis?.effective.deliverables ?? [],
    brandConstraints: job.analysis?.effective.brandConstraints ?? [],
    steps: job.steps.map((step) => ({
      id: step.id,
      name: step.name,
      purpose: step.purpose,
      capability: step.modelKind,
      selectedModel: step.selectedModel,
      unitCostCents: step.unitCostCents,
      estimatedAttempts: step.estimatedAttempts,
      estimatedTotalCents: step.estimatedTotalCents,
    })),
    generations: job.generations.map((generation) => ({
      stepId: generation.stepId,
      status: generation.status,
      model: generation.model,
      actualCostCents: generation.actualCostCents,
      costEstimateCents: generation.costEstimateCents,
    })),
    spentCents: spentGenerationCents(job.generations),
    maxBudgetCents: job.maxBudgetCents,
    clientPriceCents: job.budgetCents,
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
  })
}

async function persistQa(
  repo: JobRepository,
  job: JobDetail,
  evaluation: QaEvaluation,
  autoRepaired: boolean,
): Promise<void> {
  await repo.saveQaReport({
    jobId: job.id,
    checklistJson: JSON.stringify(evaluation.checklist),
    verdict: evaluation.verdict,
    reason: evaluation.reason,
    repairModelId: evaluation.repairModelId,
    repairModelLabel: evaluation.repairModelLabel,
    incrementalCents: evaluation.incrementalCents,
    newTotalCents: evaluation.newTotalCents,
    updatedMarginCents: evaluation.updatedMarginCents,
    withinLimits: evaluation.withinLimits,
    autoRepaired,
  })
}

async function runApprovedRepair(
  repo: JobRepository,
  job: JobDetail,
  evaluation: QaEvaluation,
): Promise<void> {
  assertAllowedOperation("generation.run_within_limits")
  const step = job.steps.find((item) => isConditionalRepair(item.purpose))
  if (!step || !evaluation.repairModelId) throw new StudioError("No approved continuity repair is on this plan.")
  const live = process.env.STUDIO_OPERATOR_MODE === "live"
  const result = localPreviewGeneration({
    model: step.selectedModel,
    title: job.title,
    subtitle: step.name,
    kind: step.modelKind,
    costEstimateCents: evaluation.incrementalCents,
  })
  await repo.createGeneration({
    jobId: job.id,
    stepId: step.id,
    providerRequestId: result.providerRequestId,
    model: step.selectedModel,
    status: "succeeded",
    costEstimateCents: evaluation.incrementalCents,
    actualCostCents: result.actualCostCents,
    outputUrl: result.outputUrl,
    error: null,
    costSource: live ? "local_preview" : "mock",
    settingsJson: JSON.stringify({
      mode: live ? "local_preview" : "mock",
      qaRepair: true,
      model: step.selectedModel,
      kind: step.modelKind,
      note: "QA repair preview. Seedance 2.5 video edit is not a wired live endpoint. No Higgsfield request was sent.",
    }),
    completedAt: new Date(),
  })
  await repo.updateStep(step.id, { status: "complete" })
}

async function ensureDeliveryNote(repo: JobRepository, job: JobDetail): Promise<void> {
  assertAllowedOperation("delivery.record_internal")
  const names = job.analysis?.effective.deliverables.map((item) => item.name) ?? []
  const drafted = await draftClientDeliveryNote({ title: job.title, deliverableNames: names })
  await repo.saveDeliveryNote({
    jobId: job.id,
    body: drafted.body,
    provider: drafted.provider,
    modelLabel: drafted.modelLabel,
  })
}

function marginAfter(job: JobDetail, spentCents: number): number {
  return computeProfitability({
    clientPriceCents: job.budgetCents,
    estimatedGenerationCents: spentCents,
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
    actualGenerationCents: spentCents,
    maxBudgetCents: job.maxBudgetCents,
  }).expectedGrossMarginCents
}

function qaRepairDetail(evaluation: QaEvaluation): string {
  const incremental = (evaluation.incrementalCents / 100).toFixed(2)
  const total = (evaluation.newTotalCents / 100).toFixed(2)
  const margin = (evaluation.updatedMarginCents / 100).toFixed(2)
  return `${evaluation.reason} Model ${evaluation.repairModelLabel ?? "unselected"}. Incremental ${incremental} USD. New total ${total} USD. Updated margin ${margin} USD. ${evaluation.blockReason ?? ""}`.trim()
}
