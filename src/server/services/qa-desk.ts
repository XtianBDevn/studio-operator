import { assertAllowedOperation } from "@/lib/guardrails"
import { computeProfitability } from "@/lib/profitability"
import { evaluateQa, type QaEvaluation } from "@/lib/qa"
import type { JobDetail } from "@/lib/types"
import { spentGenerationCents } from "@/lib/types"
import type { JobRepository } from "@/server/repositories/job-repository"
import { recordQaRepairPreview } from "@/server/services/provider-run"

/**
 * QA owner for the desk loop. Checklist policy stays in `src/lib/qa.ts`.
 * This module turns a job into that evaluation and stores the report.
 * The repair preview is a provider call.
 */

export function evaluateJobQa(job: JobDetail): QaEvaluation {
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

export function marginAfter(job: JobDetail, spentCents: number): number {
  return computeProfitability({
    clientPriceCents: job.budgetCents,
    estimatedGenerationCents: spentCents,
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
    actualGenerationCents: spentCents,
    maxBudgetCents: job.maxBudgetCents,
  }).expectedGrossMarginCents
}

export function qaRepairDetail(evaluation: QaEvaluation): string {
  const incremental = (evaluation.incrementalCents / 100).toFixed(2)
  const total = (evaluation.newTotalCents / 100).toFixed(2)
  const margin = (evaluation.updatedMarginCents / 100).toFixed(2)
  return `${evaluation.reason} Model ${evaluation.repairModelLabel ?? "unselected"}. Incremental ${incremental} USD. New total ${total} USD. Updated margin ${margin} USD. ${evaluation.blockReason ?? ""}`.trim()
}

export async function persistQa(
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

export async function runApprovedRepair(
  repo: JobRepository,
  job: JobDetail,
  evaluation: QaEvaluation,
): Promise<void> {
  assertAllowedOperation("generation.run_within_limits")
  await recordQaRepairPreview(repo, job, evaluation)
}
