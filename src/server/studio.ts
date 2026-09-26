/**
 * Job state machine for brief → qualify → price → approve → route → generate → QA → deliver.
 * Status transitions stay here. Policy is called from the module owners in
 * `src/server/modules/owners.ts`: analysis, catalog, router, provider, QA, autonomy, audit.
 */
import { validateAnalysisDraft, type StoredAnalysis } from "@/lib/analysis"
import { demoById, demoDeadline, isDemoJobId } from "@/lib/demos"
import { assertAllowedOperation } from "@/lib/guardrails"
import { isConditionalRepair } from "@/lib/qa"
import { recordingPause, type RecordingSnapshot } from "@/lib/recording"
import { StudioError } from "@/lib/errors"
import { computeProfitability } from "@/lib/profitability"
import { applyOverride, linesFromStored, maxSpendCents, restage } from "@/lib/route"
import { defaultChannelFeeBps, isSourceId, type SourceId } from "@/lib/sources"
import type { Decision, JobDetail } from "@/lib/types"
import { estimatedGenerationCents, spentGenerationCents } from "@/lib/types"
import { canRebuildPlan, hasOpenGate } from "@/lib/workflow-policy"
import type { JobRepository } from "@/server/repositories/job-repository"
import { addAudit, type AuditKind } from "@/server/services/audit"
import { finalizeDeskAnalysis, produceAnalysis } from "@/server/services/analyze-brief"
import { clearJobSupervision } from "@/server/services/autonomy"
import { draftClientDeliveryNote } from "@/server/services/delivery-note"
import {
  cancelGeneration,
  refreshGenerationStatus,
  retryGeneration,
} from "@/server/services/live-generation"
import { planFromAnalysis, plannedStepsFromRouteLines } from "@/server/services/plan-from-analysis"
import {
  assertLiveStepsSubmittable,
  recordFinishingRevision,
  runProviderSteps,
  stepsAwaitingOutput,
} from "@/server/services/provider-run"
import {
  evaluateJobQa,
  marginAfter,
  persistQa,
  qaRepairDetail,
  runApprovedRepair,
} from "@/server/services/qa-desk"
import { recommendRevision } from "@/server/services/revisions"

const DEFAULT_CONTINGENCY_BPS = 1500

async function recordAudit(jobId: string, kind: AuditKind, summary: string, detail = ""): Promise<void> {
  await addAudit({ jobId, kind, summary, detail })
}

function routeDecisionDetail(
  steps: Array<{
    name: string
    selectedModel: string
    estimatedAttempts: number
    unitCostCents: number
    estimatedTotalCents: number
  }>,
): string {
  return steps
    .map(
      (step) =>
        `${step.name}: ${step.selectedModel} ${step.estimatedAttempts} x ${step.unitCostCents} = ${step.estimatedTotalCents}`,
    )
    .join("\n")
}

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
    const detail = analysis.document.rightsAndConsentFlags.join(" ")
    await repo.openGate({
      jobId,
      kind: "rights",
      summary: "Rights concern needs a person",
      detail,
    })
    await recordAudit(jobId, "escalation", "Rights concern needs a person", detail)
  }

  await repo.updateJob(jobId, {
    status: analysis.document.decision === "reject" ? "rejected" : "needs_review",
  })
  if (analysis.document.decision === "reject") {
    await recordAudit(jobId, "escalation", "Refused the job", "Analysis refused the job. No proposal was sent.")
  }
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
  if (decision === "reject") {
    await recordAudit(jobId, "escalation", "Refused the job", note)
  } else if (decision === "accept") {
    await recordAudit(jobId, "approval", "A person accepted the job for planning", note)
  }
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
  let document = finalizeDeskAnalysis(draft, {
    clientPriceCents: job.budgetCents,
    channelFeeBps: job.channelFeeBps,
    contingencyBps: job.contingencyBps,
    deadlineIso: job.deadline,
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
    const detail = document.rightsAndConsentFlags.join(" ")
    await repo.openGate({
      jobId,
      kind: "rights",
      summary: "Rights concern needs a person",
      detail,
    })
    await recordAudit(jobId, "escalation", "Rights concern needs a person", detail)
  }
  await repo.updateJob(jobId, {
    status: document.decision === "reject" ? "rejected" : "needs_review",
  })
  if (intent === "approve") {
    await recordAudit(jobId, "approval", "A person approved the analysis for planning", "Workflow and budget still need approval.")
  } else if (intent === "reject" || document.decision === "reject") {
    await recordAudit(jobId, "escalation", "Refused the job", "A person rejected this analysis. No proposal was sent.")
  }
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
  await recordAudit(jobId, "model_decision", "Route selected", routeDecisionDetail(steps))
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
  const stored = plannedStepsFromRouteLines(ordered, outputs)
  await repo.replaceSteps(jobId, stored)
  const total = maxSpendCents(ordered)
  await repo.openGate({
    jobId,
    kind: "workflow_budget",
    summary: "Approve the plan and a maximum production budget",
    detail: `Estimated generation spend is ${(total / 100).toFixed(2)} USD before contingency. Generation cannot start until this gate is approved.`,
  })
  await repo.updateJob(jobId, { status: "needs_review", maxBudgetCents: null })
  await recordAudit(jobId, "model_decision", "Route changed", routeDecisionDetail(stored))
  await recordAudit(jobId, "cost_change", "Route spend changed", `estimatedGenerationCents ${total}`)
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
  await recordAudit(
    jobId,
    "cost_change",
    "Package price changed",
    `clientPriceCents ${job.budgetCents} -> ${budgetCents}`,
  )
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
  await recordAudit(
    jobId,
    "cost_change",
    "Commercial terms changed",
    `channelFeeBps ${job.channelFeeBps} -> ${input.channelFeeBps}; contingencyBps ${job.contingencyBps} -> ${input.contingencyBps}`,
  )
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
  await recordAudit(
    jobId,
    "approval",
    "A person approved the scope and the production maximum",
    "This approval is inside the desk. It does not accept a marketplace contract.",
  )
  await recordAudit(
    jobId,
    "cost_change",
    "Production maximum set from the approved route",
    `maxBudgetCents ${maxBudgetCents}; estimatedGenerationCents ${estimate}`,
  )
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
  await recordAudit(
    jobId,
    "approval",
    "A person cleared the rights concern",
    "This does not grant a marketplace license.",
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

  const pending = stepsAwaitingOutput(job)
  if (pending.length === 0) throw new StudioError("Every approved step already has an output.")
  assertLiveStepsSubmittable(pending)

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
    const detail = `Committed ${(committed / 100).toFixed(2)} USD plus ${(freshCost / 100).toFixed(2)} USD exceeds the ${(job.maxBudgetCents / 100).toFixed(2)} USD cap.`
    await repo.openGate({
      jobId,
      kind: "budget_increase",
      summary: "Generation would exceed the approved maximum",
      detail,
    })
    await recordAudit(jobId, "escalation", "Generation would exceed the approved maximum", detail)
    throw new StudioError(
      "That run exceeds the approved production budget. Approve a higher maximum, or change the plan.",
    )
  }

  await repo.updateJob(jobId, { status: "generating" })
  await runProviderSteps(repo, job, pending)
  await finishIfReady(repo, jobId)
  const generated = await mustGet(repo, jobId)
  await recordAudit(
    jobId,
    "generation",
    "Generated the approved steps",
    generated.generations.map((item) => `${item.model} ${item.status}`).join("\n"),
  )
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
    await recordAudit(jobId, "escalation", "Refused the revision", revision.clientNote)
    return
  }
  if (job.maxBudgetCents == null) throw new StudioError("This job has no approved budget.")
  const spent = spentGenerationCents(job.generations)
  if (spent + revision.expectedIncrementalCents > job.maxBudgetCents) {
    const detail = `Spent ${(spent / 100).toFixed(2)} USD plus ${(revision.expectedIncrementalCents / 100).toFixed(2)} USD exceeds the ${(job.maxBudgetCents / 100).toFixed(2)} USD cap.`
    await repo.openGate({
      jobId,
      kind: "budget_increase",
      summary: "Revision exceeds the approved maximum",
      detail,
    })
    await recordAudit(jobId, "escalation", "Revision exceeds the approved maximum", detail)
    throw new StudioError(
      "Approving this revision would exceed the production budget. Raise the maximum first.",
    )
  }

  await recordFinishingRevision(repo, job, revision)
  await recordAudit(jobId, "approval", "A person approved the revision", revision.affectedDeliverable)
  await recordAudit(
    jobId,
    "cost_change",
    "Revision cost applied",
    `incrementalCents ${revision.expectedIncrementalCents}`,
  )
  await recordAudit(jobId, "generation", "Finishing revision recorded", `${revision.affectedDeliverable} ${revision.expectedIncrementalCents}`)
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
  await recordAudit(jobId, "escalation", "Material workflow change needs a person", note)
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
  await recordAudit(
    jobId,
    "approval",
    "A person approved replacing the plan",
    "Rebuild the plan, then approve the new budget before generating.",
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
  await recordAudit(jobId, "approval", "A person approved a higher production maximum", `maxBudgetCents ${maxBudgetCents}`)
  await recordAudit(jobId, "cost_change", "Production maximum raised", `maxBudgetCents ${job.maxBudgetCents ?? "none"} -> ${maxBudgetCents}`)
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
  await recordAudit(
    jobId,
    "approval",
    "A person approved final delivery",
    "Delivered inside Studio Operator. No marketplace upload was performed.",
  )
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
  await recordAudit(jobId, "escalation", "Refused the job", "A person rejected the job before delivery. No marketplace message was sent.")
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
      reason: `The motion check failed, so QA ran the priced continuity repair on ${before.repairModelLabel}. It stayed inside the approved per-repair and per-job limits. ${after.reason}`,
      repairModelId: before.repairModelId,
      repairModelLabel: before.repairModelLabel,
      incrementalCents: before.incrementalCents,
      newTotalCents: spent,
      updatedMarginCents: marginAfter(refreshed, spent),
      withinLimits: true,
    }, true)
    if (after.verdict === "ready") await ensureDeliveryNote(repo, refreshed)
    await recordAudit(
      jobId,
      "repair",
      "Targeted repair",
      `${before.repairModelLabel ?? "Repair"} (${before.repairModelId ?? "unselected"}) repair. incrementalCents ${before.incrementalCents}.`,
    )
    await recordAudit(
      jobId,
      "cost_change",
      "Repair cost applied inside the automatic cap",
      `incrementalCents ${before.incrementalCents}; newTotalCents ${spent}`,
    )
    return
  }
  if (before.verdict === "controlled_edit" && !before.withinLimits) {
    const detail = qaRepairDetail(before)
    await repo.openGate({
      jobId,
      kind: "qa_repair",
      summary: "QA repair needs a person",
      detail,
    })
    await recordAudit(jobId, "escalation", "QA repair needs a person", detail)
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
    reason: `A person approved the continuity repair on ${before.repairModelLabel} because it was outside the previous maximum. ${after.reason}`,
    repairModelId: before.repairModelId,
    repairModelLabel: before.repairModelLabel,
    incrementalCents: before.incrementalCents,
    newTotalCents: spent,
    updatedMarginCents: marginAfter(refreshed, spent),
    withinLimits: true,
  }, true)
  if (after.verdict === "ready") await ensureDeliveryNote(repo, refreshed)
  await recordAudit(
    jobId,
    "approval",
    "A person approved the repair",
    `maxBudgetCents ${maxBudgetCents}`,
  )
  await recordAudit(
    jobId,
    "repair",
    "Targeted repair",
    `${before.repairModelLabel ?? "Repair"} (${before.repairModelId ?? "unselected"}) repair. incrementalCents ${before.incrementalCents}.`,
  )
  await recordAudit(
    jobId,
    "cost_change",
    "Repair cost applied",
    `incrementalCents ${before.incrementalCents}; newTotalCents ${spent}; maxBudgetCents ${maxBudgetCents}`,
  )
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
  await clearJobSupervision(jobId)
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

