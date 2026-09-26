import { StudioError } from "@/lib/errors"
import type { GenerationDeskStatus, GenerationRecord, JobDetail, WorkflowStepRecord } from "@/lib/types"
import { spentGenerationCents } from "@/lib/types"
import type { JobRepository } from "@/server/repositories/job-repository"
import { localPreviewGeneration } from "@/server/services/providers"
import { assertLiveSubmittable } from "@/lib/live-workflows"
import {
  HiggsfieldRequestError,
  buildKlingStandardInput,
  buildSoulV2Input,
  cancelIfQueued,
  connectedWorkflow,
  createHiggsfieldClient,
  describeOutcome,
  executeGeneration,
  higgsfieldBaseUrl,
  pollStatus,
  pollTimeoutMs,
  readHiggsfieldCredentials,
  redactSecrets,
  storeCopiedAsset,
  type ExecutionResult,
  type HiggsfieldClient,
  type StatusSnapshot,
} from "@/server/services/higgsfield"

const OPEN_STATUSES = new Set(["queued", "running", "in_progress", "timed_out"])
const RETRY_STATUSES = new Set(["failed", "nsfw", "canceled", "timed_out"])

function latestForStep(job: JobDetail, stepId: string): GenerationRecord | undefined {
  return job.generations.filter((generation) => generation.stepId === stepId).at(-1)
}

function clientOrThrow(): HiggsfieldClient {
  const credentials = readHiggsfieldCredentials()
  if (!credentials) {
    throw new StudioError("Higgsfield credentials are not configured on the server. No request was sent.")
  }
  return createHiggsfieldClient({ credentials, baseUrl: higgsfieldBaseUrl() })
}

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Higgsfield request failed."
  return redactSecrets(raw).slice(0, 500)
}

export async function runLiveSteps(repo: JobRepository, job: JobDetail): Promise<void> {
  let client: HiggsfieldClient | null = null
  const clientOnce = (): HiggsfieldClient => {
    if (client) return client
    const created = clientOrThrow()
    client = created
    return created
  }
  let blocked = false
  for (const step of job.steps) {
    if (step.approvalStatus !== "approved") continue
    const succeeded = job.generations.some(
      (generation) => generation.stepId === step.id && generation.status === "succeeded",
    )
    if (succeeded) continue
    if (blocked) continue
    const latest = latestForStep(job, step.id)
    if (latest && RETRY_STATUSES.has(latest.status)) {
      blocked = true
      continue
    }
    // Layer 3 guard runs before the client exists, so a planning-only step never reaches the network.
    assertLiveSubmittable(step.selectedModel)
    const outcome = await progressStep(repo, job, step, latest, clientOnce())
    if (outcome !== "succeeded") blocked = true
  }
  if (blocked) {
    const refreshed = await repo.getJob(job.id)
    const waitingRetry = refreshed?.steps.some((step) => {
      if (step.approvalStatus !== "approved") return false
      const latest = refreshed.generations.filter((generation) => generation.stepId === step.id).at(-1)
      return latest ? RETRY_STATUSES.has(latest.status) : false
    })
    if (waitingRetry) {
      throw new StudioError(
        "A generation failed, was moderated, was canceled, or hit the application timeout. Check status, or use Retry to create a new generation. The earlier attempt was kept.",
      )
    }
  }
}

async function progressStep(
  repo: JobRepository,
  job: JobDetail,
  step: WorkflowStepRecord,
  latest: GenerationRecord | undefined,
  client: HiggsfieldClient,
): Promise<string> {
  if (latest && OPEN_STATUSES.has(latest.status)) {
    if (!latest.statusUrl) {
      throw new StudioError(
        "An in-flight generation has no Higgsfield status URL. It was not replaced. No request was sent.",
      )
    }
    await resumePolling(repo, job, latest, client)
    const updated = await repo.getJob(job.id)
    return updated?.generations.find((generation) => generation.id === latest.id)?.status ?? latest.status
  }

  const wired = assertLiveSubmittable(step.selectedModel)
  const body = wired === "soul" ? soulBody(job, step) : klingBody(job, step)
  let generationId = ""
  try {
    const result = await executeGeneration({
      endpointId: step.selectedModel,
      body,
      expectedKind: wired === "soul" ? "image" : "video",
      client,
      timeoutMs: pollTimeoutMs(),
      onEstimated: async (estimate) => {
        const current = await repo.getJob(job.id)
        const spent = spentGenerationCents(current?.generations ?? [])
        if (job.maxBudgetCents != null && spent + estimate.cents > job.maxBudgetCents) {
          await repo.openGate({
            jobId: job.id,
            kind: "budget_increase",
            summary: "Higgsfield estimate exceeds the approved maximum",
            detail: `Committed ${(spent / 100).toFixed(2)} USD plus an estimate of ${estimate.usd} USD exceeds the ${(job.maxBudgetCents / 100).toFixed(2)} USD cap. No generation was submitted.`,
          })
          throw new StudioError(
            "The Higgsfield estimate exceeds the approved production budget. No generation was submitted.",
          )
        }
        generationId = await repo.createGeneration({
          jobId: job.id,
          stepId: step.id,
          providerRequestId: "pending",
          model: step.selectedModel,
          status: "queued",
          costEstimateCents: estimate.cents,
          estimatedCredits: estimate.credits,
          estimatedUsd: estimate.usd,
          costSource: "provider_estimate",
          settingsJson: JSON.stringify(body),
          actualCostCents: null,
        })
      },
      onSubmitted: async (handle) => {
        await repo.updateGeneration(generationId, {
          providerRequestId: handle.requestId,
          providerStatus: handle.status,
          statusUrl: handle.statusUrl,
          cancelUrl: handle.cancelUrl,
          correlationId: handle.correlationId,
          status: desk(handle.status),
        })
      },
    })
    await applyResult(repo, job.id, generationId, result)
    await repo.updateStep(step.id, { status: stepStatus(result.deskStatus) })
    return result.deskStatus
  } catch (error) {
    if (generationId) {
      await repo.updateGeneration(generationId, {
        status: "failed",
        actualCostCents: null,
        costSource: null,
        error: safeMessage(error),
        completedAt: new Date(),
      })
      await repo.updateStep(step.id, { status: "failed" })
    }
    if (error instanceof StudioError || error instanceof HiggsfieldRequestError) throw error
    throw new StudioError(safeMessage(error))
  }
}

async function localStep(
  repo: JobRepository,
  job: JobDetail,
  step: WorkflowStepRecord,
  retryOfId: string | null,
): Promise<string> {
  const preview = localPreviewGeneration({
    model: step.selectedModel,
    title: job.title,
    subtitle: step.name,
    kind: step.modelKind,
    costEstimateCents: step.estimatedTotalCents,
  })
  await repo.createGeneration({
    jobId: job.id,
    stepId: step.id,
    providerRequestId: preview.providerRequestId,
    model: step.selectedModel,
    status: "succeeded",
    costEstimateCents: step.estimatedTotalCents,
    actualCostCents: preview.actualCostCents,
    outputUrl: preview.outputUrl,
    costSource: "local_preview",
    retryOfId,
    settingsJson: JSON.stringify({
      mode: "local_preview",
      reason: "No verified Higgsfield endpoint for this step.",
      model: step.selectedModel,
      kind: step.modelKind,
    }),
    completedAt: new Date(),
  })
  await repo.updateStep(step.id, { status: "complete" })
  return "succeeded"
}

async function resumePolling(
  repo: JobRepository,
  job: JobDetail,
  generation: GenerationRecord,
  client: HiggsfieldClient,
) {
  if (!generation.statusUrl) return
  const outcome = await pollStatus({
    client,
    initial: {
      status: generation.providerStatus === "in_progress" ? "in_progress" : "queued",
      requestId: generation.providerRequestId,
      statusUrl: generation.statusUrl,
      cancelUrl: generation.cancelUrl,
      error: null,
      assets: [],
      usd: null,
      credits: null,
    },
    timeoutMs: pollTimeoutMs(),
  })
  const workflow = connectedWorkflow(generation.assetKind ?? "") ?? connectedWorkflow(modelKindFromEndpoint(generation.model))
  const expected = workflow?.kind ?? "image"
  const result = describeOutcome(
    {
      credits: generation.estimatedCredits ?? "",
      usd: generation.estimatedUsd ?? "",
      cents: generation.costEstimateCents,
    },
    {
      status: outcome.snapshot?.status ?? "queued",
      requestId: generation.providerRequestId,
      statusUrl: generation.statusUrl,
      cancelUrl: generation.cancelUrl,
      error: null,
      assets: outcome.snapshot?.assets ?? [],
      usd: outcome.snapshot?.usd ?? null,
      credits: outcome.snapshot?.credits ?? null,
      correlationId: generation.correlationId,
    },
    outcome,
    expected,
  )
  await applyResult(repo, job.id, generation.id, result)
  if (generation.stepId) {
    await repo.updateStep(generation.stepId, { status: stepStatus(result.deskStatus) })
  }
}

export async function refreshGenerationStatus(
  repo: JobRepository,
  jobId: string,
  generationId: string,
): Promise<void> {
  const job = await mustJob(repo, jobId)
  const generation = job.generations.find((item) => item.id === generationId)
  if (!generation?.statusUrl) {
    throw new StudioError("This generation has no Higgsfield status URL. No request was sent.")
  }
  const client = clientOrThrow()
  let snapshot: StatusSnapshot
  try {
    snapshot = await client.status(generation.statusUrl)
  } catch (error) {
    await repo.updateGeneration(generationId, { error: safeMessage(error) })
    throw new StudioError(safeMessage(error))
  }
  const outcome = { kind: "terminal" as const, snapshot }
  const terminal = snapshot.status === "completed" || snapshot.status === "failed" || snapshot.status === "nsfw" || snapshot.status === "canceled"
  const result = describeOutcome(
    {
      credits: generation.estimatedCredits ?? "",
      usd: generation.estimatedUsd ?? "",
      cents: generation.costEstimateCents,
    },
    {
      ...snapshot,
      correlationId: generation.correlationId,
    },
    terminal ? outcome : { kind: "stopped", snapshot, error: "Status is not terminal." },
    connectedWorkflow(modelKindFromEndpoint(generation.model))?.kind ?? "image",
  )
  if (!terminal) {
    await repo.updateGeneration(generationId, {
      providerStatus: snapshot.status,
      status: desk(snapshot.status),
      statusUrl: snapshot.statusUrl ?? generation.statusUrl,
      cancelUrl: snapshot.cancelUrl ?? generation.cancelUrl,
      error: null,
    })
    return
  }
  await applyResult(repo, job.id, generation.id, result)
  if (generation.stepId) await repo.updateStep(generation.stepId, { status: stepStatus(result.deskStatus) })
}

export async function cancelGeneration(repo: JobRepository, jobId: string, generationId: string): Promise<void> {
  const job = await mustJob(repo, jobId)
  const generation = job.generations.find((item) => item.id === generationId)
  if (!generation) throw new StudioError("Generation not found.")
  const client = clientOrThrow()
  let decision: Awaited<ReturnType<typeof cancelIfQueued>>
  try {
    decision = await cancelIfQueued({
      providerStatus: generation.providerStatus,
      cancelUrl: generation.cancelUrl,
      client,
    })
  } catch (error) {
    throw new StudioError(safeMessage(error))
  }
  if (!decision.canceled) {
    if (decision.refresh && generation.statusUrl) {
      await refreshGenerationStatus(repo, jobId, generationId)
    }
    throw new StudioError(decision.reason)
  }
  await repo.updateGeneration(generationId, {
    providerStatus: "canceled",
    status: "canceled",
    actualCostCents: null,
    actualCredits: null,
    actualUsd: null,
    costSource: null,
    error: null,
    completedAt: new Date(),
  })
  if (generation.stepId) await repo.updateStep(generation.stepId, { status: "failed" })
}

export async function retryGeneration(repo: JobRepository, jobId: string, generationId: string): Promise<void> {
  const job = await mustJob(repo, jobId)
  const previous = job.generations.find((item) => item.id === generationId)
  if (!previous) throw new StudioError("Generation not found.")
  if (!RETRY_STATUSES.has(previous.status)) {
    throw new StudioError(
      "Retry is available after a failed, moderated, canceled, or timed-out attempt. The existing generation was not changed.",
    )
  }
  const step = job.steps.find((item) => item.id === previous.stepId)
  if (!step) throw new StudioError("This generation is not attached to a step.")
  if (process.env.STUDIO_OPERATOR_MODE !== "live") {
    await localStep(repo, job, step, previous.id)
    return
  }
  const wired = assertLiveSubmittable(step.selectedModel)
  const client = clientOrThrow()
  const body = wired === "soul" ? soulBody(job, step) : klingBody(job, step)
  let generationIdNew = ""
  try {
    const result = await executeGeneration({
      endpointId: step.selectedModel,
      body,
      expectedKind: wired === "soul" ? "image" : "video",
      client,
      timeoutMs: pollTimeoutMs(),
      onEstimated: async (estimate) => {
        const current = await repo.getJob(job.id)
        const spent = spentGenerationCents(current?.generations ?? [])
        if (job.maxBudgetCents != null && spent + estimate.cents > job.maxBudgetCents) {
          throw new StudioError("The Higgsfield estimate exceeds the approved production budget. No retry was submitted.")
        }
        generationIdNew = await repo.createGeneration({
          jobId: job.id,
          stepId: step.id,
          retryOfId: previous.id,
          providerRequestId: "pending",
          model: step.selectedModel,
          status: "queued",
          costEstimateCents: estimate.cents,
          estimatedCredits: estimate.credits,
          estimatedUsd: estimate.usd,
          costSource: "provider_estimate",
          settingsJson: JSON.stringify(body),
          actualCostCents: null,
        })
      },
      onSubmitted: async (handle) => {
        await repo.updateGeneration(generationIdNew, {
          providerRequestId: handle.requestId,
          providerStatus: handle.status,
          statusUrl: handle.statusUrl,
          cancelUrl: handle.cancelUrl,
          correlationId: handle.correlationId,
          status: desk(handle.status),
        })
      },
    })
    await applyResult(repo, job.id, generationIdNew, result)
    await repo.updateStep(step.id, { status: stepStatus(result.deskStatus) })
  } catch (error) {
    if (generationIdNew) {
      await repo.updateGeneration(generationIdNew, {
        status: "failed",
        actualCostCents: null,
        costSource: null,
        error: safeMessage(error),
        completedAt: new Date(),
      })
    }
    throw new StudioError(safeMessage(error))
  }
  const previousAfter = await repo.getJob(job.id)
  const unchanged = previousAfter?.generations.find((item) => item.id === previous.id)
  if (unchanged && unchanged.status !== previous.status) {
    throw new StudioError("Retry refused to overwrite the earlier attempt.")
  }
}

async function applyResult(repo: JobRepository, jobId: string, generationId: string, result: ExecutionResult) {
  let outputUrl: string | null = null
  let localPath: string | null = null
  let error = result.error
  if (result.deskStatus === "succeeded" && result.asset) {
    try {
      const stored = await storeCopiedAsset({
        asset: result.asset,
        scope: "generations",
        groupId: jobId,
        fileId: generationId,
        publicPath: `/api/assets/${generationId}`,
      })
      outputUrl = stored.outputUrl
      localPath = stored.localPath
    } catch (copyError) {
      error = safeMessage(copyError)
    }
  }
  const finished = result.deskStatus === "succeeded" || result.deskStatus === "failed" || result.deskStatus === "nsfw" || result.deskStatus === "canceled" || result.deskStatus === "timed_out"
  await repo.updateGeneration(generationId, {
    providerRequestId: result.handle.requestId,
    providerStatus: result.providerStatus,
    status: result.deskStatus as GenerationDeskStatus,
    statusUrl: result.outcome.snapshot?.statusUrl ?? result.handle.statusUrl,
    cancelUrl: result.outcome.snapshot?.cancelUrl ?? result.handle.cancelUrl,
    correlationId: result.handle.correlationId,
    actualCostCents: result.actualCostCents,
    actualUsd: result.actualUsd,
    actualCredits: result.actualCredits,
    costSource: result.costSource,
    assetKind: result.asset?.kind ?? null,
    providerOutputUrl: result.asset?.url ?? null,
    outputUrl,
    localPath,
    error,
    completedAt: finished ? new Date() : null,
  })
}

function promptFor(job: JobDetail, step: WorkflowStepRecord): string {
  return [job.title, step.purpose, step.expectedOutputs.join(". ")].filter(Boolean).join(". ")
}

function soulBody(job: JobDetail, step: WorkflowStepRecord) {
  const aspect = job.analysis?.effective.deliverables.find((item) => item.aspectRatio)?.aspectRatio ?? null
  const resolution = /1080/.test(`${job.rawBrief}\n${step.purpose}`) ? "1080p" : "720p"
  return buildSoulV2Input({ prompt: promptFor(job, step), aspectRatio: aspect, resolution })
}

function klingBody(job: JobDetail, step: WorkflowStepRecord) {
  const aspect = job.analysis?.effective.deliverables.find((item) => item.aspectRatio)?.aspectRatio ?? null
  const durationText = job.analysis?.effective.deliverables.find((item) => item.duration)?.duration ?? step.purpose
  const silent = /silent|no voice|without sound|no audio/i.test(`${job.rawBrief}\n${step.purpose}`)
  return buildKlingStandardInput({
    prompt: promptFor(job, step),
    aspectRatio: aspect,
    durationSeconds: secondsFrom(durationText),
    sound: silent ? "off" : "on",
  })
}

function secondsFrom(text: string): number | null {
  const match = text.match(/(\d+)\s*-?\s*seconds?/i)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isInteger(value) || value < 3 || value > 15) return null
  return value
}

function desk(status: string): GenerationDeskStatus {
  if (status === "completed") return "succeeded"
  if (status === "queued" || status === "in_progress" || status === "failed" || status === "nsfw" || status === "canceled") {
    return status
  }
  return "failed"
}

function stepStatus(deskStatus: string): "complete" | "failed" | "running" {
  if (deskStatus === "succeeded") return "complete"
  if (deskStatus === "failed" || deskStatus === "nsfw" || deskStatus === "canceled") return "failed"
  return "running"
}

function modelKindFromEndpoint(model: string): string {
  if (model.includes("soul")) return "image"
  if (model.includes("kling") || model.includes("dop")) return "video"
  return ""
}

async function mustJob(repo: JobRepository, jobId: string): Promise<JobDetail> {
  const job = await repo.getJob(jobId)
  if (!job) throw new StudioError("Job not found.")
  return job
}
