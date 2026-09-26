import Link from "next/link"

import { formatWhen } from "@/lib/format"
import { formatMoney, formatPercentFromBps } from "@/lib/money"
import { computeProfitability } from "@/lib/profitability"
import { sourceLabel } from "@/lib/sources"
import { JOB_STATUSES, statusLabel, statusTone } from "@/lib/statuses"
import { decisionLabel } from "@/lib/analysis"
import type { JobSummary } from "@/lib/types"
import { Badge } from "@/components/ui/badge"

export function PipelineBoard({ jobs }: { jobs: JobSummary[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {JOB_STATUSES.map((column) => {
        const cards = jobs.filter((job) => job.status === column.id)
        return (
          <section key={column.id} className="w-[240px] shrink-0">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {column.label}
              </h2>
              <span className="text-xs tabular-nums text-muted-foreground">{cards.length}</span>
            </div>
            <div className="space-y-2">
              {cards.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Empty
                </p>
              ) : (
                cards.map((job) => <JobCard key={job.id} job={job} />)
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function JobCard({ job }: { job: JobSummary }) {
  const profit = computeProfitability({
    clientPriceCents: job.budgetCents,
    estimatedGenerationCents: job.estimatedGenerationCents,
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
  })

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-5 font-medium">{job.title}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {sourceLabel(job.source)} · {formatMoney(job.budgetCents)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Due {formatWhen(job.deadline)}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className={statusTone(job.status)}>
          {statusLabel(job.status)}
        </Badge>
        {job.decision ? (
          <Badge variant="outline">{decisionLabel(job.decision)}</Badge>
        ) : null}
      </div>
      {job.hasPlan ? (
        <p className="mt-3 text-xs tabular-nums text-muted-foreground">
          Margin {formatMoney(profit.expectedGrossMarginCents)} · {formatPercentFromBps(profit.marginBps)}
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No plan yet</p>
      )}
    </Link>
  )
}
