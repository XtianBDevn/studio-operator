import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Flash } from "@/components/flash"
import { SubmitButton } from "@/components/submit-button"
import { templateById } from "@/lib/service-templates"
import { consentCheckAction } from "@/server/actions"
import { getAccount, listJobLinks } from "@/server/repositories/autonomy-repository"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params
  const account = await getAccount(id)
  return { title: account ? account.name : "Client" }
}

export default async function ClientPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const { id } = await props.params
  const search = await props.searchParams
  const account = await getAccount(id)
  if (!account) notFound()
  const links = await listJobLinks(id)
  const memory = account.memory

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <Link href="/clients" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        All clients
      </Link>
      <h1 className="mt-3 text-4xl font-medium tracking-tight">{account.name}</h1>
      <p className="mt-2 text-base text-muted-foreground">First-party {account.channel}</p>
      <div className="mt-4">
        <Flash error={search.error} notice={search.notice} />
      </div>

      {memory ? (
        <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
          <Memory label="Logos" value={memory.logos.join(", ") || "None stored"} />
          <Memory label="Colors" value={memory.colors.join(", ") || "None stored"} />
          <Memory label="Fonts" value={memory.fonts.join(", ") || "None stored"} />
          <Memory label="Tone" value={memory.tone || "None stored"} />
          <Memory label="Product" value={memory.productDetails || "None stored"} />
          <Memory label="Winning assets" value={memory.winningAssets.join(", ") || "None stored"} />
          <Memory label="Rejected styles" value={memory.rejectedStyles.join(", ") || "None stored"} />
          <Memory label="Delivery" value={memory.deliveryPreferences || "None stored"} />
          <Memory label="Communication" value={memory.communicationPreferences || "None stored"} />
        </dl>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">No memory is stored for this account.</p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Stored consent</h2>
        {account.consents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No likeness or voice consent is stored.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {account.consents.map((consent) => (
              <li key={consent.id} className="rounded-lg px-3 py-2 text-sm ring-1 ring-foreground/10">
                {consent.personLabel} · {consent.kind} · {consent.useScope}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Check a new use</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          This check does not save anything. A match needs the same person, the same kind, and the same use.
        </p>
        <form action={consentCheckAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="accountId" value={account.id} />
          <label className="text-sm">
            Person
            <input name="personLabel" className={fieldClass} required />
          </label>
          <label className="text-sm">
            Kind
            <select name="kind" className={fieldClass} defaultValue="voice">
              <option value="voice">Voice</option>
              <option value="likeness">Likeness</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Exact use
            <input name="useScope" className={fieldClass} required />
          </label>
          <div>
            <SubmitButton>Check consent</SubmitButton>
          </div>
        </form>
      </section>

      {links.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Linked jobs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {links.map((link) => (
              <li key={link.jobId}>
                <Link href={`/supervise/${link.jobId}`} className="underline-offset-2 hover:underline">
                  {link.jobId}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {templateById(link.templateId)?.name ?? link.templateId}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

function Memory({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2 ring-1 ring-foreground/10">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  )
}

const fieldClass =
  "mt-2 h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
