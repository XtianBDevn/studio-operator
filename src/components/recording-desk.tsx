import Link from "next/link"

import { QaPanel } from "@/components/qa-panel"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { centsToDollarInput, formatMoney, formatPercentFromBps } from "@/lib/money"
import type { Profitability } from "@/lib/profitability"
import { recordingPause, type RecordingSnapshot } from "@/lib/recording"
import { catalogById } from "@/lib/router-catalog"
import { sourceLabel } from "@/lib/sources"
import { statusLabel } from "@/lib/statuses"
import type { GenerationRecord, JobDetail } from "@/lib/types"
import { spentGenerationCents } from "@/lib/types"
import { recordCommercialsAction, recordContinueAction, recordResetAction } from "@/server/actions"

const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function RecordingDesk({
  job,
  profit,
}: {
  job: JobDetail
  profit: Profitability
}) {
  const pause = recordingPause(snapshotOf(job))
  const spent = spentGenerationCents(job.generations)
  const canStep = pause.id !== "done" && pause.id !== "stopped"
  const locked = job.status === "delivered"

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.16em] text-muted-foreground uppercase">Recording</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">{job.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {sourceLabel(job.source)} · {statusLabel(job.status)}
          </p>
        </div>
        <Badge variant="outline" className="px-3 py-1 text-sm">
          {pause.label}
        </Badge>
      </div>

      <p className="text-4xl font-medium tracking-tight md:text-5xl">{pause.label}</p>

      <div className="flex flex-wrap gap-3">
        {canStep ? (
          <form action={recordContinueAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton>{continueLabel(pause.id)}</SubmitButton>
          </form>
        ) : null}
        <form action={recordResetAction}>
          <input type="hidden" name="jobId" value={job.id} />
          <SubmitButton variant="outline">Reset to seeded brief</SubmitButton>
        </form>
        <Link href={`/supervise/${job.id}`} className="self-center text-sm underline-offset-2 hover:underline">
          Supervised run
        </Link>
        <Link href={`/jobs/${job.id}`} className="self-center text-sm underline-offset-2 hover:underline">
          Open the desk
        </Link>
      </div>

      {job.steps.length > 0 ? (
        <section>
          <h2 className="text-lg font-medium">Production route</h2>
          <ul className="mt-3 divide-y rounded-xl ring-1 ring-foreground/10">
            {job.steps.map((step) => (
              <li key={step.id} className="grid gap-1 px-4 py-3 md:grid-cols-[8rem_8rem_minmax(0,1fr)_9rem] md:items-baseline">
                <p className="text-sm tracking-wide uppercase">{step.routeStage ?? "step"}</p>
                <p className="text-sm font-medium">{step.routeRole ?? ""}</p>
                <p className="text-base">
                  {step.name}
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {catalogById(step.selectedModel)?.label ?? step.selectedModel}
                  </span>
                </p>
                <p className="text-base">{formatMoney(step.estimatedTotalCents)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-lg text-muted-foreground">The route appears after analysis.</p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-xl p-5 ring-1 ring-foreground/10">
          <h2 className="text-lg font-medium">Cost ledger</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Each line is desk planning spend for a generation. It is not a Higgsfield quote. Failed, NSFW, canceled, and timed-out rows stay at zero.
          </p>
          {job.generations.length === 0 ? (
            <p className="mt-4 text-base">No generations yet. Production spend is {formatMoney(0)}.</p>
          ) : (
            <table className="mt-4 w-full text-left text-base">
              <thead className="text-sm text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Generation</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {job.generations.map((generation) => (
                  <tr key={generation.id} className="border-t">
                    <td className="py-2 pr-3">{generationLabel(generation)}</td>
                    <td className="py-2 pr-3">{generation.status}</td>
                    <td className="py-2 text-right">{formatMoney(chargedCents(generation))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="py-3 font-medium" colSpan={2}>
                    Total production spend
                  </td>
                  <td className="py-3 text-right text-lg font-medium">{formatMoney(spent)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        <section className="rounded-xl p-5 ring-1 ring-foreground/10">
          <h2 className="text-lg font-medium">Client price and margin</h2>
          <form action={recordCommercialsAction} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="jobId" value={job.id} />
            <label className="block text-sm">
              Client price
              <input
                className={`mt-1 ${fieldClass}`}
                name="budget"
                defaultValue={centsToDollarInput(job.budgetCents)}
                inputMode="decimal"
                disabled={locked}
              />
            </label>
            <label className="block text-sm">
              Channel fee %
              <input
                className={`mt-1 ${fieldClass}`}
                name="channelPercent"
                defaultValue={(job.channelFeeBps / 100).toFixed(2)}
                inputMode="decimal"
                disabled={locked}
              />
            </label>
            <label className="block text-sm">
              Contingency %
              <input
                className={`mt-1 ${fieldClass}`}
                name="contingencyPercent"
                defaultValue={(job.contingencyBps / 100).toFixed(2)}
                inputMode="decimal"
                disabled={locked}
              />
            </label>
            {locked ? null : (
              <div className="sm:col-span-3">
                <SubmitButton variant="outline">Update price and fee</SubmitButton>
              </div>
            )}
          </form>
          <dl className="mt-5 grid gap-3 text-base sm:grid-cols-2">
            <Metric label="Client price" value={formatMoney(profit.clientPriceCents)} />
            <Metric label={`Channel fee (${formatPercentFromBps(job.channelFeeBps)})`} value={formatMoney(profit.channelFeeCents)} />
            <Metric label="API cost" value={formatMoney(profit.actualGenerationCents ?? profit.estimatedGenerationCents)} />
            <Metric label={`Contingency (${formatPercentFromBps(job.contingencyBps)})`} value={formatMoney(profit.contingencyCents)} />
            <Metric label="Expected gross profit" value={formatMoney(profit.expectedGrossMarginCents)} />
          </dl>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            API cost is the desk planning rate{profit.actualGenerationCents != null ? " already spent" : " on the current plan"}. Contingency is a percent of that generation figure. The channel fee is a percent of the client price.
          </p>
        </section>
      </div>

      {job.qaReports[0] ? <QaPanel report={job.qaReports[0]} /> : null}

      {job.deliveryNote ? (
        <section className="space-y-4 rounded-xl p-5 ring-1 ring-foreground/10">
          <h2 className="text-lg font-medium">Deliverables</h2>
          <ul className="space-y-2 text-base">
            {job.generations
              .filter((generation) => generation.outputUrl && generation.status === "succeeded")
              .map((generation) => (
                <li key={generation.id}>
                  <a className="underline-offset-2 hover:underline" href={generation.outputUrl ?? "#"}>
                    Download {generationLabel(generation)}
                  </a>
                </li>
              ))}
            <li>
              <a className="underline-offset-2 hover:underline" href={`/api/delivery-note/${job.id}`}>
                Download delivery note
              </a>
            </li>
          </ul>
          <div>
            <p className="text-sm text-muted-foreground">{job.deliveryNote.modelLabel}</p>
            <pre className="mt-2 font-sans text-base leading-7 whitespace-pre-wrap">{job.deliveryNote.body}</pre>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function snapshotOf(job: JobDetail): RecordingSnapshot {
  return {
    status: job.status,
    hasAnalysis: Boolean(job.analysis),
    stepCount: job.steps.length,
    decision: job.analysis?.decision ?? null,
    openGates: job.approvals.filter((gate) => gate.status === "required").map((gate) => gate.kind),
    latestVerdict: job.qaReports[0]?.verdict ?? null,
  }
}

function continueLabel(id: string): string {
  if (id === "analysis") return "Continue — analyze the brief"
  if (id === "plan") return "Continue — build the plan"
  if (id === "approval") return "Continue — approve the maximum"
  if (id === "generation") return "Continue — generate"
  if (id === "qa") return "Continue — run QA"
  if (id === "repair") return "Continue — approve the repair"
  if (id === "delivery") return "Continue — record delivery"
  return "Continue"
}

function generationLabel(generation: GenerationRecord): string {
  return catalogById(generation.model)?.label ?? generation.model
}

function chargedCents(generation: GenerationRecord): number {
  if (
    generation.status === "failed" ||
    generation.status === "nsfw" ||
    generation.status === "canceled" ||
    generation.status === "timed_out"
  ) {
    return 0
  }
  return generation.actualCostCents ?? generation.costEstimateCents
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tracking-tight">{value}</dd>
    </div>
  )
}
