import type { Metadata } from "next"
import Link from "next/link"

import { Flash } from "@/components/flash"
import { SubmitButton } from "@/components/submit-button"
import { CAPABILITIES, OPERATOR_SYSTEM_PROMPT } from "@/lib/analysis"
import { MESSAGE_KINDS, PAUSE_CONDITIONS } from "@/lib/autonomy-policy"
import { GLASS_MONUMENT, NIGHT_ORCHARD } from "@/lib/demos"
import { centsToDollarInput } from "@/lib/money"
import { ROUTE_ROLES } from "@/lib/router-catalog"
import { saveAutonomyAction } from "@/server/actions"
import { getAutonomySettings } from "@/server/repositories/autonomy-repository"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Autonomy" }

const KIND_LABELS: Record<(typeof MESSAGE_KINDS)[number], string> = {
  intake_question: "Intake questions",
  asset_request: "Asset requests",
  proposal: "Proposals",
  progress_update: "Progress updates",
  concept_presentation: "Concept presentations",
  revision_note: "Revision notes",
  change_order: "Change orders",
  delivery_package: "Delivery packages",
  follow_up: "Follow-ups",
}

const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export default async function AutonomyPage(props: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const search = await props.searchParams
  const settings = await getAutonomySettings()

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <p className="text-sm tracking-[0.16em] text-muted-foreground uppercase">Autonomy</p>
      <h1 className="mt-2 text-4xl font-medium tracking-tight">Supervised client work</h1>
      <p className="mt-3 max-w-3xl text-lg leading-8 text-muted-foreground">
        The agent runs intake, updates, repairs, and drafts. A person accepts the promise: the contract, spend above
        these limits, rights, and final delivery. Marketplace scrape, auto-apply, proposals, contracts, and messages
        stay off.
      </p>
      <div className="mt-4">
        <Flash error={search.error} notice={search.notice} />
      </div>
      <ul className="mt-6 flex flex-wrap gap-4 text-base">
        <li>
          <Link href="/templates" className="underline-offset-2 hover:underline">
            Service templates
          </Link>
        </li>
        <li>
          <Link href="/clients" className="underline-offset-2 hover:underline">
            Client memory
          </Link>
        </li>
        <li>
          <Link href={`/supervise/${GLASS_MONUMENT.id}`} className="underline-offset-2 hover:underline">
            After the Rain
          </Link>
        </li>
        <li>
          <Link href={`/supervise/${NIGHT_ORCHARD.id}`} className="underline-offset-2 hover:underline">
            Night Orchard
          </Link>
        </li>
      </ul>

      <form action={saveAutonomyAction} className="mt-8 space-y-8">
        <section className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Maximum automatic spend per job (USD)
            <input
              className={`${fieldClass} mt-2`}
              name="maxJob"
              inputMode="decimal"
              defaultValue={centsToDollarInput(settings.maxAutoSpendPerJobCents)}
              required
            />
          </label>
          <label className="block text-sm">
            Maximum automatic spend per repair (USD)
            <input
              className={`${fieldClass} mt-2`}
              name="maxRepair"
              inputMode="decimal"
              defaultValue={centsToDollarInput(settings.maxAutoSpendPerRepairCents)}
              required
            />
          </label>
        </section>

        <section>
          <h2 className="text-lg font-medium">Maximum generation attempts per step</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These caps limit what the agent may retry. They cannot exceed the desk limits.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            {CAPABILITIES.map((capability) => (
              <label key={capability} className="block text-sm capitalize">
                {capability}
                <input
                  className={`${fieldClass} mt-2`}
                  name={`attempt_${capability}`}
                  inputMode="numeric"
                  defaultValue={settings.maxAttempts[capability]}
                  required
                />
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">Allowed model families</h2>
          <div className="mt-3 flex flex-wrap gap-4">
            {ROUTE_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="family"
                  value={role}
                  defaultChecked={settings.allowedFamilies.includes(role)}
                />
                {role}
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">Messages that may be sent automatically</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Checked types can go out on direct email or the first-party portal. Proposals, change orders, and delivery
            packages stay drafts even when checked. Nothing is sent through a marketplace.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {MESSAGE_KINDS.map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="autoSend"
                  value={kind}
                  defaultChecked={settings.autoSend.includes(kind)}
                />
                {KIND_LABELS[kind]}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="shareConcepts"
              value="yes"
              defaultChecked={settings.shareConceptsAutomatically}
              className="mt-1"
            />
            <span>Concepts may be shared automatically on a first-party channel.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="finalDelivery"
              value="yes"
              defaultChecked={settings.finalDeliveryRequiresApproval}
              className="mt-1"
            />
            <span>Final delivery always requires approval. The agent prepares the package and stops.</span>
          </label>
        </section>

        <SubmitButton>Save autonomy settings</SubmitButton>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Conditions that always pause</h2>
        <p className="mt-1 text-sm text-muted-foreground">These are always on. They are not switches.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PAUSE_CONDITIONS.map((condition) => (
            <li key={condition.id} className="rounded-lg px-3 py-2 text-sm ring-1 ring-foreground/10">
              {condition.label}
            </li>
          ))}
        </ul>
      </section>

      <details className="mt-10 rounded-xl p-4 ring-1 ring-foreground/10">
        <summary className="cursor-pointer text-sm font-medium">Operator system prompt</summary>
        <pre className="mt-4 text-sm leading-6 whitespace-pre-wrap">{OPERATOR_SYSTEM_PROMPT}</pre>
      </details>
    </main>
  )
}
