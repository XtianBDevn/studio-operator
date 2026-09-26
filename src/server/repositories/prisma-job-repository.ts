import type { Prisma, PrismaClient } from "@prisma/client"

import { validateStoredAnalysis, type StoredAnalysis } from "@/lib/analysis"
import { StudioError } from "@/lib/errors"
import { parseStringList, toIso } from "@/lib/json"
import { isSourceId, type SourceId } from "@/lib/sources"
import { isJobStatus, type JobStatus } from "@/lib/statuses"
import type {
  ApprovalGateRecord,
  BriefAnalysisRecord,
  Decision,
  DeliveryNoteRecord,
  GateKind,
  GenerationRecord,
  JobDetail,
  JobSummary,
  QaCheckRecord,
  QaReportRecord,
  QaVerdictValue,
  ReferenceAssetRecord,
  RevisionRecord,
  WorkflowStepRecord,
} from "@/lib/types"
import { estimatedGenerationCents } from "@/lib/types"
import type {
  CreateJobInput,
  GenerationComplete,
  GenerationPatch,
  DeliveryNoteWrite,
  GenerationWrite,
  JobPatch,
  JobRepository,
  QaReportWrite,
} from "@/server/repositories/job-repository"
import type { PlannedStep } from "@/server/services/plan-workflow"

const detailInclude = {
  assets: { orderBy: { createdAt: "asc" as const } },
  analysis: true,
  steps: { orderBy: { position: "asc" as const } },
  generations: { orderBy: { createdAt: "asc" as const } },
  revisions: { orderBy: { createdAt: "desc" as const } },
  approvals: { orderBy: { createdAt: "asc" as const } },
  qaReports: { orderBy: { createdAt: "desc" as const } },
  deliveryNote: true,
}

type JobWithDetail = Awaited<ReturnType<PrismaJobRepository["load"]>>

function asSource(value: string): SourceId {
  if (!isSourceId(value)) {
    throw new StudioError(`Unknown intake source: ${value}`)
  }
  return value
}

function asStatus(value: string): JobStatus {
  if (!isJobStatus(value)) {
    throw new StudioError(`Unknown job status: ${value}`)
  }
  return value
}

function asDecision(value: string): Decision {
  if (value !== "accept" && value !== "human_review" && value !== "reject") {
    throw new StudioError(`Unknown decision: ${value}`)
  }
  return value
}

function asProvider(value: string): "mock" | "openai" {
  if (value !== "mock" && value !== "openai") {
    throw new StudioError(`Unknown analysis provider: ${value}`)
  }
  return value
}

function asGateKind(value: string): GateKind {
  if (
    value !== "workflow_budget" &&
    value !== "budget_increase" &&
    value !== "workflow_change" &&
    value !== "rights" &&
    value !== "final_delivery" &&
    value !== "qa_repair"
  ) {
    throw new StudioError(`Unknown approval gate: ${value}`)
  }
  return value
}

export class PrismaJobRepository implements JobRepository {
  constructor(private readonly db: PrismaClient) {}

  async listSummaries(): Promise<JobSummary[]> {
    const jobs = await this.db.job.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        analysis: { select: { decision: true } },
        steps: { select: { estimatedTotalCents: true } },
      },
    })

    return jobs.map((job) => ({
      id: job.id,
      title: job.title,
      source: asSource(job.source),
      budgetCents: job.budgetCents,
      deadline: toIso(job.deadline),
      status: asStatus(job.status),
      createdAt: job.createdAt.toISOString(),
      decision: job.analysis ? asDecision(job.analysis.decision) : null,
      estimatedGenerationCents: estimatedGenerationCents(job.steps),
      hasPlan: job.steps.length > 0,
      channelFeeBps: job.channelFeeBps,
      contingencyBps: job.contingencyBps,
      maxBudgetCents: job.maxBudgetCents,
    }))
  }

  async getJob(id: string): Promise<JobDetail | null> {
    const job = await this.load(id)
    return job ? this.toDetail(job) : null
  }

  async createJob(input: CreateJobInput): Promise<JobDetail> {
    const job = await this.db.job.create({
      data: {
        id: input.id,
        title: input.title,
        source: input.source,
        rawBrief: input.rawBrief,
        budgetCents: input.budgetCents,
        deadline: input.deadline,
        status: input.status ?? "new",
        clientNotes: input.clientNotes,
        channelFeeBps: input.channelFeeBps,
        contingencyBps: input.contingencyBps,
        maxBudgetCents: input.maxBudgetCents ?? null,
        createdAt: input.createdAt,
        assets: {
          create: input.assets.map((asset) => ({
            label: asset.label,
            url: asset.url,
            kind: asset.kind,
          })),
        },
      },
      include: detailInclude,
    })
    return this.toDetail(job)
  }

  async updateJob(id: string, patch: JobPatch): Promise<void> {
    await this.db.job.update({
      where: { id },
      data: {
        status: patch.status,
        title: patch.title,
        rawBrief: patch.rawBrief,
        budgetCents: patch.budgetCents,
        deadline: patch.deadline,
        clientNotes: patch.clientNotes,
        channelFeeBps: patch.channelFeeBps,
        contingencyBps: patch.contingencyBps,
        maxBudgetCents: patch.maxBudgetCents,
      },
    })
  }

  async saveAnalysis(
    jobId: string,
    input: { document: StoredAnalysis; modelLabel: string; provider: "mock" | "openai" },
  ): Promise<void> {
    const document = validateStoredAnalysis(input.document)
    const data = {
      originalJson: JSON.stringify(document),
      editedJson: null,
      decision: document.decision,
      confidence: document.confidence,
      modelLabel: input.modelLabel,
      provider: input.provider,
    }
    await this.db.briefAnalysis.upsert({
      where: { jobId },
      create: { jobId, ...data },
      update: data,
    })
  }

  async saveEditedAnalysis(jobId: string, document: StoredAnalysis): Promise<void> {
    const edited = validateStoredAnalysis(document)
    await this.db.briefAnalysis.update({
      where: { jobId },
      data: {
        editedJson: JSON.stringify(edited),
        decision: edited.decision,
        confidence: edited.confidence,
      },
    })
  }

  async replaceSteps(jobId: string, steps: PlannedStep[]): Promise<void> {
    await this.db.$transaction([
      this.db.generation.updateMany({
        where: { jobId },
        data: { stepId: null },
      }),
      this.db.workflowStep.deleteMany({ where: { jobId } }),
      this.db.workflowStep.createMany({
        data: steps.map((step) => ({
          jobId,
          position: step.position,
          name: step.name,
          selectedModel: step.selectedModel,
          modelKind: step.modelKind,
          purpose: step.purpose,
          inputs: JSON.stringify(step.inputs),
          expectedOutputs: JSON.stringify(step.expectedOutputs),
          estimatedAttempts: step.estimatedAttempts,
          unitCostCents: step.unitCostCents,
          estimatedTotalCents: step.estimatedTotalCents,
          routeStage: step.routeStage ?? null,
          routeRole: step.routeRole ?? null,
          whyFit: step.whyFit ?? null,
          failureMode: step.failureMode ?? null,
          alternativeModel: step.alternativeModel ?? null,
          docsUrl: step.docsUrl ?? null,
          substituteNote: step.substituteNote ?? null,
          approvalStatus: "pending",
          status: "planned",
        })),
      }),
    ])
  }

  async updateAllSteps(
    jobId: string,
    patch: { approvalStatus?: string; status?: string },
  ): Promise<void> {
    await this.db.workflowStep.updateMany({
      where: { jobId },
      data: patch,
    })
  }

  async updateStep(
    id: string,
    patch: { approvalStatus?: string; status?: string },
  ): Promise<void> {
    await this.db.workflowStep.update({ where: { id }, data: patch })
  }

  async generationAssetPath(id: string): Promise<string | null> {
    const row = await this.db.generation.findUnique({ where: { id }, select: { localPath: true } })
    return row?.localPath ?? null
  }

  async createGeneration(input: GenerationWrite): Promise<string> {
    const row = await this.db.generation.create({
      data: {
        ...optionalGenerationFields(input),
        jobId: input.jobId,
        stepId: input.stepId,
        providerRequestId: input.providerRequestId,
        model: input.model,
        status: input.status,
        costEstimateCents: input.costEstimateCents,
      } as Prisma.GenerationUncheckedCreateInput,
    })
    return row.id
  }

  async updateGeneration(id: string, patch: GenerationPatch): Promise<void> {
    await this.db.generation.update({
      where: { id },
      data: optionalGenerationFields(patch),
    })
  }

  async completeGeneration(id: string, patch: GenerationComplete): Promise<void> {
    await this.db.generation.update({
      where: { id },
      data: {
        status: patch.status,
        actualCostCents: patch.actualCostCents,
        outputUrl: patch.outputUrl,
        error: patch.error,
        completedAt: patch.completedAt,
      },
    })
  }

  async createRevision(input: {
    jobId: string
    clientNote: string
    affectedDeliverable: string
    recommendedAction: string
    expectedIncrementalCents: number
    approvalStatus: "pending" | "approved" | "rejected"
  }): Promise<string> {
    const revision = await this.db.revision.create({ data: input })
    return revision.id
  }

  async updateRevision(id: string, approvalStatus: "approved" | "rejected"): Promise<void> {
    await this.db.revision.update({ where: { id }, data: { approvalStatus } })
  }

  async openGate(input: {
    jobId: string
    kind: GateKind
    summary: string
    detail: string
  }): Promise<void> {
    const existing = await this.db.approvalGate.findFirst({
      where: { jobId: input.jobId, kind: input.kind, status: "required" },
    })
    if (existing) {
      await this.db.approvalGate.update({
        where: { id: existing.id },
        data: { summary: input.summary, detail: input.detail },
      })
      return
    }
    await this.db.approvalGate.create({
      data: {
        jobId: input.jobId,
        kind: input.kind,
        status: "required",
        summary: input.summary,
        detail: input.detail,
      },
    })
  }

  async saveQaReport(input: QaReportWrite): Promise<void> {
    await this.db.qaReport.create({ data: input })
  }

  async saveDeliveryNote(input: DeliveryNoteWrite): Promise<void> {
    await this.db.deliveryNote.upsert({
      where: { jobId: input.jobId },
      create: input,
      update: {
        body: input.body,
        provider: input.provider,
        modelLabel: input.modelLabel,
      },
    })
  }

  async clearProduction(jobId: string): Promise<void> {
    await this.db.$transaction([
      this.db.qaReport.deleteMany({ where: { jobId } }),
      this.db.deliveryNote.deleteMany({ where: { jobId } }),
      this.db.revision.deleteMany({ where: { jobId } }),
      this.db.generation.deleteMany({ where: { jobId } }),
      this.db.workflowStep.deleteMany({ where: { jobId } }),
      this.db.approvalGate.deleteMany({ where: { jobId } }),
      this.db.briefAnalysis.deleteMany({ where: { jobId } }),
    ])
  }

  async replaceAssets(
    jobId: string,
    assets: Array<{ label: string; url: string; kind: string }>,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.referenceAsset.deleteMany({ where: { jobId } }),
      this.db.referenceAsset.createMany({
        data: assets.map((asset) => ({ jobId, ...asset })),
      }),
    ])
  }

  async resolveGate(
    jobId: string,
    kind: GateKind,
    status: "approved" | "rejected",
    detail?: string,
  ): Promise<void> {
    const existing = await this.db.approvalGate.findFirst({
      where: { jobId, kind, status: "required" },
      orderBy: { createdAt: "desc" },
    })
    if (!existing) {
      throw new StudioError(`No open ${kind.replaceAll("_", " ")} approval.`)
    }
    await this.db.approvalGate.update({
      where: { id: existing.id },
      data: {
        status,
        resolvedAt: new Date(),
        detail: detail ?? existing.detail,
      },
    })
  }

  private load(id: string) {
    return this.db.job.findUnique({ where: { id }, include: detailInclude })
  }

  private toDetail(job: NonNullable<JobWithDetail>): JobDetail {
    return {
      id: job.id,
      title: job.title,
      source: asSource(job.source),
      rawBrief: job.rawBrief,
      budgetCents: job.budgetCents,
      deadline: toIso(job.deadline),
      status: asStatus(job.status),
      clientNotes: job.clientNotes,
      channelFeeBps: job.channelFeeBps,
      contingencyBps: job.contingencyBps,
      maxBudgetCents: job.maxBudgetCents,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      assets: job.assets.map(
        (asset): ReferenceAssetRecord => ({
          id: asset.id,
          label: asset.label,
          url: asset.url,
          kind: asset.kind,
        }),
      ),
      analysis: job.analysis ? mapAnalysis(job.analysis) : null,
      steps: job.steps.map(
        (step): WorkflowStepRecord => ({
          id: step.id,
          position: step.position,
          name: step.name,
          selectedModel: step.selectedModel,
          modelKind: step.modelKind,
          purpose: step.purpose,
          inputs: parseStringList(step.inputs),
          expectedOutputs: parseStringList(step.expectedOutputs),
          estimatedAttempts: step.estimatedAttempts,
          unitCostCents: step.unitCostCents,
          estimatedTotalCents: step.estimatedTotalCents,
          routeStage: step.routeStage,
          routeRole: step.routeRole,
          whyFit: step.whyFit,
          failureMode: step.failureMode,
          alternativeModel: step.alternativeModel,
          docsUrl: step.docsUrl,
          substituteNote: step.substituteNote,
          approvalStatus: step.approvalStatus as WorkflowStepRecord["approvalStatus"],
          status: step.status as WorkflowStepRecord["status"],
        }),
      ),
      generations: job.generations.map(
        (generation): GenerationRecord => ({
          id: generation.id,
          stepId: generation.stepId,
          providerRequestId: generation.providerRequestId,
          model: generation.model,
          status: generation.status as GenerationRecord["status"],
          providerStatus: generation.providerStatus,
          statusUrl: generation.statusUrl,
          cancelUrl: generation.cancelUrl,
          correlationId: generation.correlationId,
          settingsJson: generation.settingsJson,
          assetKind: generation.assetKind,
          providerOutputUrl: generation.providerOutputUrl,
          costEstimateCents: generation.costEstimateCents,
          actualCostCents: generation.actualCostCents,
          estimatedCredits: generation.estimatedCredits,
          estimatedUsd: generation.estimatedUsd,
          actualCredits: generation.actualCredits,
          actualUsd: generation.actualUsd,
          costSource: generation.costSource,
          retryOfId: generation.retryOfId,
          outputUrl: generation.outputUrl,
          error: generation.error,
          createdAt: generation.createdAt.toISOString(),
          updatedAt: generation.updatedAt.toISOString(),
          completedAt: toIso(generation.completedAt),
        }),
      ),
      revisions: job.revisions.map(
        (revision): RevisionRecord => ({
          id: revision.id,
          clientNote: revision.clientNote,
          affectedDeliverable: revision.affectedDeliverable,
          recommendedAction: revision.recommendedAction,
          expectedIncrementalCents: revision.expectedIncrementalCents,
          approvalStatus: revision.approvalStatus as RevisionRecord["approvalStatus"],
          createdAt: revision.createdAt.toISOString(),
        }),
      ),
      approvals: job.approvals.map(
        (gate): ApprovalGateRecord => ({
          id: gate.id,
          kind: asGateKind(gate.kind),
          status: gate.status as ApprovalGateRecord["status"],
          summary: gate.summary,
          detail: gate.detail,
          createdAt: gate.createdAt.toISOString(),
          resolvedAt: toIso(gate.resolvedAt),
        }),
      ),
      qaReports: job.qaReports.map((report) => mapQaReport(report)),
      deliveryNote: job.deliveryNote ? mapDeliveryNote(job.deliveryNote) : null,
    }
  }
}

function mapQaReport(report: {
  id: string
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
  createdAt: Date
}): QaReportRecord {
  return {
    id: report.id,
    checklist: parseChecklist(report.checklistJson),
    verdict: asVerdict(report.verdict),
    reason: report.reason,
    repairModelId: report.repairModelId,
    repairModelLabel: report.repairModelLabel,
    incrementalCents: report.incrementalCents,
    newTotalCents: report.newTotalCents,
    updatedMarginCents: report.updatedMarginCents,
    withinLimits: report.withinLimits,
    autoRepaired: report.autoRepaired,
    createdAt: report.createdAt.toISOString(),
  }
}

function mapDeliveryNote(note: {
  id: string
  body: string
  provider: string
  modelLabel: string
  createdAt: Date
}): DeliveryNoteRecord {
  return {
    id: note.id,
    body: note.body,
    provider: note.provider === "openai" ? "openai" : "mock",
    modelLabel: note.modelLabel,
    createdAt: note.createdAt.toISOString(),
  }
}

function parseChecklist(raw: string): QaCheckRecord[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const record = item as Partial<QaCheckRecord>
      if (typeof record.id !== "string" || typeof record.label !== "string" || typeof record.detail !== "string") {
        return []
      }
      const status = record.status === "pass" || record.status === "fail" || record.status === "na" ? record.status : "na"
      return [{ id: record.id, label: record.label, status, detail: record.detail }]
    })
  } catch {
    return []
  }
}

function asVerdict(value: string): QaVerdictValue {
  if (value === "concept" || value === "controlled_edit" || value === "regenerate" || value === "ready") {
    return value
  }
  return "regenerate"
}

function optionalGenerationFields(input: GenerationPatch): Prisma.GenerationUncheckedUpdateInput {
  const data: Prisma.GenerationUncheckedUpdateInput = {}
  if (input.providerRequestId !== undefined) data.providerRequestId = input.providerRequestId
  if (input.model !== undefined) data.model = input.model
  if (input.status !== undefined) data.status = input.status
  if (input.providerStatus !== undefined) data.providerStatus = input.providerStatus
  if (input.statusUrl !== undefined) data.statusUrl = input.statusUrl
  if (input.cancelUrl !== undefined) data.cancelUrl = input.cancelUrl
  if (input.correlationId !== undefined) data.correlationId = input.correlationId
  if (input.settingsJson !== undefined) data.settingsJson = input.settingsJson
  if (input.assetKind !== undefined) data.assetKind = input.assetKind
  if (input.localPath !== undefined) data.localPath = input.localPath
  if (input.providerOutputUrl !== undefined) data.providerOutputUrl = input.providerOutputUrl
  if (input.costEstimateCents !== undefined) data.costEstimateCents = input.costEstimateCents
  if (input.actualCostCents !== undefined) data.actualCostCents = input.actualCostCents
  if (input.estimatedCredits !== undefined) data.estimatedCredits = input.estimatedCredits
  if (input.estimatedUsd !== undefined) data.estimatedUsd = input.estimatedUsd
  if (input.actualCredits !== undefined) data.actualCredits = input.actualCredits
  if (input.actualUsd !== undefined) data.actualUsd = input.actualUsd
  if (input.costSource !== undefined) data.costSource = input.costSource
  if (input.retryOfId !== undefined) data.retryOfId = input.retryOfId
  if (input.outputUrl !== undefined) data.outputUrl = input.outputUrl
  if (input.error !== undefined) data.error = input.error
  if (input.completedAt !== undefined) data.completedAt = input.completedAt
  return data
}

function mapAnalysis(analysis: {
  id: string
  originalJson: string
  editedJson: string | null
  confidence: number
  decision: string
  modelLabel: string
  provider: string
  createdAt: Date
  updatedAt: Date
}): BriefAnalysisRecord {
  let original: StoredAnalysis
  let edited: StoredAnalysis | null = null
  try {
    original = validateStoredAnalysis(JSON.parse(analysis.originalJson) as unknown)
    edited = analysis.editedJson
      ? validateStoredAnalysis(JSON.parse(analysis.editedJson) as unknown)
      : null
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analysis."
    throw new StudioError(`Stored analysis could not be read. ${message}`)
  }
  return {
    id: analysis.id,
    original,
    edited,
    effective: edited ?? original,
    decision: asDecision(analysis.decision),
    confidence: analysis.confidence,
    modelLabel: analysis.modelLabel,
    provider: asProvider(analysis.provider),
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
  }
}
