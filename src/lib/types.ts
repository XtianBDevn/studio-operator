import type { StoredAnalysis } from "@/lib/analysis"
import type { JobStatus } from "@/lib/statuses"
import type { SourceId } from "@/lib/sources"

export const DECISIONS = ["accept", "human_review", "reject"] as const
export type Decision = (typeof DECISIONS)[number]

export const GATE_KINDS = [
  "workflow_budget",
  "budget_increase",
  "workflow_change",
  "rights",
  "final_delivery",
] as const
export type GateKind = (typeof GATE_KINDS)[number]

export const GATE_STATUSES = ["required", "approved", "rejected"] as const
export type GateStatus = (typeof GATE_STATUSES)[number]

export type ReferenceAssetRecord = {
  id: string
  label: string
  url: string
  kind: string
}

export type BriefAnalysisRecord = {
  id: string
  original: StoredAnalysis
  edited: StoredAnalysis | null
  effective: StoredAnalysis
  decision: Decision
  confidence: number
  modelLabel: string
  provider: "mock" | "openai"
  createdAt: string
  updatedAt: string
}

export type WorkflowStepRecord = {
  id: string
  position: number
  name: string
  selectedModel: string
  modelKind: string
  purpose: string
  inputs: string[]
  expectedOutputs: string[]
  estimatedAttempts: number
  unitCostCents: number
  estimatedTotalCents: number
  routeStage: string | null
  routeRole: string | null
  whyFit: string | null
  failureMode: string | null
  alternativeModel: string | null
  docsUrl: string | null
  substituteNote: string | null
  approvalStatus: "pending" | "approved" | "changes_requested"
  status: "planned" | "ready" | "running" | "complete" | "failed" | "blocked"
}

export const GENERATION_STATUSES = [
  "queued",
  "running",
  "in_progress",
  "succeeded",
  "failed",
  "nsfw",
  "canceled",
  "timed_out",
] as const
export type GenerationDeskStatus = (typeof GENERATION_STATUSES)[number]

export type GenerationRecord = {
  id: string
  stepId: string | null
  providerRequestId: string
  model: string
  status: GenerationDeskStatus
  providerStatus: string | null
  statusUrl: string | null
  cancelUrl: string | null
  correlationId: string | null
  settingsJson: string | null
  assetKind: string | null
  providerOutputUrl: string | null
  costEstimateCents: number
  actualCostCents: number | null
  estimatedCredits: string | null
  estimatedUsd: string | null
  actualCredits: string | null
  actualUsd: string | null
  costSource: string | null
  retryOfId: string | null
  outputUrl: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type RevisionRecord = {
  id: string
  clientNote: string
  affectedDeliverable: string
  recommendedAction: string
  expectedIncrementalCents: number
  approvalStatus: "pending" | "approved" | "rejected"
  createdAt: string
}

export type ApprovalGateRecord = {
  id: string
  kind: GateKind
  status: GateStatus
  summary: string
  detail: string
  createdAt: string
  resolvedAt: string | null
}

export type JobDetail = {
  id: string
  title: string
  source: SourceId
  rawBrief: string
  budgetCents: number
  deadline: string | null
  status: JobStatus
  clientNotes: string
  channelFeeBps: number
  contingencyBps: number
  maxBudgetCents: number | null
  createdAt: string
  updatedAt: string
  assets: ReferenceAssetRecord[]
  analysis: BriefAnalysisRecord | null
  steps: WorkflowStepRecord[]
  generations: GenerationRecord[]
  revisions: RevisionRecord[]
  approvals: ApprovalGateRecord[]
}

export type JobSummary = {
  id: string
  title: string
  source: SourceId
  budgetCents: number
  deadline: string | null
  status: JobStatus
  createdAt: string
  decision: Decision | null
  estimatedGenerationCents: number
  hasPlan: boolean
  channelFeeBps: number
  contingencyBps: number
  maxBudgetCents: number | null
}

export function estimatedGenerationCents(
  steps: Array<{ estimatedTotalCents: number }>,
): number {
  return steps.reduce((sum, step) => sum + step.estimatedTotalCents, 0)
}

export function spentGenerationCents(
  generations: Array<{
    status: string
    actualCostCents: number | null
    costEstimateCents: number
  }>,
): number {
  return generations.reduce((sum, generation) => {
    if (
      generation.status === "failed" ||
      generation.status === "nsfw" ||
      generation.status === "canceled" ||
      generation.status === "timed_out"
    ) {
      return sum
    }
    return sum + (generation.actualCostCents ?? generation.costEstimateCents)
  }, 0)
}
