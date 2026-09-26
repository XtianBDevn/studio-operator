import { SubmitButton } from "@/components/submit-button"
import { formatDateTime } from "@/lib/format"
import { formatMoney } from "@/lib/money"
import type { GenerationRecord, JobDetail } from "@/lib/types"
import {
  cancelGenerationAction,
  refreshGenerationAction,
  retryGenerationAction,
} from "@/server/actions"
import { modelById } from "@/server/services/models"

const UNCHARGED = new Set(["failed", "nsfw", "canceled", "timed_out"])

export function GenerationTimeline({ job, live }: { job: JobDetail; live: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {live
          ? "Live mode submits only SOUL V2 and Kling 3.0 Standard text-to-video. Any other route step fails before a provider call. Planning rates are not list prices."
          : "Mock mode is on. These frames are local previews. Higgsfield is not called."}
      </p>
      {job.generations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No generation requests yet.</p>
      ) : (
        <ul className="grid gap-3">
          {job.generations.map((generation) => (
            <GenerationCard key={generation.id} job={job} generation={generation} />
          ))}
        </ul>
      )}
    </div>
  )
}

function GenerationCard({ job, generation }: { job: JobDetail; generation: GenerationRecord }) {
  const step = job.steps.find((item) => item.id === generation.stepId)
  const model = modelById(generation.model)
  const retryOf = generation.retryOfId
    ? job.generations.find((item) => item.id === generation.retryOfId)
    : undefined
  const settings = prettySettings(generation.settingsJson)
  const canCancel = generation.providerStatus === "queued" && Boolean(generation.cancelUrl)
  const canRetry = UNCHARGED.has(generation.status)
  const canRefresh =
    Boolean(generation.statusUrl) &&
    (generation.status === "queued" ||
      generation.status === "running" ||
      generation.status === "in_progress" ||
      generation.status === "timed_out")

  return (
    <li className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <OutputFrame generation={generation} title={step?.name ?? "Revision pass"} />
      <div className="space-y-2 p-3 text-xs">
        <p className="text-sm">{step?.name ?? "Revision pass"}</p>
        <p>
          <span className="text-muted-foreground">Model </span>
          {model?.label ?? generation.model}
        </p>
        <p className="font-mono text-[11px] break-all">{generation.model}</p>
        <p>
          <span className="text-muted-foreground">Provider status </span>
          {generation.providerStatus ?? "—"}
          <span className="text-muted-foreground"> · Desk status </span>
          {generation.status}
        </p>
        {generation.status === "timed_out" ? (
          <p>
            Application timeout. The provider status above is unchanged. timed_out is not a Higgsfield status.
          </p>
        ) : null}
        <p>
          <span className="text-muted-foreground">Estimate </span>
          {formatMoney(generation.costEstimateCents)}
          {generation.estimatedUsd ? ` · ${generation.estimatedUsd} USD` : ""}
          {generation.estimatedCredits ? ` · ${generation.estimatedCredits} credits` : ""}
        </p>
        <p>
          <span className="text-muted-foreground">Recorded cost </span>
          {recordedCost(generation)}
          {generation.costSource ? ` · ${generation.costSource}` : ""}
        </p>
        {settings ? (
          <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] whitespace-pre-wrap">
            {settings}
          </pre>
        ) : null}
        <p className="font-mono text-[11px] break-all text-muted-foreground">
          Request {generation.providerRequestId}
        </p>
        {generation.statusUrl ? (
          <p className="font-mono text-[11px] break-all text-muted-foreground">{generation.statusUrl}</p>
        ) : null}
        {generation.correlationId ? (
          <p className="font-mono text-[11px] text-muted-foreground">Correlation {generation.correlationId}</p>
        ) : null}
        {retryOf ? (
          <p className="text-muted-foreground">Retry of {retryOf.providerRequestId}. The earlier row was kept.</p>
        ) : null}
        {generation.error ? <p className="text-rose-800">{generation.error}</p> : null}
        <p className="text-muted-foreground">
          Started {formatDateTime(generation.createdAt)}
          {generation.completedAt ? ` · finished ${formatDateTime(generation.completedAt)}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {canCancel ? (
            <form action={cancelGenerationAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="generationId" value={generation.id} />
              <SubmitButton variant="outline">Cancel queued request</SubmitButton>
            </form>
          ) : null}
          {canRefresh ? (
            <form action={refreshGenerationAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="generationId" value={generation.id} />
              <SubmitButton variant="outline">Check status</SubmitButton>
            </form>
          ) : null}
          {canRetry ? (
            <form action={retryGenerationAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="generationId" value={generation.id} />
              <SubmitButton variant="outline">Retry as new generation</SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function OutputFrame({ generation, title }: { generation: GenerationRecord; title: string }) {
  if (!generation.outputUrl) {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted text-xs text-muted-foreground">
        {generation.status}
      </div>
    )
  }
  if (generation.assetKind === "video") {
    return <video src={generation.outputUrl} controls className="aspect-video w-full bg-muted" />
  }
  if (generation.assetKind === "audio") {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted px-4">
        <audio src={generation.outputUrl} controls className="w-full" />
      </div>
    )
  }
  return (
    // Local previews and copied stills are served by this app.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={generation.outputUrl} alt={`${title} output`} className="aspect-video w-full bg-muted object-cover" />
  )
}

function recordedCost(generation: GenerationRecord): string {
  if (UNCHARGED.has(generation.status)) return "Not charged"
  if (generation.actualCostCents == null) return "Not recorded yet"
  const usd = generation.actualUsd ? ` (${generation.actualUsd} USD)` : ""
  return `${formatMoney(generation.actualCostCents)}${usd}`
}

function prettySettings(value: string | null): string | null {
  if (!value) return null
  try {
    return JSON.stringify(JSON.parse(value) as unknown, null, 2)
  } catch {
    return value
  }
}
