import { assertAllowedOperation } from "@/lib/guardrails"
import { GLASS_MONUMENT, NIGHT_ORCHARD } from "@/lib/demos"
import { StudioError } from "@/lib/errors"
import {
  conceptPresentation,
  deliveryPackageDraft,
  followUpDraft,
  interpretRevision,
  materialQuestions,
  progressUpdate,
  proposalDraft,
  scopeSummary,
} from "@/lib/client-agent"
import { dispatchMessage, decideDelivery } from "@/lib/autonomy-policy"
import { chooseRepair } from "@/lib/self-repair"
import { LAUNCH_VIDEO } from "@/lib/service-templates"
import { catalogById } from "@/lib/router-catalog"
import { estimatedGenerationCents, spentGenerationCents } from "@/lib/types"
import type { JobRepository } from "@/server/repositories/job-repository"
import {
  addMessage,
  getAutonomySettings,
  getBeat,
  setBeat,
} from "@/server/repositories/autonomy-repository"
import { addAudit } from "@/server/services/audit"
import {
  analyzeJob,
  appendClientNote,
  approveDelivery,
  approveWorkflowAndBudget,
  planJob,
  runGeneration,
  runQa,
} from "@/server/studio"

const GLASS_BEATS = [
  "missing_question",
  "record_answer",
  "proposal",
  "approve_scope",
  "progress_update",
  "generate",
  "repair",
  "warmer_revision",
  "delivery_blocked",
  "approve_delivery",
  "follow_up",
  "done",
] as const

const ORCHARD_BEATS = ["compare", "spend_escalation", "delivery_blocked", "done"] as const

export type SuperviseBeat = (typeof GLASS_BEATS)[number] | (typeof ORCHARD_BEATS)[number]

const BEAT_COPY: Record<string, { label: string; action: string; detail: string }> = {
  missing_question: {
    label: "Paused before the missing-input question",
    action: "Ask the missing question",
    detail: "The vague request does not name the approved glass. The agent asks that one question and nothing else.",
  },
  record_answer: {
    label: "Paused for the client's answer",
    action: "Record the client's answer",
    detail: "The answer names the supplied glass reference. It does not add a person, a voice, or a new use.",
  },
  proposal: {
    label: "Paused before the proposal",
    action: "Draft the proposal",
    detail: "The proposal stays a draft. Sending it through Upwork is refused.",
  },
  approve_scope: {
    label: "Paused for scope and spend approval",
    action: "Approve scope and the production maximum",
    detail: "A person approves the route and the maximum. The agent does not accept a contract.",
  },
  progress_update: {
    label: "Paused before the client update",
    action: "Send the milestone update on the portal",
    detail: "The update says the route is approved and motion has not started. The same text is refused on Upwork.",
  },
  generate: {
    label: "Paused before generation",
    action: "Generate inside the maximum",
    detail: "Mock generation runs only the approved steps, and skips the conditional repair until QA.",
  },
  repair: {
    label: "Paused on the continuity failure",
    action: "Repair the reflection and geometry",
    detail: "QA finds the continuity failure and runs one Seedance repair inside the automatic spend.",
  },
  warmer_revision: {
    label: "Paused on the revision",
    action: "Read the warmer-reveal note",
    detail: "The client wants the final reveal warmer and more hopeful. That is an included finishing pass, not a change order.",
  },
  delivery_blocked: {
    label: "Paused before delivery",
    action: "Try to release delivery",
    detail: "The agent prepares the package and stops. Final delivery still needs a person, and marketplace delivery is refused.",
  },
  approve_delivery: {
    label: "Paused for the human delivery approval",
    action: "Approve final delivery",
    detail: "A person records delivery on this desk. Files are not uploaded to a marketplace.",
  },
  follow_up: {
    label: "Paused after delivery",
    action: "Draft the follow-up",
    detail: "The follow-up asks for feedback, a testimonial, and whether a later package is worth discussing.",
  },
  compare: {
    label: "Paused before the route comparison",
    action: "Build the Night Orchard route",
    detail: "The same desk picks a hero still and an orbit for atmosphere, low light, and camera motion.",
  },
  spend_escalation: {
    label: "Paused on a spend check",
    action: "Test a repair above the cap",
    detail: "A second orbit priced at $90.00 is above the automatic repair cap. The agent escalates and does not generate.",
  },
  done: {
    label: "Supervised run complete",
    action: "Complete",
    detail: "The audit log is the record of what the agent did and what it left for a person.",
  },
}

export function beatCopy(beat: string): { label: string; action: string; detail: string } {
  return BEAT_COPY[beat] ?? BEAT_COPY.done
}

export function firstBeat(jobId: string): SuperviseBeat {
  return jobId === NIGHT_ORCHARD.id ? "compare" : "missing_question"
}

export async function currentBeat(jobId: string): Promise<SuperviseBeat> {
  const stored = await getBeat(jobId)
  if (stored && stored in BEAT_COPY) return stored as SuperviseBeat
  return firstBeat(jobId)
}

export async function advanceSupervision(repo: JobRepository, jobId: string): Promise<void> {
  assertAllowedOperation("autonomy.audit")
  const beat = await currentBeat(jobId)
  if (beat === "done") throw new StudioError("This supervised run is already complete.")
  if (jobId === GLASS_MONUMENT.id) await advanceGlass(repo, jobId, beat)
  else if (jobId === NIGHT_ORCHARD.id) await advanceOrchard(repo, jobId, beat)
  else throw new StudioError("Supervised runs are available for the two seeded demos.")
}

async function advanceGlass(repo: JobRepository, jobId: string, beat: SuperviseBeat): Promise<void> {
  const settings = await getAutonomySettings()
  if (beat === "missing_question") {
    const questions = materialQuestions({
      vague: "A short cinematic film of our glass monument after the rain.",
      suppliedLabels: [],
      template: LAUNCH_VIDEO,
    })
    const question = questions[0]
    if (!question || questions.length !== 1) throw new StudioError("The intake did not find exactly one material question.")
    assertAllowedOperation("client.draft_message")
    const body = question.asset ? `${question.prompt}\n\nAsset needed: ${question.asset}.` : question.prompt
    await addMessage({ jobId, kind: "asset_request", channel: "portal", disposition: "draft", body })
    await addAudit({
      jobId,
      kind: "message_draft",
      summary: "Asked for the approved glass reference",
      detail: body,
    })
    await addAudit({
      jobId,
      kind: "escalation",
      summary: "Refused to send the question through Upwork",
      detail: await marketplaceRefusal("marketplace.message"),
    })
  } else if (beat === "record_answer") {
    await appendClientNote(
      repo,
      jobId,
      "Client answer: use the supplied glass material reference. No people and no dialogue.",
    )
    await addAudit({
      jobId,
      kind: "approval",
      summary: "Recorded the client's answer on the desk",
      detail: "The answer selects an asset already on the job. It is not consent for a person, a voice, or a new use.",
    })
  } else if (beat === "proposal") {
    const body = proposalDraft({
      title: GLASS_MONUMENT.title,
      template: LAUNCH_VIDEO,
      priceCents: GLASS_MONUMENT.budgetCents,
    })
    assertAllowedOperation("client.draft_message")
    await addMessage({ jobId, kind: "proposal", channel: "portal", disposition: "draft", body })
    const blocked = dispatchMessage({ kind: "proposal", channel: "marketplace", settings, pauses: [] })
    await addAudit({ jobId, kind: "message_draft", summary: "Drafted the proposal for a person", detail: scopeSummary({ title: GLASS_MONUMENT.title, template: LAUNCH_VIDEO }) })
    await addAudit({
      jobId,
      kind: "escalation",
      summary: "Refused to send the proposal through Upwork",
      detail: `${blocked.reason} ${await marketplaceRefusal("marketplace.submit_proposal")}`,
    })
  } else if (beat === "approve_scope") {
    assertAllowedOperation("approval.human")
    await analyzeJob(repo, jobId)
    await planJob(repo, jobId)
    const job = await must(repo, jobId)
    const estimate = estimatedGenerationCents(job.steps)
    const contingency = Math.round((estimate * job.contingencyBps) / 10_000)
    await approveWorkflowAndBudget(repo, jobId, estimate + contingency)
    const decided = job.steps
      .map((step) => `${step.name}: ${catalogById(step.selectedModel)?.label ?? step.selectedModel} (${step.routeRole ?? "role"})`)
      .join("\n")
    await addAudit({
      jobId,
      kind: "approval",
      summary: "A person approved the scope and the production maximum",
      detail: "This approval is inside the desk. It does not accept a marketplace contract.",
    })
    await addAudit({ jobId, kind: "model_decision", summary: "Route selected for Glass Monument", detail: decided })
    await addAudit({
      jobId,
      kind: "cost_change",
      summary: "Production maximum set from the approved route",
      detail: `Generation estimate ${(estimate / 100).toFixed(2)} USD plus contingency ${(contingency / 100).toFixed(2)} USD.`,
    })
  } else if (beat === "progress_update") {
    const body = progressUpdate({
      title: GLASS_MONUMENT.title,
      milestone: "The route is approved: concept stills, three keyframes, premium motion, and one continuity repair if the glass or the water drifts.",
      next: "Motion has not started. The next message will be the concept frames, after a person looks at them.",
    })
    const portal = dispatchMessage({ kind: "progress_update", channel: "portal", settings, pauses: [] })
    if (portal.disposition === "sent") assertAllowedOperation("client.send_first_party")
    else assertAllowedOperation("client.draft_message")
    await addMessage({
      jobId,
      kind: "progress_update",
      channel: "portal",
      disposition: portal.disposition === "sent" ? "sent" : "draft",
      body,
    })
    await addAudit({
      jobId,
      kind: portal.disposition === "sent" ? "message_sent" : "message_draft",
      summary: "Milestone update on the first-party portal",
      detail: portal.reason,
    })
    await addAudit({
      jobId,
      kind: "escalation",
      summary: "Refused to send the update through Upwork",
      detail: await marketplaceRefusal("marketplace.message"),
    })
  } else if (beat === "generate") {
    await runGeneration(repo, jobId)
    const job = await must(repo, jobId)
    await addAudit({
      jobId,
      kind: "generation",
      summary: "Generated the approved steps in mock mode",
      detail: job.generations.map((item) => `${item.model} ${item.status}`).join("\n"),
    })
    const concept = conceptPresentation({
      title: GLASS_MONUMENT.title,
      changed: "Concept stills and controlled keyframes are on the desk. The final reveal has not been graded.",
      decision: "Choose whether these frames are the ones to carry into the film.",
    })
    const share = dispatchMessage({ kind: "concept_presentation", channel: "portal", settings, pauses: [] })
    if (share.disposition === "sent") assertAllowedOperation("client.send_first_party")
    else assertAllowedOperation("client.draft_message")
    await addMessage({
      jobId,
      kind: "concept_presentation",
      channel: "portal",
      disposition: share.disposition === "sent" ? "sent" : "draft",
      body: concept,
    })
    await addAudit({
      jobId,
      kind: share.disposition === "sent" ? "message_sent" : "message_draft",
      summary: "Concept frames prepared with the decision a person still makes",
      detail: share.reason,
    })
  } else if (beat === "repair") {
    const before = await must(repo, jobId)
    const spent = spentGenerationCents(before.generations)
    const plan = chooseRepair({
      checks: [{ id: "motion", status: "fail" }],
      repairModelId: "bytedance/seedance-2.5/video-edit",
      repairModelLabel: "Seedance 2.5 video edit",
      repairRole: "CONTROL",
      incrementalCents: 4500,
      spentCents: spent,
      settings,
      pauses: [],
      missingQuestion: false,
    })
    if (!plan.allowed || plan.action !== "targeted_edit") {
      throw new StudioError(plan.reason)
    }
    await runQa(repo, jobId)
    const after = await must(repo, jobId)
    const report = after.qaReports[0]
    await addAudit({
      jobId,
      kind: "repair",
      summary: "Targeted repair for reflection and geometry",
      detail: report?.reason ?? plan.reason,
    })
    await addAudit({
      jobId,
      kind: "cost_change",
      summary: "Repair cost applied inside the automatic cap",
      detail: report
        ? `${report.repairModelLabel ?? "Repair"} incremental ${(report.incrementalCents / 100).toFixed(2)} USD. New total ${(report.newTotalCents / 100).toFixed(2)} USD. Updated margin ${(report.updatedMarginCents / 100).toFixed(2)} USD.`
        : plan.reason,
    })
  } else if (beat === "warmer_revision") {
    const job = await must(repo, jobId)
    const read = interpretRevision({
      note: "Please make the final reveal warmer and more hopeful.",
      steps: job.steps.map((step) => ({ name: step.name, capability: step.modelKind })),
      includedRounds: LAUNCH_VIDEO.includedRevisionRounds,
      usedRounds: 0,
    })
    if (!read.included || read.changeOrder) throw new StudioError("The warmer reveal was treated as a scope change.")
    assertAllowedOperation("client.draft_message")
    await addMessage({
      jobId,
      kind: "revision_note",
      channel: "portal",
      disposition: "draft",
      body: `Client note: Please make the final reveal warmer and more hopeful.\n\n${read.summary}`,
    })
    await addAudit({
      jobId,
      kind: "cost_change",
      summary: "Included revision on the final reveal",
      detail: `${read.summary} Affected asset: ${read.affectedAsset}. Step: ${read.affectedStep}.`,
    })
  } else if (beat === "delivery_blocked") {
    await blockDelivery(jobId, settings, [
      "16:9 film",
      "9:16 film",
      "Three keyframes",
      "Usage is limited to this monument film. It is not consent for a person or a later campaign.",
    ])
  } else if (beat === "approve_delivery") {
    assertAllowedOperation("approval.human")
    await approveDelivery(repo, jobId)
    await addAudit({
      jobId,
      kind: "approval",
      summary: "A person approved final delivery",
      detail: "Delivered inside Studio Operator. No marketplace upload was performed.",
    })
  } else if (beat === "follow_up") {
    assertAllowedOperation("client.draft_message")
    const body = followUpDraft({ title: GLASS_MONUMENT.title })
    await addMessage({ jobId, kind: "follow_up", channel: "portal", disposition: "draft", body })
    await addAudit({
      jobId,
      kind: "message_draft",
      summary: "Drafted feedback, testimonial, and a possible later package",
      detail: "The follow-up is a draft. A later package would be a new order.",
    })
  } else {
    throw new StudioError("That step is not part of the Glass Monument run.")
  }
  await setBeat(jobId, nextBeat(GLASS_BEATS, beat))
}

async function advanceOrchard(repo: JobRepository, jobId: string, beat: SuperviseBeat): Promise<void> {
  const settings = await getAutonomySettings()
  if (beat === "compare") {
    await analyzeJob(repo, jobId)
    await planJob(repo, jobId)
    const job = await must(repo, jobId)
    const lines = job.steps.map(
      (step) => `${step.name}: ${catalogById(step.selectedModel)?.label ?? step.selectedModel} (${step.routeRole ?? "role"}, ${step.routeStage ?? "stage"})`,
    )
    await addAudit({
      jobId,
      kind: "model_decision",
      summary: "Night Orchard route for atmosphere, low light, and camera motion",
      detail: [
        "Glass Monument uses concept search, controlled keyframes, Kling 3.0 Pro, and a continuity repair.",
        "Night Orchard keeps the approved world and spends the motion step on a slow orbit.",
        ...lines,
      ].join("\n"),
    })
  } else if (beat === "spend_escalation") {
    const plan = chooseRepair({
      checks: [{ id: "motion", status: "fail" }],
      repairModelId: "higgsfield/cinema-studio/4.0",
      repairModelLabel: "Cinema Studio 4.0",
      repairRole: "SHIP",
      incrementalCents: 9_000,
      spentCents: 0,
      settings,
      pauses: [],
      missingQuestion: false,
    })
    if (plan.allowed) throw new StudioError("The over-cap repair was allowed.")
    await addAudit({
      jobId,
      kind: "escalation",
      summary: "Stopped a repair that crosses the automatic spend",
      detail: plan.reason,
    })
  } else if (beat === "delivery_blocked") {
    await blockDelivery(jobId, settings, [
      "Orbit master",
      "Hero still",
      "Usage is limited to this orchard film.",
    ])
  } else {
    throw new StudioError("That step is not part of the Night Orchard run.")
  }
  await setBeat(jobId, nextBeat(ORCHARD_BEATS, beat))
}

async function blockDelivery(
  jobId: string,
  settings: Awaited<ReturnType<typeof getAutonomySettings>>,
  files: string[],
): Promise<void> {
  assertAllowedOperation("client.draft_message")
  const body = deliveryPackageDraft({
    title: jobId === NIGHT_ORCHARD.id ? NIGHT_ORCHARD.title : GLASS_MONUMENT.title,
    files,
    usage: "The files match the approved package. A person still releases them.",
  })
  await addMessage({ jobId, kind: "delivery_package", channel: "portal", disposition: "draft", body })
  const decision = decideDelivery(settings)
  if (decision.disposition !== "blocked") {
    throw new StudioError("Final delivery was released without a person.")
  }
  const marketplaceDetail = await marketplaceRefusal("marketplace.deliver")
  await addAudit({
    jobId,
    kind: "escalation",
    summary: "Agent stopped before final delivery",
    detail: `${decision.reason} ${marketplaceDetail}`,
  })
  await addAudit({
    jobId,
    kind: "message_draft",
    summary: "Delivery package drafted for a person",
    detail: "The file list and usage note are ready. The job was not marked delivered.",
  })
}

async function marketplaceRefusal(operation: string): Promise<string> {
  try {
    assertAllowedOperation(operation)
    return `${operation} was not refused.`
  } catch (error) {
    return error instanceof Error ? error.message : `${operation} was refused.`
  }
}

function nextBeat<T extends string>(order: readonly T[], beat: SuperviseBeat): T {
  const index = order.indexOf(beat as T)
  return order[Math.min(order.length - 1, index + 1)] ?? order[order.length - 1]
}

async function must(repo: JobRepository, jobId: string) {
  const job = await repo.getJob(jobId)
  if (!job) throw new StudioError("Job not found.")
  return job
}
