import { Flash } from "@/components/flash"
import { SubmitButton } from "@/components/submit-button"
import { SOURCES } from "@/lib/sources"
import { intakeAction } from "@/server/actions"

export const dynamic = "force-dynamic"

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export default async function NewJobPage(props: {
  searchParams: Promise<{ error?: string }>
}) {
  const search = await props.searchParams
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-6">
      <h1 className="text-xl font-medium tracking-tight">New job</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Paste a brief from Upwork, Fiverr, Contra, email, a sales call, or a direct intake form.
        Studio Operator stores the text. It does not open the marketplace, apply, or message anyone.
      </p>
      <div className="mt-4">
        <Flash error={search.error} />
      </div>
      <form action={intakeAction} className="mt-4 space-y-4">
        <label className="block text-sm">
          Working title
          <input name="title" required className={`${fieldClass} mt-1`} placeholder="Meridian — Northline" />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            Source
            <select name="source" defaultValue="email" className={`${fieldClass} mt-1`}>
              {SOURCES.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Client price (USD)
            <input name="budget" required inputMode="decimal" className={`${fieldClass} mt-1`} placeholder="2200" />
          </label>
          <label className="block text-sm">
            Deadline
            <input name="deadline" type="date" className={`${fieldClass} mt-1`} />
          </label>
        </div>
        <label className="block text-sm">
          Brief
          <textarea
            name="rawBrief"
            required
            rows={14}
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Paste the brief exactly as you received it."
          />
        </label>
        <label className="block text-sm">
          Client notes
          <textarea
            name="clientNotes"
            rows={3}
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <label className="block text-sm">
          Reference assets
          <textarea
            name="references"
            rows={3}
            placeholder={"One per line: label | https://example.com/file"}
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <SubmitButton>Open job</SubmitButton>
      </form>
    </main>
  )
}
