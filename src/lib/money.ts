export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

export function formatPercentFromBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim().replace(/[$,]/g, "")
  if (!trimmed) return null
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

export function centsToDollarInput(cents: number): string {
  return (cents / 100).toFixed(2)
}
