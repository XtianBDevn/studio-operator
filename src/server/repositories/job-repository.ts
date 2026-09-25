import type { Decision, GateKind, JobDetail, JobSummary } from "@/lib/types"
import type { SourceId } from "@/lib/sources"
import type { JobStatus } from "@/lib/statuses"
import type { AnalysisDraft } from "@/server/services/analyze-brief"
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
  clientNotes?: string
  channelFeeBps?: number
  contingencyBps?: number
  maxBudgetCents?: number | null
}

export type GenerationWrite = {
  jobId: string
  stepId: string | null
  providerRequestId: string
  model: string
  status: "queued" | "running" | "succeeded" | "failed"
  costEstimateCents: number
  actualCostCents?: number | null
  outputUrl?: string | null
  error?: string | null
  completedAt?: Date | null
}

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
  saveAnalysis(jobId: string, analysis: AnalysisDraft): Promise<void>
  updateDecision(jobId: string, decision: Decision, rationale: string): Promise<void>
  replaceSteps(jobId: string, steps: PlannedStep[]): Promise<void>
  updateAllSteps(
    jobId: string,
    patch: { approvalStatus?: string; status?: string },
  ): Promise<void>
  updateStep(id: string, patch: { approvalStatus?: string; status?: string }): Promise<void>
  createGeneration(input: GenerationWrite): Promise<void>
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
}
