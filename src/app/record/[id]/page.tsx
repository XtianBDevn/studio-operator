import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Flash } from "@/components/flash"
import { RecordingDesk } from "@/components/recording-desk"
import { isDemoJobId } from "@/lib/demos"
import { computeProfitability } from "@/lib/profitability"
import { estimatedGenerationCents, spentGenerationCents } from "@/lib/types"
import { jobs } from "@/server/repositories"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await props.params
  const job = await jobs.getJob(id)
  return { title: job ? `Recording · ${job.title}` : "Recording" }
}

export default async function RecordJobPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const { id } = await props.params
  const search = await props.searchParams
  if (!isDemoJobId(id)) notFound()
  const job = await jobs.getJob(id)
  if (!job) notFound()

  const spent = job.generations.length ? spentGenerationCents(job.generations) : null
  const apiCost = spent ?? estimatedGenerationCents(job.steps)
  const profit = computeProfitability({
    clientPriceCents: job.budgetCents,
    estimatedGenerationCents: apiCost,
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
    actualGenerationCents: spent,
    maxBudgetCents: job.maxBudgetCents,
  })

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
      <Link href="/record" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        All recordings
      </Link>
      <div className="mt-4">
        <Flash error={search.error} notice={search.notice} />
      </div>
      <div className="mt-4">
        <RecordingDesk job={job} profit={profit} />
      </div>
    </main>
  )
}
