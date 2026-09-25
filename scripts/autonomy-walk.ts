import assert from "node:assert/strict"

import { GLASS_MONUMENT, NIGHT_ORCHARD } from "../src/lib/demos"
import { prisma } from "../src/server/db"
import { listAudit, listMessages } from "../src/server/repositories/autonomy-repository"
import { PrismaJobRepository } from "../src/server/repositories/prisma-job-repository"
import { advanceSupervision, currentBeat } from "../src/server/supervise"

const jobs = new PrismaJobRepository(prisma)

async function walk(jobId: string, beats: string[]) {
  for (const expected of beats) {
    assert.equal(await currentBeat(jobId), expected, `${jobId} expected ${expected}`)
    if (expected === "done") return
    await advanceSupervision(jobs, jobId)
  }
}

async function main() {
  await walk(GLASS_MONUMENT.id, [
    "missing_question",
    "record_answer",
    "proposal",
    "approve_scope",
    "progress_update",
    "generate",
    "repair",
    "warmer_revision",
    "delivery_blocked",
  ])

  const beforeDelivery = await jobs.getJob(GLASS_MONUMENT.id)
  assert.ok(beforeDelivery)
  assert.notEqual(beforeDelivery.status, "delivered")
  assert.equal(beforeDelivery.status, "qa")
  const blockedMessages = await listMessages(GLASS_MONUMENT.id)
  assert.equal(
    blockedMessages.some((message) => message.channel === "marketplace"),
    false,
  )
  assert.equal(blockedMessages.filter((message) => message.kind === "asset_request").length, 1)
  assert.match(
    blockedMessages.find((message) => message.kind === "asset_request")?.body ?? "",
    /approved material or product/,
  )
  assert.equal(blockedMessages.find((message) => message.kind === "proposal")?.disposition, "draft")
  assert.equal(blockedMessages.find((message) => message.kind === "progress_update")?.disposition, "sent")
  assert.equal(blockedMessages.find((message) => message.kind === "progress_update")?.channel, "portal")
  assert.equal(blockedMessages.find((message) => message.kind === "delivery_package")?.disposition, "draft")
  assert.match(
    blockedMessages.find((message) => message.kind === "delivery_package")?.body ?? "",
    /approve final delivery/,
  )
  assert.match(
    blockedMessages.find((message) => message.kind === "revision_note")?.body ?? "",
    /warmer and more hopeful/,
  )
  assert.match(blockedMessages.find((message) => message.kind === "revision_note")?.body ?? "", /included revision/)
  const repairAudit = (await listAudit(GLASS_MONUMENT.id)).find((event) => event.kind === "repair")
  assert.match(repairAudit?.detail ?? "", /continuity|Seedance|repair/i)
  assert.ok(beforeDelivery.generations.some((item) => item.model.includes("seedance")))
  assert.equal(beforeDelivery.qaReports[0]?.incrementalCents, 4500)

  await walk(GLASS_MONUMENT.id, ["approve_delivery", "follow_up", "done"])
  const delivered = await jobs.getJob(GLASS_MONUMENT.id)
  assert.equal(delivered?.status, "delivered")
  const follow = (await listMessages(GLASS_MONUMENT.id)).find((message) => message.kind === "follow_up")
  assert.equal(follow?.disposition, "draft")
  assert.match(follow?.body ?? "", /testimonial/)
  const kinds = new Set((await listAudit(GLASS_MONUMENT.id)).map((event) => event.kind))
  for (const kind of [
    "model_decision",
    "message_draft",
    "message_sent",
    "approval",
    "generation",
    "repair",
    "cost_change",
    "escalation",
  ]) {
    assert.equal(kinds.has(kind), true, kind)
  }

  const orchardBefore = await jobs.getJob(NIGHT_ORCHARD.id)
  assert.equal(orchardBefore?.generations.length, 0)
  await walk(NIGHT_ORCHARD.id, ["compare", "spend_escalation"])
  const orchardMid = await jobs.getJob(NIGHT_ORCHARD.id)
  assert.equal(orchardMid?.generations.length, 0)
  assert.notEqual(orchardMid?.status, "delivered")
  const orchardAudit = await listAudit(NIGHT_ORCHARD.id)
  assert.match(orchardAudit.map((event) => event.detail).join("\n"), /orbit|atmosphere|low light|camera/i)
  assert.match(orchardAudit.map((event) => event.summary).join("\n"), /crosses the automatic spend/)
  await walk(NIGHT_ORCHARD.id, ["delivery_blocked", "done"])
  const orchardDone = await jobs.getJob(NIGHT_ORCHARD.id)
  assert.notEqual(orchardDone?.status, "delivered")

  console.log("autonomy walk passed")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
