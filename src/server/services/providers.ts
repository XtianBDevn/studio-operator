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
 * Local preview used when STUDIO_OPERATOR_MODE is mock.
 * Live mode throws here, before any network call. The connected image and
 * video workflows go through the Higgsfield REST adapter instead.
 */
export function localPreviewGeneration(input: ProviderGenerationInput): ProviderGenerationResult {
  assertAllowedOperation("generation.run_within_limits")
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

export async function requestHiggsfieldGeneration(
  input: ProviderGenerationInput,
): Promise<ProviderGenerationResult> {
  if (isLiveMode()) {
    throw new StudioError(
      "This entry point does not call Higgsfield. Keep STUDIO_OPERATOR_MODE=mock, or run generation from the desk. No request was sent.",
    )
  }
  return localPreviewGeneration(input)
}
