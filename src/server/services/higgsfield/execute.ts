import {
  type CostEstimate,
  type HiggsfieldClient,
  type NormalizedAsset,
  type PollOutcome,
  type StatusSnapshot,
  type SubmitHandle,
  deskStatusForProvider,
  pollStatus,
  settleLedger,
} from "@/server/services/higgsfield/protocol"

export type ExecutionResult = {
  estimate: CostEstimate
  handle: SubmitHandle
  outcome: PollOutcome
  providerStatus: string
  deskStatus: string
  actualCostCents: number | null
  actualUsd: string | null
  actualCredits: string | null
  costSource: "provider_actual" | "provider_estimate" | null
  asset: NormalizedAsset | null
  error: string | null
}

export async function executeGeneration(input: {
  endpointId: string
  body: unknown
  expectedKind: NormalizedAsset["kind"]
  client: HiggsfieldClient
  timeoutMs: number
  onEstimated?: (estimate: CostEstimate) => Promise<void>
  onSubmitted?: (handle: SubmitHandle) => Promise<void>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
}): Promise<ExecutionResult> {
  const estimate = await input.client.estimate(input.endpointId, input.body)
  if (input.onEstimated) await input.onEstimated(estimate)
  const handle = await input.client.submit(input.endpointId, input.body)
  if (input.onSubmitted) await input.onSubmitted(handle)
  const outcome = await pollStatus({
    client: input.client,
    initial: handle,
    timeoutMs: input.timeoutMs,
    sleep: input.sleep,
    now: input.now,
    random: input.random,
  })
  return describeOutcome(estimate, handle, outcome, input.expectedKind)
}

export function describeOutcome(
  estimate: CostEstimate,
  handle: SubmitHandle,
  outcome: PollOutcome,
  expectedKind: NormalizedAsset["kind"],
): ExecutionResult {
  const snapshot: StatusSnapshot | null = outcome.snapshot
  const providerStatus = snapshot?.status ?? handle.status
  const deskStatus = outcome.kind === "timed_out" ? "timed_out" : deskStatusForProvider(providerStatus)
  const ledger = settleLedger({
    deskStatus,
    estimateCents: estimate.cents,
    estimateUsd: estimate.usd,
    estimateCredits: estimate.credits,
    reportedUsd: snapshot?.usd ?? null,
    reportedCredits: snapshot?.credits ?? null,
  })
  const assets = snapshot?.assets ?? []
  const asset = assets.find((item) => item.kind === expectedKind) ?? assets[0] ?? null
  const error =
    outcome.kind === "stopped"
      ? outcome.error
      : outcome.kind === "timed_out"
        ? `Polling exceeded the application limit. Provider status is still ${providerStatus}. This is not a Higgsfield status.`
        : snapshot?.error
  return {
    estimate,
    handle,
    outcome,
    providerStatus,
    deskStatus,
    actualCostCents: ledger.actualCostCents,
    actualUsd: ledger.actualUsd,
    actualCredits: ledger.actualCredits,
    costSource: ledger.costSource,
    asset: deskStatus === "succeeded" ? asset : null,
    error: error ?? null,
  }
}
