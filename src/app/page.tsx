import Link from "next/link"

import { PipelineBoard } from "@/components/pipeline-board"
import { formatMoney } from "@/lib/money"
import { computeProfitability } from "@/lib/profitability"
import { jobs } from "@/server/repositories"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const summaries = await jobs.listSummaries()
  const open = summaries.filter((job) => job.status !== "delivered" && job.status !== "rejected")
  const forecast = open
    .filter((job) => job.hasPlan)
    .reduce((sum, job) => {
      const profit = computeProfitability({
        clientPriceCents: job.budgetCents,
        estimatedGenerationCents: job.estimatedGenerationCents,
        contingencyBps: job.contingencyBps,
        channelFeeBps: job.channelFeeBps,
      })
      return sum + profit.expectedGrossMarginCents
    }, 0)

  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Job pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {summaries.length} jobs · {open.length} open
            {open.some((job) => job.hasPlan)
              ? ` · ${formatMoney(forecast)} expected margin on planned open work`
              : ""}
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/autonomy" className="text-sm underline-offset-2 hover:underline">
            Autonomy
          </Link>
          <Link href="/record" className="text-sm underline-offset-2 hover:underline">
            Recording
          </Link>
          <Link href="/jobs/new" className="text-sm underline-offset-2 hover:underline">
            Paste a brief
          </Link>
        </div>
      </div>
      <PipelineBoard jobs={summaries} />
    </main>
  )
}
