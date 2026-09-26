import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Flash } from "@/components/flash"
import { ReviewAnalysisForm } from "@/components/review-analysis-form"
import { jobs } from "@/server/repositories"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Review analysis" }

export default async function ReviewAnalysisPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const { id } = await props.params
  const search = await props.searchParams
  const job = await jobs.getJob(id)
  if (!job) notFound()

  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
      <Link href={`/jobs/${job.id}?tab=decision`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        {job.title}
      </Link>
      <h1 className="mt-3 text-xl font-medium tracking-tight">Review analysis</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
        Edit any extracted field. Saving keeps the original analysis and stores this version beside it.
        The desk recalculates profitability from the catalog. Approve accepts the job for planning. Reject
        declines it on this desk and does not message a marketplace.
      </p>
      <div className="mt-4">
        <Flash error={search.error} notice={search.notice} />
      </div>
      {job.analysis ? (
        <div className="mt-4">
          <ReviewAnalysisForm
            jobId={job.id}
            original={job.analysis.original}
            edited={job.analysis.edited}
            locked={["generating", "qa", "delivered"].includes(job.status)}
          />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Analyze the pasted brief before reviewing it.</p>
      )}
    </main>
  )
}
