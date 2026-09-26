import type { Metadata } from "next"
import Link from "next/link"

import { Flash } from "@/components/flash"
import { SubmitButton } from "@/components/submit-button"
import { formatDateTime } from "@/lib/format"
import { formatMoney } from "@/lib/money"
import { connectionTestAction } from "@/server/actions"
import { connectionTestAvailability } from "@/server/connection-test"
import { connectionTests } from "@/server/repositories"
import { CONNECTION_TEST_PROMPT, HIGGSFIELD_DOCS, SOUL_V2 } from "@/server/services/higgsfield/workflows"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Connection test" }

export default async function ConnectionPage(props: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const search = await props.searchParams
  const availability = connectionTestAvailability()
  const tests = await connectionTests.list()

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-6">
      <Link href="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        Pipeline
      </Link>
      <h1 className="mt-3 text-xl font-medium tracking-tight">Higgsfield connection test</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        This sends the smallest documented SOUL V2 still: 720p, 1:1, one image, prompt enhancement off. The desk
        estimates the cost, then submits only after you confirm. Credentials stay on the server.
      </p>
      <div className="mt-4">
        <Flash error={search.error} notice={search.notice} />
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-muted-foreground">Credentials configured</dt>
          <dd>{availability.configured ? "Yes" : "No"}</dd>
        </div>
        <div className="flex justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-muted-foreground">Desk generation mode</dt>
          <dd>{availability.mode}</dd>
        </div>
        <div className="flex justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-muted-foreground">Endpoint</dt>
          <dd className="font-mono text-xs">{SOUL_V2.endpointId}</dd>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-muted-foreground">Prompt</dt>
          <dd className="mt-1">{CONNECTION_TEST_PROMPT}</dd>
        </div>
      </dl>
      <form action={connectionTestAction} className="mt-4 space-y-3 rounded-lg ring-1 ring-foreground/10 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" value="yes" className="mt-1" required={availability.configured} />
          <span>I confirm this sends a paid Higgsfield image request using the server credentials.</span>
        </label>
        <SubmitButton pendingLabel="Contacting Higgsfield…">
          {availability.configured ? "Run connection test" : "Credentials required"}
        </SubmitButton>
        {availability.configured ? null : (
          <p className="text-xs text-muted-foreground">
            Set HF_API_KEY_ID and HF_API_KEY_SECRET on the server. This screen will not call Higgsfield until both are
            present and you confirm.
          </p>
        )}
      </form>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Docs:{" "}
        <a className="underline" href={HIGGSFIELD_DOCS.soulV2}>
          SOUL V2
        </a>
        ,{" "}
        <a className="underline" href={HIGGSFIELD_DOCS.billing}>
          estimate
        </a>
        ,{" "}
        <a className="underline" href={HIGGSFIELD_DOCS.requests}>
          request lifecycle
        </a>
        . Webhooks are not used; this desk polls the returned status URL.
      </p>
      <h2 className="mt-8 text-sm font-medium">Recent tests</h2>
      {tests.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No connection tests yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {tests.map((test) => (
            <li key={test.id} className="rounded-lg bg-muted/40 p-3 text-xs">
              <p className="font-mono text-[11px]">{test.endpointId}</p>
              <p className="mt-1">
                Provider {test.providerStatus ?? "—"} · Desk {test.appStatus}
                {test.appStatus === "timed_out" ? " (application timeout, not a provider status)" : ""}
              </p>
              <p className="mt-1">
                Estimate{" "}
                {test.costEstimateCents != null ? formatMoney(test.costEstimateCents) : "—"}
                {test.estimatedUsd ? ` · ${test.estimatedUsd} USD` : ""}
                {test.estimatedCredits ? ` · ${test.estimatedCredits} credits` : ""}
                {" · Recorded "}
                {test.actualCostCents != null ? formatMoney(test.actualCostCents) : "not charged"}
              </p>
              {test.providerRequestId ? (
                <p className="mt-1 font-mono text-[11px] break-all">Request {test.providerRequestId}</p>
              ) : null}
              {test.statusUrl ? <p className="font-mono text-[11px] break-all">{test.statusUrl}</p> : null}
              {test.outputUrl ? (
                // Copied into app storage. The provider URL is not shown.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={test.outputUrl} alt="Connection test output" className="mt-2 aspect-square w-40 rounded-md" />
              ) : null}
              {test.error ? <p className="mt-1 text-rose-800">{test.error}</p> : null}
              <p className="mt-1 text-muted-foreground">{formatDateTime(test.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
