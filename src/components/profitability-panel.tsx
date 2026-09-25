import { formatMoney, formatPercentFromBps } from "@/lib/money"
import type { Profitability } from "@/lib/profitability"
import { sourceLabel } from "@/lib/sources"

export function ProfitabilityPanel({
  profit,
  source,
  contingencyBps,
  channelFeeBps,
  hasPlan,
}: {
  profit: Profitability
  source: string
  contingencyBps: number
  channelFeeBps: number
  hasPlan: boolean
}) {
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Profitability</h2>
        <p className="text-xs text-muted-foreground">{sourceLabel(source)}</p>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Client price" value={formatMoney(profit.clientPriceCents)} />
        <Row label="Estimated generation" value={formatMoney(profit.estimatedGenerationCents)} />
        <Row
          label={`Contingency (${formatPercentFromBps(contingencyBps)})`}
          value={formatMoney(profit.contingencyCents)}
          hint="Percent of estimated generation"
        />
        <Row
          label={`Channel fee (${formatPercentFromBps(channelFeeBps)})`}
          value={formatMoney(profit.channelFeeCents)}
          hint="Percent of client price. A planning assumption, not a marketplace charge."
        />
        <div className="border-t pt-2">
          <Row
            label="Expected gross margin"
            value={formatMoney(profit.expectedGrossMarginCents)}
            strong
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPercentFromBps(profit.marginBps)} of client price
          </p>
        </div>
      </dl>
      {profit.maxBudgetCents != null ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Approved maximum {formatMoney(profit.maxBudgetCents)}
          {profit.actualGenerationCents != null
            ? ` · actual generation ${formatMoney(profit.actualGenerationCents)} · remaining ${formatMoney(profit.remainingBudgetCents ?? 0)}`
            : ""}
        </p>
      ) : null}
      {hasPlan ? null : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Generation is still zero because there is no plan. Margin updates after the plan is built.
        </p>
      )}
    </section>
  )
}

function Row({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">
        {label}
        {hint ? <span className="mt-0.5 block text-[11px] leading-4">{hint}</span> : null}
      </dt>
      <dd className={strong ? "font-medium tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  )
}
