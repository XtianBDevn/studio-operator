import { randomBytes } from "node:crypto"

import { assertAllowedOperation } from "@/lib/guardrails"
import { StudioError } from "@/lib/errors"

export type ProviderGenerationInput = {
  model: string
  title: string
  subtitle: string
  kind: string
  costEstimateCents: number
}

export type ProviderGenerationResult = {
  providerRequestId: string
  status: "succeeded"
  outputUrl: string
  actualCostCents: number
  error: null
}

function isLiveMode(): boolean {
  return process.env.STUDIO_OPERATOR_MODE === "live"
}

export function mockOutputUrl(input: { title: string; subtitle: string; kind: string }): string {
  const params = new URLSearchParams({
    title: input.title,
    subtitle: input.subtitle,
    kind: input.kind,
  })
  return `/api/preview?${params.toString()}`
}

/**
 * Higgsfield generation stub.
 * Mock mode returns a local preview and never leaves the process.
 * Live mode throws before any network call. HIGGSFIELD_API_KEY is ignored here.
 */
export async function requestHiggsfieldGeneration(
  input: ProviderGenerationInput,
): Promise<ProviderGenerationResult> {
  assertAllowedOperation("generation.run_within_limits")
  if (isLiveMode()) {
    throw new StudioError(
      "Higgsfield live calls are stubbed in this build. Keep STUDIO_OPERATOR_MODE=mock. No request was sent.",
    )
  }

  const providerRequestId = `mock_hf_${input.model.replace(/[^a-z0-9]+/gi, "_")}_${randomBytes(4).toString("hex")}`
  return {
    providerRequestId,
    status: "succeeded",
    outputUrl: mockOutputUrl({
      title: input.title,
      subtitle: input.subtitle,
      kind: input.kind,
    }),
    actualCostCents: input.costEstimateCents,
    error: null,
  }
}
