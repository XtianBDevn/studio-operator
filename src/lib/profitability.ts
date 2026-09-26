export type ProfitabilityInput = {
  clientPriceCents: number
  estimatedGenerationCents: number
  contingencyBps: number
  channelFeeBps: number
  actualGenerationCents?: number | null
  maxBudgetCents?: number | null
}

export type Profitability = {
  clientPriceCents: number
  estimatedGenerationCents: number
  contingencyCents: number
  channelFeeCents: number
  expectedGrossMarginCents: number
  marginBps: number
  actualGenerationCents: number | null
  maxBudgetCents: number | null
  remainingBudgetCents: number | null
}

/**
 * Expected gross margin = client price − estimated generation − contingency − channel fee.
 * Contingency is a percent of estimated generation. Channel fee is a percent of client price.
 * Basis points: 1500 = 15.00%, 1000 = 10.00%.
 */
export function computeProfitability(input: ProfitabilityInput): Profitability {
  const contingencyCents = Math.round(
    (input.estimatedGenerationCents * input.contingencyBps) / 10_000,
  )
  const channelFeeCents = Math.round(
    (input.clientPriceCents * input.channelFeeBps) / 10_000,
  )
  const expectedGrossMarginCents =
    input.clientPriceCents -
    input.estimatedGenerationCents -
    contingencyCents -
    channelFeeCents
  const marginBps =
    input.clientPriceCents === 0
      ? 0
      : Math.round((expectedGrossMarginCents * 10_000) / input.clientPriceCents)
  const actual =
    input.actualGenerationCents === undefined
      ? null
      : input.actualGenerationCents
  const remaining =
    input.maxBudgetCents == null || actual == null
      ? null
      : input.maxBudgetCents - actual

  return {
    clientPriceCents: input.clientPriceCents,
    estimatedGenerationCents: input.estimatedGenerationCents,
    contingencyCents,
    channelFeeCents,
    expectedGrossMarginCents,
    marginBps,
    actualGenerationCents: actual,
    maxBudgetCents: input.maxBudgetCents ?? null,
    remainingBudgetCents: remaining,
  }
}
