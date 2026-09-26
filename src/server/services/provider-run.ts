import { StudioError } from "@/lib/errors"
import { assertLiveSubmittable } from "@/lib/live-workflows"
import { isConditionalRepair, type QaEvaluation } from "@/lib/qa"
import type { JobDetail, WorkflowStepRecord } from "@/lib/types"
import type { JobRepository } from "@/server/repositories/job-repository"
import { readHiggsfieldCredentials } from "@/server/services/higgsfield"
import { runLiveSteps } from "@/server/services/live-generation"
import { MODEL_CATALOG } from "@/server/services/models"
import { localPreviewGeneration, requestHiggsfieldGeneration } from "@/server/services/providers"

/**
 * Provider owner. Mock previews and the two live Higgsfield workflows enter here.
 * studio.ts decides when generation is allowed. It does not build provider requests.
 */

export function stepsAwaitingOutput(job: JobDetail): WorkflowStepRecord[] {
  return job.steps.filter((step) => {
    if (step.approvalStatus !== "approved") return false
    if (isConditionalRepair(step.purpose)) return false
    return !job.generations.some(
      (generation) => generation.stepId === step.id && generation.status === "succeeded",
    )
  })
}

/** Live mode: every pending step must be layer 3, then credentials must exist. No network. */
export function assertLiveStepsSubmittable(steps: Array<{ selectedModel: string }>): void {
  if (process.env.STUDIO_OPERATOR_MODE !== "live") return
  for (const step of steps) assertLiveSubmittable(step.selectedModel)
  if (!readHiggsfieldCredentials()) {
    throw new StudioError("Higgsfield credentials are not configured on the server. No request was sent.")
  }
}

export async function runProviderSteps(
  repo: JobRepository,
  job: JobDetail,
  pending: WorkflowStepRecord[],
): Promise<void> {
  if (process.env.STUDIO_OPERATOR_MODE === "live") {
    await runLiveSteps(repo, job)
    return
  }
  await runMockSteps(repo, job, pending)
}

export async function recordFinishingRevision(
  repo: JobRepository,
  job: JobDetail,
  revision: { id: string; affectedDeliverable: string; expectedIncrementalCents: number },
): Promise<void> {
  if (process.env.STUDIO_OPERATOR_MODE === "live") {
    assertLiveSubmittable(MODEL_CATALOG.finishing.id)
  }
  const result = await requestHiggsfieldGeneration({
    model: MODEL_CATALOG.finishing.id,
    title: job.title,
    subtitle: revision.affectedDeliverable,
    kind: "finishing",
    costEstimateCents: revision.expectedIncrementalCents,
  })
  await repo.updateRevision(revision.id, "approved")
  await repo.createGeneration({
    jobId: job.id,
    stepId: null,
    providerRequestId: result.providerRequestId,
    model: MODEL_CATALOG.finishing.id,
    status: "succeeded",
    costEstimateCents: revision.expectedIncrementalCents,
    actualCostCents: result.actualCostCents,
    outputUrl: result.outputUrl,
    error: null,
    costSource: "mock",
    settingsJson: JSON.stringify({
      mode: "mock",
      model: MODEL_CATALOG.finishing.id,
      kind: "finishing",
      note: "Finishing is a planning rate. It is not a live-submittable workflow.",
    }),
    completedAt: new Date(),
  })
}

export async function recordQaRepairPreview(
  repo: JobRepository,
  job: JobDetail,
  evaluation: QaEvaluation,
): Promise<void> {
  const step = job.steps.find((item) => isConditionalRepair(item.purpose))
  if (!step || !evaluation.repairModelId) throw new StudioError("No approved continuity repair is on this plan.")
  if (process.env.STUDIO_OPERATOR_MODE === "live") {
    assertLiveSubmittable(step.selectedModel)
  }
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
    costSource: "mock",
    settingsJson: JSON.stringify({
      mode: "mock",
      qaRepair: true,
      model: step.selectedModel,
      kind: step.modelKind,
      note: "QA repair preview. This model is planning-only. No Higgsfield request was sent.",
    }),
    completedAt: new Date(),
  })
  await repo.updateStep(step.id, { status: "complete" })
}

async function runMockSteps(
  repo: JobRepository,
  job: JobDetail,
  pending: WorkflowStepRecord[],
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
