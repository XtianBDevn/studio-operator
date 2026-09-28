import type { Metadata } from "next"
import Link from "next/link"

import { formatMoney, formatPercentFromBps } from "@/lib/money"
import { modelLayerLabel } from "@/lib/live-workflows"
import { PLANNING_RATE_NOTE } from "@/lib/planning-rates"
import { catalogById } from "@/lib/router-catalog"
import { SERVICE_TEMPLATES, templateSpendCents } from "@/lib/service-templates"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Service templates" }

export default function TemplatesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <Link href="/autonomy" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        Autonomy
      </Link>
      <h1 className="mt-3 text-4xl font-medium tracking-tight">Productized services</h1>
      <p className="mt-3 max-w-3xl text-lg leading-8 text-muted-foreground">
        Each template names the inputs, the catalog models, the quality checks, and the spend ceiling. Prices are
        package prices. Recipe costs use desk planning rates.
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{PLANNING_RATE_NOTE}</p>
      <div className="mt-8 space-y-8">
        {SERVICE_TEMPLATES.map((template) => (
          <article key={template.id} className="rounded-xl p-6 ring-1 ring-foreground/10">
            <h2 className="text-2xl font-medium tracking-tight">{template.name}</h2>
            <p className="mt-2 text-base leading-7">{template.summary}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Timeline</dt>
                <dd>{template.timeline}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Package price</dt>
                <dd>{formatMoney(template.packagePriceCents)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Included revisions</dt>
                <dd>{template.includedRevisionRounds}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target gross margin</dt>
                <dd>{formatPercentFromBps(template.targetMarginBps)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Maximum production spend</dt>
                <dd>
                  {formatMoney(template.maxProductionSpendCents)}
                  {templateSpendCents(template) === template.maxProductionSpendCents
                    ? " · matches the recipe"
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Accepted files</dt>
                <dd>{template.acceptedFileTypes.join(", ")}</dd>
              </div>
            </dl>
            <Section title="Required inputs" items={template.requiredInputs} />
            <Section title="Deliverables" items={template.deliverables} />
            <Section title="Exclusions" items={template.exclusions} />
            <Section title="Quality checklist" items={template.qualityChecklist} />
            <Section title="Delivery package" items={template.deliveryPackage} />
            <Section title="Escalation" items={template.escalation} />
            <h3 className="mt-5 text-sm font-medium">Model recipe</h3>
            <ul className="mt-2 divide-y rounded-lg ring-1 ring-foreground/10">
              {template.recipe.map((step) => {
                const entry = catalogById(step.modelId)
                return (
                  <li key={`${template.id}-${step.name}`} className="px-3 py-3 text-sm">
                    <p className="font-medium">
                      {step.name} · {step.role} · {step.attempts} {step.attempts === 1 ? "attempt" : "attempts"}
                    </p>
                    <p className="mt-1 font-mono text-xs">{step.modelId}</p>
                    <p className="mt-1 text-muted-foreground">
                      {entry?.label ?? "Missing from the catalog"} · {modelLayerLabel(step.modelId)} · {step.note}
                    </p>
                  </li>
                )
              })}
            </ul>
          </article>
        ))}
      </div>
    </main>
  )
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <h3 className="mt-5 text-sm font-medium">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  )
}
