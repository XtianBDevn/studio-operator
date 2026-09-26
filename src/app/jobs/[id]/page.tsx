import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ApprovalTimeline } from "@/components/approval-timeline"
import { Flash } from "@/components/flash"
import { JobActions } from "@/components/job-actions"
import { JobTabs } from "@/components/job-tabs"
import { ProfitabilityPanel } from "@/components/profitability-panel"
import { Badge } from "@/components/ui/badge"
import { isDemoJobId } from "@/lib/demos"
import { formatWhen } from "@/lib/format"
import { sourceLabel } from "@/lib/sources"
import { statusLabel, statusTone } from "@/lib/statuses"
import { estimatedGenerationCents, spentGenerationCents } from "@/lib/types"
import { computeProfitability } from "@/lib/profitability"
import { jobs } from "@/server/repositories"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await props.params
  const job = await jobs.getJob(id)
  return { title: job?.title ?? "Job" }
}

export default async function JobPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string; tab?: string }>
}) {
  const { id } = await props.params
  const search = await props.searchParams
  const job = await jobs.getJob(id)
  if (!job) notFound()

  const profit = computeProfitability({
    clientPriceCents: job.budgetCents,
    estimatedGenerationCents: estimatedGenerationCents(job.steps),
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
    actualGenerationCents: job.generations.length ? spentGenerationCents(job.generations) : null,
    maxBudgetCents: job.maxBudgetCents,
  })

  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
      <Link href="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        Pipeline
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight">{job.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sourceLabel(job.source)} · due {formatWhen(job.deadline)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDemoJobId(job.id) ? (
            <Link href={`/record/${job.id}`} className="text-sm underline-offset-2 hover:underline">
              Recording
            </Link>
          ) : null}
          <Badge variant="outline" className={statusTone(job.status)}>
            {statusLabel(job.status)}
          </Badge>
        </div>
      </div>
      <div className="mt-4">
        <Flash error={search.error} notice={search.notice} />
      </div>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <JobActions job={job} />
          <JobTabs job={job} initialTab={search.tab ?? "brief"} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-4">
          <ProfitabilityPanel
            profit={profit}
            source={job.source}
            contingencyBps={job.contingencyBps}
            channelFeeBps={job.channelFeeBps}
            hasPlan={job.steps.length > 0}
          />
          <ApprovalTimeline job={job} />
        </aside>
      </div>
    </main>
  )
}
