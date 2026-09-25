import { formatMoney } from "@/lib/money"
import { QA_RECORD_NOTE, verdictLabel } from "@/lib/qa"
import type { QaReportRecord } from "@/lib/types"

const STATUS_LABEL = {
  pass: "Pass",
  fail: "Fail",
  na: "Not relevant",
} as const

export function QaPanel({ report }: { report: QaReportRecord | null }) {
  if (!report) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-medium">QA checklist</h3>
        <p className="text-sm leading-6 text-muted-foreground">{QA_RECORD_NOTE}</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">QA verdict</p>
        <h3 className="mt-1 text-2xl font-medium tracking-tight">{verdictLabel(report.verdict)}</h3>
        <p className="mt-2 text-sm leading-6">{report.reason}</p>
      </div>
      {report.repairModelId ? (
        <dl className="grid gap-3 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Selected model</dt>
            <dd className="mt-1 font-medium">{report.repairModelLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expected incremental cost</dt>
            <dd className="mt-1 font-medium">{formatMoney(report.incrementalCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">New total cost</dt>
            <dd className="mt-1 font-medium">{formatMoney(report.newTotalCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Updated margin</dt>
            <dd className="mt-1 font-medium">{formatMoney(report.updatedMarginCents)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Limit</dt>
            <dd className="mt-1">
              {report.autoRepaired
                ? "Ran automatically inside the approved per-repair and per-job limits."
                : report.withinLimits
                  ? "Inside the approved limits."
                  : "Outside the approved limits. A person has to approve it."}
            </dd>
          </div>
        </dl>
      ) : null}
      <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
        {report.checklist.map((item) => (
          <li key={item.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_7rem_minmax(0,1fr)] sm:gap-3">
            <p className="text-sm font-medium">{item.label}</p>
            <p className="text-sm">{STATUS_LABEL[item.status]}</p>
            <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
