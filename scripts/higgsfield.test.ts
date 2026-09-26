import assert from "node:assert/strict"

import { PrismaClient } from "@prisma/client"

import { spentGenerationCents } from "../src/lib/types"
import { PrismaJobRepository } from "../src/server/repositories/prisma-job-repository"
import { prisma } from "../src/server/db"
import {
  assertRetryableStatus,
  cancelIfQueued,
  createHiggsfieldClient,
  executeGeneration,
  normalizeAssets,
  redactSecrets,
  settleLedger,
  storeCopiedAsset,
  usdStringToCents,
  type HiggsfieldClient,
} from "../src/server/services/higgsfield"
import {
  buildKlingStandardInput,
  buildSoulV2Input,
  connectionTestInput,
} from "../src/server/services/higgsfield/workflows"

const KEY_ID = "kid_test_value"
const KEY_SECRET = "ksec_test_value"

function headersOf(init?: RequestInit): Headers {
  return new Headers(init?.headers)
}

async function main() {
  assert.equal(usdStringToCents("0.094"), 9)
  assert.equal(usdStringToCents("1.500"), 150)
  assert.equal(usdStringToCents("nope"), null)

  assert.equal(
    spentGenerationCents([
      { status: "failed", actualCostCents: 10, costEstimateCents: 100 },
      { status: "nsfw", actualCostCents: null, costEstimateCents: 100 },
      { status: "canceled", actualCostCents: null, costEstimateCents: 100 },
      { status: "timed_out", actualCostCents: null, costEstimateCents: 80 },
      { status: "succeeded", actualCostCents: 50, costEstimateCents: 40 },
      { status: "queued", actualCostCents: null, costEstimateCents: 20 },
    ]),
    70,
  )

  const failedLedger = settleLedger({
    deskStatus: "failed",
    estimateCents: 9,
    estimateUsd: "0.094",
    estimateCredits: "1.500",
    reportedUsd: "0.094",
    reportedCredits: "1.500",
  })
  assert.equal(failedLedger.actualCostCents, null)
  const nsfwLedger = settleLedger({
    deskStatus: "nsfw",
    estimateCents: 9,
    estimateUsd: "0.094",
    estimateCredits: "1.500",
    reportedUsd: null,
    reportedCredits: null,
  })
  assert.equal(nsfwLedger.actualCostCents, null)
  const estimated = settleLedger({
    deskStatus: "succeeded",
    estimateCents: 9,
    estimateUsd: "0.094",
    estimateCredits: "1.500",
    reportedUsd: null,
    reportedCredits: null,
  })
  assert.equal(estimated.actualCostCents, 9)
  assert.equal(estimated.costSource, "provider_estimate")
  const actual = settleLedger({
    deskStatus: "succeeded",
    estimateCents: 9,
    estimateUsd: "0.094",
    estimateCredits: "1.500",
    reportedUsd: "1.500",
    reportedCredits: "12.000",
  })
  assert.equal(actual.actualCostCents, 150)
  assert.equal(actual.costSource, "provider_actual")

  assert.throws(() => assertRetryableStatus("succeeded"), /not changed/)
  assert.throws(() => assertRetryableStatus("queued"), /not changed/)
  assertRetryableStatus("failed")
  assertRetryableStatus("timed_out")

  const soul = buildSoulV2Input({ prompt: "A gray square", aspectRatio: "2:3", resolution: "720p" })
  assert.equal(soul.enhance_prompt, false)
  assert.equal(soul.batch_size, 1)
  assert.equal("seed" in soul, false)
  assert.equal("custom_reference_id" in soul, false)
  const testBody = connectionTestInput()
  assert.equal(testBody.resolution, "720p")
  assert.equal(testBody.aspect_ratio, "1:1")
  const kling = buildKlingStandardInput({ prompt: "A road", durationSeconds: 5, sound: "off" })
  assert.equal(kling.multi_shots, false)
  assert.equal("elements" in kling, false)
  assert.equal(kling.duration, 5)

  const assets = normalizeAssets({
    images: [{ url: "https://cdn.example/a.png" }],
    video: { url: "https://cdn.example/b.mp4" },
    audio: { url: "https://cdn.example/c.mp3" },
    audios: [{ url: "https://cdn.example/d.mp3" }],
  })
  assert.deepEqual(
    assets.map((asset) => asset.kind),
    ["image", "video", "audio", "audio"],
  )

  assert.equal(redactSecrets(`bad ${KEY_SECRET} token`, [KEY_SECRET]).includes(KEY_SECRET), false)

  const calls: string[] = []
  let statusReads = 0
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push(`${init?.method ?? "GET"} ${url}`)
    const authorization = headersOf(init).get("authorization") ?? ""
    assert.equal(authorization === `Key ${KEY_ID}:${KEY_SECRET}`, true)
    assert.equal(url.includes(KEY_SECRET), false)
    if (url.endsWith("/estimate/higgsfield-ai/soul/v2/standard")) {
      assert.equal(calls[0]?.startsWith("POST"), true)
      return json({ credits: "1.500", usd: "0.094" })
    }
    if (url.endsWith("/higgsfield-ai/soul/v2/standard")) {
      assert.equal(calls[0]?.includes("/estimate/"), true)
      return json(
        {
          status: "queued",
          request_id: "req_1",
          status_url: "https://api.higgsfield.ai/requests/req_1/status",
          cancel_url: "https://api.higgsfield.ai/requests/req_1/cancel",
        },
        { "x-correlation-id": "corr_1" },
      )
    }
    if (url.endsWith("/status")) {
      statusReads += 1
      if (statusReads === 1) return json({ status: "in_progress", request_id: "req_1" })
      return json({
        status: "completed",
        request_id: "req_1",
        images: [{ url: "https://cdn.example/out.png" }],
      })
    }
    return json({ detail: "unexpected" }, {}, 404)
  }

  let clock = 0
  const client = createHiggsfieldClient({
    credentials: { keyId: KEY_ID, keySecret: KEY_SECRET },
    baseUrl: "https://api.higgsfield.ai",
    fetchImpl,
  })
  const result = await executeGeneration({
    endpointId: "higgsfield-ai/soul/v2/standard",
    body: testBody,
    expectedKind: "image",
    client,
    timeoutMs: 30_000,
    now: () => clock,
    random: () => 0,
    sleep: async (ms) => {
      clock += ms
    },
  })
  assert.equal(result.deskStatus, "succeeded")
  assert.equal(result.providerStatus, "completed")
  assert.equal(result.actualCostCents, 9)
  assert.equal(result.costSource, "provider_estimate")
  assert.equal(result.handle.correlationId, "corr_1")
  assert.equal(result.handle.statusUrl, "https://api.higgsfield.ai/requests/req_1/status")
  assert.equal(calls[0], "POST https://api.higgsfield.ai/estimate/higgsfield-ai/soul/v2/standard")
  assert.equal(calls[1], "POST https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard")
  assert.ok(calls[2]?.includes("/requests/req_1/status"))

  const timeoutClient = createHiggsfieldClient({
    credentials: { keyId: KEY_ID, keySecret: KEY_SECRET },
    baseUrl: "https://api.higgsfield.ai",
    fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes("/estimate/")) return json({ credits: "1.000", usd: "0.050" })
      if (init?.method === "POST") {
        return json({
          status: "queued",
          request_id: "req_wait",
          status_url: "https://api.higgsfield.ai/requests/req_wait/status",
          cancel_url: "https://api.higgsfield.ai/requests/req_wait/cancel",
        })
      }
      return json({ status: "queued", request_id: "req_wait" })
    },
  })
  let waited = 0
  const timed = await executeGeneration({
    endpointId: "higgsfield-ai/soul/v2/standard",
    body: testBody,
    expectedKind: "image",
    client: timeoutClient,
    timeoutMs: 3_000,
    now: () => waited,
    random: () => 0,
    sleep: async (ms) => {
      waited += ms
    },
  })
  assert.equal(timed.deskStatus, "timed_out")
  assert.equal(timed.providerStatus, "queued")
  assert.equal(timed.actualCostCents, null)

  let cancelCalls = 0
  const cancelClient: Pick<HiggsfieldClient, "cancel"> = {
    async cancel() {
      cancelCalls += 1
      return "accepted"
    },
  }
  const blocked = await cancelIfQueued({
    providerStatus: "in_progress",
    cancelUrl: "https://api.higgsfield.ai/requests/req_1/cancel",
    client: cancelClient,
  })
  assert.equal(blocked.canceled, false)
  assert.equal(cancelCalls, 0)
  const accepted = await cancelIfQueued({
    providerStatus: "queued",
    cancelUrl: "https://api.higgsfield.ai/requests/req_1/cancel",
    client: cancelClient,
  })
  assert.equal(accepted.canceled, true)
  assert.equal(cancelCalls, 1)

  const leaked = await createHiggsfieldClient({
    credentials: { keyId: KEY_ID, keySecret: KEY_SECRET },
    baseUrl: "https://api.higgsfield.ai",
    fetchImpl: async () => json({ detail: `rejected ${KEY_SECRET}` }, {}, 401),
  }).estimate("higgsfield-ai/soul/v2/standard", testBody).then(
    () => "",
    (error: unknown) => (error instanceof Error ? error.message : ""),
  )
  assert.equal(leaked.includes(KEY_SECRET), false)
  assert.match(leaked, /401/)

  const stored = await storeCopiedAsset({
    asset: { kind: "image", url: "https://cdn.example/out.png" },
    scope: "connection",
    groupId: "tests",
    fileId: "file_test_asset",
    publicPath: "/api/connection-assets/file_test_asset",
    fetchImpl: async (_input, init) => {
      assert.equal(headersOf(init).get("authorization"), null)
      return new Response(Buffer.from("png"), { headers: { "content-type": "image/png" } })
    },
  })
  assert.equal(stored.outputUrl, "/api/connection-assets/file_test_asset")
  assert.equal(stored.localPath.endsWith(".png"), true)

  await assertRetryRow(prisma)
  console.log("higgsfield ok")
}

async function assertRetryRow(db: PrismaClient) {
  const repo = new PrismaJobRepository(db)
  const job = await db.job.create({
    data: {
      title: "Retry row",
      source: "email",
      rawBrief: "A long enough brief for the retry row check.",
      budgetCents: 10_000,
      status: "generating",
      channelFeeBps: 0,
      contingencyBps: 0,
    },
  })
  const failedId = await repo.createGeneration({
    jobId: job.id,
    stepId: null,
    providerRequestId: "req_failed",
    model: "higgsfield-ai/soul/v2/standard",
    status: "failed",
    costEstimateCents: 94,
    actualCostCents: null,
    error: "provider failed",
  })
  const retryId = await repo.createGeneration({
    jobId: job.id,
    stepId: null,
    retryOfId: failedId,
    providerRequestId: "req_retry",
    model: "higgsfield-ai/soul/v2/standard",
    status: "succeeded",
    costEstimateCents: 94,
    actualCostCents: 94,
    outputUrl: "/api/preview",
  })
  const previous = await db.generation.findUnique({ where: { id: failedId } })
  const next = await db.generation.findUnique({ where: { id: retryId } })
  assert.notEqual(retryId, failedId)
  assert.equal(previous?.status, "failed")
  assert.equal(previous?.outputUrl, null)
  assert.equal(previous?.actualCostCents, null)
  assert.equal(next?.retryOfId, failedId)
  assert.equal(next?.status, "succeeded")
}

function json(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
