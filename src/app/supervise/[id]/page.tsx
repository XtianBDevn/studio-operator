import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Flash } from "@/components/flash"
import { SubmitButton } from "@/components/submit-button"
import { isDemoJobId } from "@/lib/demos"
import { formatMoney } from "@/lib/money"
import { templateById } from "@/lib/service-templates"
import { superviseContinueAction, superviseResetAction } from "@/server/actions"
import { jobs } from "@/server/repositories"
import {
  getAccount,
  getAutonomySettings,
  getJobLink,
  listAudit,
  listMessages,
} from "@/server/repositories/autonomy-repository"
import { beatCopy, currentBeat } from "@/server/supervise"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params
  const job = await jobs.getJob(id)
  return { title: job ? `Supervise · ${job.title}` : "Supervise" }
}

export default async function SupervisePage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const { id } = await props.params
  const search = await props.searchParams
  if (!isDemoJobId(id)) notFound()
  const job = await jobs.getJob(id)
  if (!job) notFound()

  const [beat, messages, audit, settings, link] = await Promise.all([
    currentBeat(id),
    listMessages(id),
    listAudit(id),
    getAutonomySettings(),
    getJobLink(id),
  ])
  const account = link ? await getAccount(link.accountId) : null
  const template = link ? templateById(link.templateId) : null
  const copy = beatCopy(beat)
  const delivered = job.status === "delivered"

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
      <Link href="/autonomy" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        Autonomy settings
      </Link>
      <p className="mt-4 text-sm tracking-[0.16em] text-muted-foreground uppercase">Supervised run</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">{job.title}</h1>
      <p className="mt-2 text-base text-muted-foreground">
        {account ? account.name : "No client account"} · {template ? template.name : link?.templateId ?? "No template"} ·{" "}
        {job.status}
        {delivered ? " · a person approved delivery" : ""}
      </p>
      <div className="mt-4">
        <Flash error={search.error} notice={search.notice} />
      </div>

      <p className="mt-6 text-4xl font-medium tracking-tight md:text-5xl">{copy.label}</p>
      <p className="mt-3 max-w-3xl text-lg leading-8">{copy.detail}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Automatic spend {formatMoney(settings.maxAutoSpendPerJobCents)} per job and{" "}
        {formatMoney(settings.maxAutoSpendPerRepairCents)} per repair.
        {settings.finalDeliveryRequiresApproval
          ? " Final delivery requires a person."
          : " Final delivery approval is turned off in settings. This runner still will not mark the job delivered on its own."}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {beat !== "done" ? (
          <form action={superviseContinueAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton>{copy.action}</SubmitButton>
          </form>
        ) : null}
        <form action={superviseResetAction}>
          <input type="hidden" name="jobId" value={job.id} />
          <SubmitButton variant="outline">Reset to seeded brief</SubmitButton>
        </form>
        <Link href={`/record/${job.id}`} className="self-center text-sm underline-offset-2 hover:underline">
          Recording
        </Link>
      </div>

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-medium">Client messages</h2>
          {messages.length === 0 ? (
            <p className="mt-3 text-base text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {messages.map((message) => (
                <li key={message.id} className="rounded-xl p-4 ring-1 ring-foreground/10">
                  <p className="text-sm font-medium">
                    {message.kind} · {message.channel} · {message.disposition}
                  </p>
                  <pre className="mt-2 text-sm leading-6 whitespace-pre-wrap">{message.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="text-lg font-medium">Autonomy audit</h2>
          {audit.length === 0 ? (
            <p className="mt-3 text-base text-muted-foreground">No decisions yet.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {audit.map((event) => (
                <li key={event.id} className="rounded-xl p-4 ring-1 ring-foreground/10">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">{event.kind}</p>
                  <p className="mt-1 text-base font-medium">{event.summary}</p>
                  {event.detail ? <pre className="mt-2 text-sm leading-6 whitespace-pre-wrap">{event.detail}</pre> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  )
}
