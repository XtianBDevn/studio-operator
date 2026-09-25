import { redactSecrets } from "@/server/services/higgsfield/redact"

/**
 * REST adapter for the Higgsfield request lifecycle.
 *
 * The published TypeScript SDK (`@higgsfield/client` v2) documents
 * `higgsfield.subscribe()`, which blocks until a terminal status. It does not
 * document a cost estimate, a queued-only cancel, or a way to keep an
 * application timeout distinct from the provider status. Those are required
 * here, so this module calls the documented REST endpoints instead:
 * https://docs.higgsfield.ai/docs/how-to/sdk.md
 * https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md
 * https://docs.higgsfield.ai/docs/concepts/requests.md
 * https://docs.higgsfield.ai/docs/concepts/polling.md
 */

export const PROVIDER_STATUSES = [
  "queued",
  "in_progress",
  "completed",
  "failed",
  "nsfw",
  "canceled",
] as const

export type ProviderStatus = (typeof PROVIDER_STATUSES)[number]

export const TERMINAL_PROVIDER_STATUSES = new Set<ProviderStatus>([
  "completed",
  "failed",
  "nsfw",
  "canceled",
])

export type NormalizedAsset = {
  kind: "image" | "video" | "audio"
  url: string
}

export type CostEstimate = {
  credits: string
  usd: string
  cents: number
}

export type StatusSnapshot = {
  status: ProviderStatus
  requestId: string
  statusUrl: string | null
  cancelUrl: string | null
  error: string | null
  assets: NormalizedAsset[]
  usd: string | null
  credits: string | null
}

export type SubmitHandle = StatusSnapshot & {
  correlationId: string | null
}

export type HiggsfieldCredentials = {
  keyId: string
  keySecret: string
}

export type HiggsfieldClient = {
  estimate(endpointId: string, body: unknown): Promise<CostEstimate>
  submit(endpointId: string, body: unknown): Promise<SubmitHandle>
  status(statusUrl: string): Promise<StatusSnapshot>
  cancel(cancelUrl: string): Promise<"accepted" | "already_started">
}

type FetchImpl = typeof fetch

const OFFICIAL_ORIGIN = "https://api.higgsfield.ai"

export function readHiggsfieldCredentials(): HiggsfieldCredentials | null {
  const keyId = process.env.HF_API_KEY_ID?.trim() ?? ""
  const keySecret = process.env.HF_API_KEY_SECRET?.trim() ?? ""
  if (!keyId || !keySecret) return null
  return { keyId, keySecret }
}

export function higgsfieldConfigured(): boolean {
  return readHiggsfieldCredentials() !== null
}

export function higgsfieldBaseUrl(): string {
  const raw = process.env.HIGGSFIELD_BASE_URL?.trim() || OFFICIAL_ORIGIN
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("HIGGSFIELD_BASE_URL is not a valid URL. No request was sent.")
  }
  if (url.protocol !== "https:") {
    throw new Error("HIGGSFIELD_BASE_URL must use https. No request was sent.")
  }
  return url.origin
}

export function pollTimeoutMs(): number {
  const raw = process.env.HIGGSFIELD_POLL_TIMEOUT_MS?.trim()
  if (!raw) return 180_000
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1_000 || value > 900_000) return 180_000
  return value
}

export function usdStringToCents(usd: string): number | null {
  if (!/^\d+\.\d+$/.test(usd) && !/^\d+$/.test(usd)) return null
  const [whole, frac = ""] = usd.split(".")
  const dollars = Number(whole)
  if (!Number.isSafeInteger(dollars)) return null
  const milli = Number(frac.padEnd(3, "0").slice(0, 3))
  if (!Number.isInteger(milli)) return null
  return dollars * 100 + Math.round(milli / 10)
}

export function deskStatusForProvider(status: ProviderStatus): string {
  if (status === "completed") return "succeeded"
  return status
}

export function normalizeAssets(body: Record<string, unknown>): NormalizedAsset[] {
  const assets: NormalizedAsset[] = []
  if (Array.isArray(body.images)) {
    for (const image of body.images) {
      const url = mediaUrl(image)
      if (url) assets.push({ kind: "image", url })
    }
  }
  const video = mediaUrl(body.video)
  if (video) assets.push({ kind: "video", url: video })
  const audio = mediaUrl(body.audio)
  if (audio) assets.push({ kind: "audio", url: audio })
  if (Array.isArray(body.audios)) {
    for (const item of body.audios) {
      const url = mediaUrl(item)
      if (url) assets.push({ kind: "audio", url })
    }
  }
  return assets
}

export function settleLedger(input: {
  deskStatus: string
  estimateCents: number
  estimateUsd: string | null
  estimateCredits: string | null
  reportedUsd: string | null
  reportedCredits: string | null
}): {
  actualCostCents: number | null
  actualUsd: string | null
  actualCredits: string | null
  costSource: "provider_actual" | "provider_estimate" | null
} {
  if (input.deskStatus === "failed" || input.deskStatus === "nsfw" || input.deskStatus === "canceled" || input.deskStatus === "timed_out") {
    return { actualCostCents: null, actualUsd: null, actualCredits: null, costSource: null }
  }
  if (input.deskStatus !== "succeeded") {
    return { actualCostCents: null, actualUsd: null, actualCredits: null, costSource: "provider_estimate" }
  }
  const reported = input.reportedUsd ? usdStringToCents(input.reportedUsd) : null
  if (input.reportedUsd && reported != null) {
    return {
      actualCostCents: reported,
      actualUsd: input.reportedUsd,
      actualCredits: input.reportedCredits,
      costSource: "provider_actual",
    }
  }
  return {
    actualCostCents: input.estimateCents,
    actualUsd: input.estimateUsd,
    actualCredits: input.estimateCredits,
    costSource: "provider_estimate",
  }
}

export function assertRetryableStatus(status: string): void {
  if (status === "failed" || status === "nsfw" || status === "canceled" || status === "timed_out") return
  throw new Error(
    "Retry is available after a failed, moderated, canceled, or timed-out attempt. The existing generation was not changed.",
  )
}

export function createHiggsfieldClient(options: {
  credentials: HiggsfieldCredentials
  baseUrl?: string
  fetchImpl?: FetchImpl
}): HiggsfieldClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = (options.baseUrl ?? higgsfieldBaseUrl()).replace(/\/$/, "")
  const credentials = options.credentials

  async function call(url: string, method: "GET" | "POST", body?: unknown): Promise<{
    response: Response
    json: unknown
  }> {
    assertAllowedProviderUrl(url, baseUrl)
    let response: Response
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Key ${credentials.keyId}:${credentials.keySecret}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw providerError("Higgsfield could not be reached.", credentials, method === "GET")
    }
    const json = await readJson(response)
    if (!response.ok) {
      const retryable = response.status >= 500 && method === "GET"
      throw providerError(
        `Higgsfield returned ${response.status}. ${formatDetail(json)}.${correlationSuffix(response)}`,
        credentials,
        retryable,
      )
    }
    return { response, json }
  }

  return {
    async estimate(endpointId, body) {
      const url = `${baseUrl}/estimate/${endpointId}`
      const { json } = await call(url, "POST", body)
      return parseEstimate(json, credentials)
    },
    async submit(endpointId, body) {
      const url = `${baseUrl}/${endpointId}`
      const { response, json } = await call(url, "POST", body)
      const snapshot = parseSnapshot(json, credentials)
      if (!snapshot.statusUrl) {
        throw providerError("Higgsfield accepted a request without a status URL.", credentials, false)
      }
      return {
        ...snapshot,
        correlationId: response.headers.get("x-correlation-id"),
      }
    },
    async status(statusUrl) {
      const { json } = await call(statusUrl, "GET")
      return parseSnapshot(json, credentials)
    },
    async cancel(cancelUrl) {
      assertAllowedProviderUrl(cancelUrl, baseUrl)
      let response: Response
      try {
        response = await fetchImpl(cancelUrl, {
          method: "POST",
          headers: {
            Authorization: `Key ${credentials.keyId}:${credentials.keySecret}`,
            Accept: "application/json",
          },
        })
      } catch {
        throw providerError("Higgsfield could not be reached for cancellation.", credentials, false)
      }
      if (response.status === 202) return "accepted"
      if (response.status === 400) return "already_started"
      const json = await readJson(response)
      throw providerError(
        `Higgsfield cancel returned ${response.status}. ${formatDetail(json)}.${correlationSuffix(response)}`,
        credentials,
        false,
      )
    },
  }
}

export class HiggsfieldRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "HiggsfieldRequestError"
  }
}

function providerError(message: string, credentials: HiggsfieldCredentials, retryable: boolean) {
  return new HiggsfieldRequestError(
    redactSecrets(message, [credentials.keyId, credentials.keySecret]),
    retryable,
  )
}

export function parseEstimate(json: unknown, credentials?: HiggsfieldCredentials): CostEstimate {
  const body = asRecord(json)
  const credits = body?.credits
  const usd = body?.usd
  if (typeof credits !== "string" || typeof usd !== "string") {
    throw providerError(
      "Higgsfield estimate did not match the documented credits and usd strings. No generation was submitted.",
      credentials ?? { keyId: "", keySecret: "" },
      false,
    )
  }
  const cents = usdStringToCents(usd)
  if (cents == null) {
    throw providerError(
      "Higgsfield estimate usd could not be read. No generation was submitted.",
      credentials ?? { keyId: "", keySecret: "" },
      false,
    )
  }
  return { credits, usd, cents }
}

export function parseSnapshot(json: unknown, credentials?: HiggsfieldCredentials): StatusSnapshot {
  const body = asRecord(json)
  const status = body?.status
  const requestId = body?.request_id
  if (typeof status !== "string" || !isProviderStatus(status) || typeof requestId !== "string" || !requestId) {
    throw providerError(
      "Higgsfield response did not include a documented status and request_id.",
      credentials ?? { keyId: "", keySecret: "" },
      false,
    )
  }
  const rawError = body?.error
  const error =
    typeof rawError === "string" && rawError.trim()
      ? redactSecrets(rawError, credentials ? [credentials.keyId, credentials.keySecret] : [])
      : null
  return {
    status,
    requestId,
    statusUrl: typeof body?.status_url === "string" ? body.status_url : null,
    cancelUrl: typeof body?.cancel_url === "string" ? body.cancel_url : null,
    error,
    assets: body ? normalizeAssets(body) : [],
    usd: typeof body?.usd === "string" ? body.usd : null,
    credits: typeof body?.credits === "string" ? body.credits : null,
  }
}

export type PollOutcome =
  | { kind: "terminal"; snapshot: StatusSnapshot }
  | { kind: "timed_out"; snapshot: StatusSnapshot }
  | { kind: "stopped"; snapshot: StatusSnapshot | null; error: string }

export async function pollStatus(input: {
  client: HiggsfieldClient
  initial: StatusSnapshot
  timeoutMs: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
}): Promise<PollOutcome> {
  const sleep = input.sleep ?? defaultSleep
  const now = input.now ?? Date.now
  const random = input.random ?? Math.random
  const started = now()
  let snapshot = input.initial
  if (TERMINAL_PROVIDER_STATUSES.has(snapshot.status)) {
    return { kind: "terminal", snapshot }
  }
  const statusUrl = snapshot.statusUrl
  if (!statusUrl) {
    return { kind: "stopped", snapshot, error: "The request has no status URL to poll." }
  }

  let delay = 2
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (now() - started >= input.timeoutMs) {
      return { kind: "timed_out", snapshot }
    }
    const waitMs = Math.round((delay + random() * 0.5) * 1000)
    await sleep(waitMs)
    if (now() - started >= input.timeoutMs) {
      return { kind: "timed_out", snapshot }
    }
    try {
      const next = await input.client.status(statusUrl)
      snapshot = {
        ...next,
        statusUrl: next.statusUrl ?? snapshot.statusUrl,
        cancelUrl: next.cancelUrl ?? snapshot.cancelUrl,
      }
    } catch (error) {
      if (error instanceof HiggsfieldRequestError && error.retryable) {
        delay = Math.min(delay * 1.5, 10)
        continue
      }
      const message = error instanceof Error ? error.message : "Status check failed."
      return { kind: "stopped", snapshot, error: message }
    }
    if (TERMINAL_PROVIDER_STATUSES.has(snapshot.status)) {
      return { kind: "terminal", snapshot }
    }
    delay = Math.min(delay * 1.5, 10)
  }
  return { kind: "timed_out", snapshot }
}

export async function cancelIfQueued(input: {
  providerStatus: string | null
  cancelUrl: string | null
  client: Pick<HiggsfieldClient, "cancel">
}): Promise<{ canceled: true } | { canceled: false; reason: string; refresh: boolean }> {
  if (input.providerStatus !== "queued") {
    return {
      canceled: false,
      reason: "Cancellation is only available while the provider status is queued.",
      refresh: false,
    }
  }
  if (!input.cancelUrl) {
    return {
      canceled: false,
      reason: "This request has no cancel URL from Higgsfield.",
      refresh: false,
    }
  }
  const result = await input.client.cancel(input.cancelUrl)
  if (result === "accepted") return { canceled: true }
  return {
    canceled: false,
    reason: "Higgsfield reported that the request has already started.",
    refresh: true,
  }
}

function isProviderStatus(value: string): value is ProviderStatus {
  return (PROVIDER_STATUSES as readonly string[]).includes(value)
}

function mediaUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const url = (value as { url?: unknown }).url
  return typeof url === "string" && url.startsWith("https://") ? url : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function formatDetail(json: unknown): string {
  const body = asRecord(json)
  const detail = body?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") return item.msg
      return ""
    })
    return parts.filter(Boolean).join(" ")
  }
  return ""
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function correlationSuffix(response: Response): string {
  const id = response.headers.get("x-correlation-id")
  return id ? ` Correlation ${id}.` : ""
}

function assertAllowedProviderUrl(url: string, baseUrl: string) {
  let target: URL
  let allowed: URL
  try {
    target = new URL(url)
    allowed = new URL(baseUrl)
  } catch {
    throw new HiggsfieldRequestError("Refused a provider URL that could not be read.", false)
  }
  if (target.origin !== allowed.origin) {
    throw new HiggsfieldRequestError("Refused a provider URL on an unexpected host.", false)
  }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
