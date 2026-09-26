import type { Metadata } from "next"
import Link from "next/link"

import { listAccounts } from "@/server/repositories/autonomy-repository"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Clients" }

export default async function ClientsPage() {
  const accounts = await listAccounts()

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <Link href="/autonomy" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        Autonomy
      </Link>
      <h1 className="mt-3 text-4xl font-medium tracking-tight">Client memory</h1>
      <p className="mt-3 max-w-3xl text-lg leading-8 text-muted-foreground">
        Logos, color, type, tone, and delivery preferences stay on the account. A likeness or voice approval covers
        one person and one use. It does not cover a new person or a different film.
      </p>
      <ul className="mt-8 grid gap-4">
        {accounts.map((account) => (
          <li key={account.id} className="rounded-xl p-5 ring-1 ring-foreground/10">
            <h2 className="text-xl font-medium">{account.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              First-party {account.channel} · {account.consents.length} stored consent
              {account.consents.length === 1 ? "" : "s"}
            </p>
            <Link href={`/clients/${account.id}`} className="mt-3 inline-block text-sm underline-offset-2 hover:underline">
              Open memory
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
