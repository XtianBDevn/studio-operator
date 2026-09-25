import { assertAllowedOperation } from "@/lib/guardrails"
import { StudioError } from "@/lib/errors"
import { connectionTests } from "@/server/repositories"
import {
  SOUL_V2,
  connectionTestInput,
  createHiggsfieldClient,
  executeGeneration,
  higgsfieldBaseUrl,
  higgsfieldConfigured,
  pollTimeoutMs,
  readHiggsfieldCredentials,
  redactSecrets,
  storeCopiedAsset,
} from "@/server/services/higgsfield"

export function connectionTestAvailability() {
  return {
    configured: higgsfieldConfigured(),
    endpointId: SOUL_V2.endpointId,
    label: SOUL_V2.label,
    mode: process.env.STUDIO_OPERATOR_MODE === "live" ? "live" : "mock",
  } as const
}

export async function runConnectionTest(confirmed: boolean): Promise<void> {
  assertAllowedOperation("cost.estimate")
  if (!confirmed) {
    throw new StudioError(
      "Confirm the paid request before Studio Operator contacts Higgsfield. No request was sent.",
    )
  }
  const credentials = readHiggsfieldCredentials()
  if (!credentials) {
    throw new StudioError("Higgsfield credentials are not configured on the server. No request was sent.")
  }

  const body = connectionTestInput()
  const client = createHiggsfieldClient({ credentials, baseUrl: higgsfieldBaseUrl() })
  let testId = ""
  try {
    const result = await executeGeneration({
      endpointId: SOUL_V2.endpointId,
      body,
      expectedKind: "image",
      client,
      timeoutMs: pollTimeoutMs(),
      onEstimated: async (estimate) => {
        testId = await connectionTests.create({
          endpointId: SOUL_V2.endpointId,
          confirmed: true,
          appStatus: "queued",
          estimatedCredits: estimate.credits,
          estimatedUsd: estimate.usd,
          costEstimateCents: estimate.cents,
          settingsJson: JSON.stringify(body),
        })
      },
      onSubmitted: async (handle) => {
        await connectionTests.update(testId, {
          providerRequestId: handle.requestId,
          statusUrl: handle.statusUrl,
          cancelUrl: handle.cancelUrl,
          correlationId: handle.correlationId,
          providerStatus: handle.status,
          appStatus: handle.status === "completed" ? "succeeded" : handle.status,
        })
      },
    })
    let outputUrl: string | null = null
    let localPath: string | null = null
    let error = result.error
    if (result.deskStatus === "succeeded" && result.asset) {
      try {
        const stored = await storeCopiedAsset({
          asset: result.asset,
          scope: "connection",
          groupId: "tests",
          fileId: testId,
          publicPath: `/api/connection-assets/${testId}`,
        })
        outputUrl = stored.outputUrl
        localPath = stored.localPath
      } catch (copyError) {
        error = redactSecrets(copyError instanceof Error ? copyError.message : "Asset copy failed.")
      }
    }
    await connectionTests.update(testId, {
      providerRequestId: result.handle.requestId,
      providerStatus: result.providerStatus,
      appStatus: result.deskStatus,
      statusUrl: result.handle.statusUrl,
      cancelUrl: result.handle.cancelUrl,
      correlationId: result.handle.correlationId,
      actualCostCents: result.actualCostCents,
      actualUsd: result.actualUsd,
      actualCredits: result.actualCredits,
      costSource: result.costSource,
      outputUrl,
      localPath,
      error,
    })
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "Connection test failed.").slice(0, 500)
    if (testId) {
      await connectionTests.update(testId, {
        appStatus: "failed",
        actualCostCents: null,
        costSource: null,
        error: message,
      })
    }
    throw new StudioError(message)
  }
}
