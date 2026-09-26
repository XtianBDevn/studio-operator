import Link from "next/link"

import { DEMO_SPECS } from "@/lib/demos"
import { formatMoney } from "@/lib/money"
import { jobs } from "@/server/repositories"

export const dynamic = "force-dynamic"

export default async function RecordIndexPage() {
  const summaries = await jobs.listSummaries()
  const seeded = DEMO_SPECS.map((spec) => ({
    spec,
    present: summaries.some((job) => job.id === spec.id),
  }))

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
      <p className="text-sm tracking-[0.16em] text-muted-foreground uppercase">Recording</p>
      <h1 className="mt-2 text-4xl font-medium tracking-tight">Choose a demo</h1>
      <p className="mt-3 max-w-3xl text-lg leading-8 text-muted-foreground">
        Both jobs start from a pasted Upwork-style brief. The same desk picks a different production route for each one. Reset returns a demo to that seeded brief.
      </p>
      <ul className="mt-8 grid gap-4 lg:grid-cols-2">
        {seeded.map(({ spec, present }) => (
          <li key={spec.id} className="rounded-xl p-6 ring-1 ring-foreground/10">
            <h2 className="text-2xl font-medium tracking-tight">{spec.title}</h2>
            <p className="mt-2 text-base text-muted-foreground">
              Fixed package {formatMoney(spec.budgetCents)} · {spec.deadlineOffsetHours} hours · Upwork fee{" "}
              {(spec.channelFeeBps / 100).toFixed(0)}%
            </p>
            <p className="mt-4 text-base leading-7">
              {spec.id === "job_glass_monument"
                ? "A short cinematic film in 9:16 and 16:9, plus three approved keyframes. The route explores cheap concepts, locks keyframes, ships premium motion, and keeps one continuity repair."
                : "One atmospheric orbit and one hero still. The route skips concept search and uses a controlled still plus a cinematic orbit."}
            </p>
            {present ? (
              <Link href={`/record/${spec.id}`} className="mt-6 inline-block text-lg underline-offset-2 hover:underline">
                Open recording
              </Link>
            ) : (
              <p className="mt-6 text-base text-muted-foreground">This demo is not in the database. Run npm run db:reset.</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
