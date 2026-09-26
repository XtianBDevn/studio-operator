import type { StoredAnalysis } from "@/lib/analysis"
import type { GateKind, GenerationDeskStatus, JobDetail, JobSummary } from "@/lib/types"
import type { SourceId } from "@/lib/sources"
import type { JobStatus } from "@/lib/statuses"
import type { PlannedStep } from "@/server/services/plan-workflow"

export type CreateJobInput = {
  id?: string
  title: string
  source: SourceId
  rawBrief: string
  budgetCents: number
  deadline: Date | null
  clientNotes: string
  channelFeeBps: number
  contingencyBps: number
  status?: JobStatus
  maxBudgetCents?: number | null
  createdAt?: Date
  assets: Array<{ label: string; url: string; kind: string }>
}

export type JobPatch = {
  status?: JobStatus
  title?: string
  rawBrief?: string
  budgetCents?: number
  deadline?: Date | null
  clientNotes?: string
  channelFeeBps?: number
  contingencyBps?: number
  maxBudgetCents?: number | null
}

export type QaReportWrite = {
  jobId: string
  checklistJson: string
  verdict: string
  reason: string
  repairModelId: string | null
  repairModelLabel: string | null
  incrementalCents: number
  newTotalCents: number
  updatedMarginCents: number
  withinLimits: boolean
  autoRepaired: boolean
}

export type DeliveryNoteWrite = {
  jobId: string
  body: string
  provider: "mock" | "openai"
  modelLabel: string
}

export type GenerationWrite = {
  jobId: string
  stepId: string | null
  providerRequestId: string
  model: string
  status: GenerationDeskStatus
  providerStatus?: string | null
  statusUrl?: string | null
  cancelUrl?: string | null
  correlationId?: string | null
  settingsJson?: string | null
  assetKind?: string | null
  localPath?: string | null
  providerOutputUrl?: string | null
  costEstimateCents: number
  actualCostCents?: number | null
  estimatedCredits?: string | null
  estimatedUsd?: string | null
  actualCredits?: string | null
  actualUsd?: string | null
  costSource?: string | null
  retryOfId?: string | null
  outputUrl?: string | null
  error?: string | null
  completedAt?: Date | null
}

export type GenerationPatch = Partial<Omit<GenerationWrite, "jobId" | "stepId">>

export type GenerationComplete = {
  status: "succeeded" | "failed"
  actualCostCents: number | null
  outputUrl: string | null
  error: string | null
  completedAt: Date | null
}

/**
 * Persistence boundary. The app talks to this interface, not to Prisma.
 * A Postgres implementation can replace PrismaJobRepository without changing
 * the desk workflow.
 */
export interface JobRepository {
  listSummaries(): Promise<JobSummary[]>
  getJob(id: string): Promise<JobDetail | null>
  createJob(input: CreateJobInput): Promise<JobDetail>
  updateJob(id: string, patch: JobPatch): Promise<void>
  saveAnalysis(
    jobId: string,
    input: { document: StoredAnalysis; modelLabel: string; provider: "mock" | "openai" },
  ): Promise<void>
  saveEditedAnalysis(jobId: string, document: StoredAnalysis): Promise<void>
  replaceSteps(jobId: string, steps: PlannedStep[]): Promise<void>
  updateAllSteps(
    jobId: string,
    patch: { approvalStatus?: string; status?: string },
  ): Promise<void>
  updateStep(id: string, patch: { approvalStatus?: string; status?: string }): Promise<void>
  generationAssetPath(id: string): Promise<string | null>
  createGeneration(input: GenerationWrite): Promise<string>
  updateGeneration(id: string, patch: GenerationPatch): Promise<void>
  completeGeneration(id: string, patch: GenerationComplete): Promise<void>
  createRevision(input: {
    jobId: string
    clientNote: string
    affectedDeliverable: string
    recommendedAction: string
    expectedIncrementalCents: number
    approvalStatus: "pending" | "approved" | "rejected"
  }): Promise<string>
  updateRevision(id: string, approvalStatus: "approved" | "rejected"): Promise<void>
  openGate(input: {
    jobId: string
    kind: GateKind
    summary: string
    detail: string
  }): Promise<void>
  resolveGate(
    jobId: string,
    kind: GateKind,
    status: "approved" | "rejected",
    detail?: string,
  ): Promise<void>
  saveQaReport(input: QaReportWrite): Promise<void>
  saveDeliveryNote(input: DeliveryNoteWrite): Promise<void>
  clearProduction(jobId: string): Promise<void>
  replaceAssets(jobId: string, assets: Array<{ label: string; url: string; kind: string }>): Promise<void>
}
