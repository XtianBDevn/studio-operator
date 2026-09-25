"use server"

import { redirect } from "next/navigation"

import { CAPABILITIES } from "@/lib/analysis"
import { MESSAGE_KINDS, type MessageKind } from "@/lib/autonomy-policy"
import { consentCoversAny, type LikenessKind } from "@/lib/client-memory"
import { ROUTE_ROLES, type RouteRole } from "@/lib/router-catalog"
import { dollarsToCents } from "@/lib/money"
import type { Decision } from "@/lib/types"
import { runConnectionTest } from "@/server/connection-test"
import { getAccount, saveAutonomySettings } from "@/server/repositories/autonomy-repository"
import { jobs } from "@/server/repositories"
import { advanceSupervision } from "@/server/supervise"
import { redactSecrets } from "@/server/services/higgsfield/redact"
import {
  addRevision,
  analyzeJob,
  appendClientNote,
  approveBudgetIncrease,
  approveDelivery,
  approveWorkflowAndBudget,
  approveWorkflowChange,
  cancelJobGeneration,
  clearRights,
  decideRevision,
  intakeJob,
  planJob,
  saveRouteOverrides,
  refreshJobGeneration,
  rejectJob,
  requestWorkflowChange,
  retryJobGeneration,
  runGeneration,
  runQa,
  saveHumanAnalysis,
  setHumanDecision,
  updateCommercials,
  updatePackagePrice,
  approveQaRepair,
  continueRecording,
  resetDemoJob,
} from "@/server/studio"

function messageFrom(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Request failed"
  return redactSecrets(raw).slice(0, 500)
}

function back(jobId: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params)
  redirect(`/jobs/${jobId}?${search.toString()}`)
}

async function perform(jobId: string, tab: string, notice: string, work: () => Promise<void>) {
  try {
    await work()
  } catch (error) {
    back(jobId, { error: messageFrom(error), tab })
  }
  back(jobId, { notice, tab })
}

function readId(formData: FormData, key = "jobId"): string {
  const value = formData.get(key)
  if (typeof value !== "string" || !value) {
    throw new Error("Missing job.")
  }
  return value
}

export async function intakeAction(formData: FormData) {
  try {
    const budget = dollarsToCents(String(formData.get("budget") ?? ""))
    const deadlineRaw = String(formData.get("deadline") ?? "")
    const deadline = deadlineRaw ? new Date(`${deadlineRaw}T12:00:00.000Z`) : null
    if (deadline && Number.isNaN(deadline.getTime())) {
      throw new Error("Deadline is not a valid date.")
    }
    const references = String(formData.get("references") ?? "")
    const assets = references
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, url] = line.split("|").map((part) => part.trim())
        return {
          label: label || "Reference",
          url: url || label || "",
          kind: "link",
        }
      })
      .filter((asset) => asset.url.length > 0)

    const job = await intakeJob(jobs, {
      title: String(formData.get("title") ?? ""),
      source: String(formData.get("source") ?? ""),
      rawBrief: String(formData.get("rawBrief") ?? ""),
      budgetCents: budget ?? 0,
      deadline,
      clientNotes: String(formData.get("clientNotes") ?? ""),
      assets,
    })
    redirect(`/jobs/${job.id}?notice=${encodeURIComponent("Job opened from pasted brief.")}&tab=brief`)
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect(`/jobs/new?error=${encodeURIComponent(messageFrom(error))}`)
  }
}

export async function analyzeAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "decision", "Brief analyzed.", () => analyzeJob(jobs, jobId))
}

export async function decisionAction(formData: FormData) {
  const jobId = readId(formData)
  const decision = String(formData.get("decision") ?? "") as Decision
  if (decision !== "accept" && decision !== "human_review" && decision !== "reject") {
    back(jobId, { error: "Unknown decision.", tab: "decision" })
  }
  await perform(jobId, "decision", "Decision saved.", () =>
    setHumanDecision(jobs, jobId, decision),
  )
}

export async function planAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "workflow", "Production plan built. It still needs approval.", () =>
    planJob(jobs, jobId),
  )
}

export async function routeOverrideAction(formData: FormData) {
  const jobId = readId(formData)
  const patches: Array<{ position: number; modelId: string; attempts: number }> = []
  for (const [key, value] of formData.entries()) {
    const match = /^model-(\d+)$/.exec(key)
    if (!match?.[1]) continue
    const position = Number(match[1])
    const attempts = Number(formData.get(`attempts-${position}`))
    patches.push({
      position,
      modelId: String(value),
      attempts: Number.isInteger(attempts) ? attempts : 1,
    })
  }
  await perform(jobId, "workflow", "Route updated. Approve the workflow and maximum spend before generation.", () =>
    saveRouteOverrides(jobs, jobId, patches),
  )
}

export async function approveWorkflowAction(formData: FormData) {
  const jobId = readId(formData)
  const maxBudgetCents = dollarsToCents(String(formData.get("maxBudget") ?? ""))
  await perform(jobId, "workflow", "Workflow and budget approved.", async () => {
    if (maxBudgetCents == null) throw new Error("Enter a maximum production budget.")
    await approveWorkflowAndBudget(jobs, jobId, maxBudgetCents)
  })
}

export async function clearRightsAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "decision", "Rights gate cleared.", () => clearRights(jobs, jobId))
}

export async function generateAction(formData: FormData) {
  const jobId = readId(formData)
  const notice =
    process.env.STUDIO_OPERATOR_MODE === "live"
      ? "Generation updated. The timeline shows the provider status and recorded cost."
      : "Approved steps generated in mock mode."
  await perform(jobId, "outputs", notice, () => runGeneration(jobs, jobId))
}

export async function cancelGenerationAction(formData: FormData) {
  const jobId = readId(formData)
  const generationId = readId(formData, "generationId")
  await perform(jobId, "outputs", "Queued request canceled.", () =>
    cancelJobGeneration(jobs, jobId, generationId),
  )
}

export async function retryGenerationAction(formData: FormData) {
  const jobId = readId(formData)
  const generationId = readId(formData, "generationId")
  await perform(jobId, "outputs", "Retry created a new generation. The earlier attempt was kept.", () =>
    retryJobGeneration(jobs, jobId, generationId),
  )
}

export async function refreshGenerationAction(formData: FormData) {
  const jobId = readId(formData)
  const generationId = readId(formData, "generationId")
  await perform(jobId, "outputs", "Provider status refreshed.", () =>
    refreshJobGeneration(jobs, jobId, generationId),
  )
}

export async function connectionTestAction(formData: FormData) {
  try {
    await runConnectionTest(formData.get("confirm") === "yes")
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect(`/connection?error=${encodeURIComponent(messageFrom(error))}`)
  }
  redirect("/connection?notice=" + encodeURIComponent("Connection test finished. Credentials were not shown."))
}

export async function commercialsAction(formData: FormData) {
  const jobId = readId(formData)
  const channelPercent = Number(formData.get("channelPercent"))
  const contingencyPercent = Number(formData.get("contingencyPercent"))
  await perform(jobId, "costs", "Margin assumptions updated.", async () => {
    if (!Number.isFinite(channelPercent) || !Number.isFinite(contingencyPercent)) {
      throw new Error("Enter the channel fee and contingency as percents.")
    }
    await updateCommercials(jobs, jobId, {
      channelFeeBps: Math.round(channelPercent * 100),
      contingencyBps: Math.round(contingencyPercent * 100),
    })
  })
}

export async function revisionAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "revisions", "Revision note recorded.", () =>
    addRevision(jobs, jobId, {
      clientNote: String(formData.get("clientNote") ?? ""),
      affectedDeliverable: String(formData.get("affectedDeliverable") ?? ""),
    }),
  )
}

export async function revisionDecisionAction(formData: FormData) {
  const jobId = readId(formData)
  const revisionId = readId(formData, "revisionId")
  const approval = String(formData.get("approval") ?? "")
  if (approval !== "approved" && approval !== "rejected") {
    back(jobId, { error: "Unknown revision decision.", tab: "revisions" })
  }
  await perform(
    jobId,
    "revisions",
    approval === "approved" ? "Revision approved inside the budget." : "Revision declined.",
    () => decideRevision(jobs, jobId, revisionId, approval),
  )
}

export async function workflowChangeAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "workflow", "Workflow change is waiting for approval.", () =>
    requestWorkflowChange(jobs, jobId, String(formData.get("reason") ?? "")),
  )
}

export async function approveChangeAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "workflow", "Workflow change approved. Rebuild the plan next.", () =>
    approveWorkflowChange(jobs, jobId),
  )
}

export async function budgetIncreaseAction(formData: FormData) {
  const jobId = readId(formData)
  const maxBudgetCents = dollarsToCents(String(formData.get("maxBudget") ?? ""))
  await perform(jobId, "costs", "Production budget increased.", async () => {
    if (maxBudgetCents == null) throw new Error("Enter the new maximum.")
    await approveBudgetIncrease(jobs, jobId, maxBudgetCents)
  })
}

export async function deliverAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "outputs", "Marked delivered inside Studio Operator.", () =>
    approveDelivery(jobs, jobId),
  )
}

export async function rejectAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "decision", "Job rejected. Nothing was sent to a marketplace.", () =>
    rejectJob(jobs, jobId),
  )
}

export async function reviewAnalysisAction(formData: FormData) {
  const jobId = readId(formData)
  const intentRaw = String(formData.get("intent") ?? "save")
  const intent = intentRaw === "approve" || intentRaw === "reject" ? intentRaw : "save"
  const notice =
    intent === "approve"
      ? "Analysis approved for planning. Workflow and budget still need a person."
      : intent === "reject"
        ? "Job rejected. Nothing was sent to a marketplace."
        : "Edited analysis saved. The desk recalculated the decision."
  try {
    const raw = JSON.parse(String(formData.get("analysis") ?? "")) as unknown
    await saveHumanAnalysis(jobs, jobId, raw, intent)
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect(`/jobs/${jobId}/review?error=${encodeURIComponent(messageFrom(error))}`)
  }
  redirect(`/jobs/${jobId}/review?notice=${encodeURIComponent(notice)}`)
}

function recordBack(jobId: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params)
  redirect(`/record/${jobId}?${search.toString()}`)
}

export async function qaAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "qa", "QA checklist saved.", () => runQa(jobs, jobId))
}

export async function approveQaRepairAction(formData: FormData) {
  const jobId = readId(formData)
  const maxBudgetCents = dollarsToCents(String(formData.get("maxBudget") ?? ""))
  await perform(jobId, "qa", "QA repair approved.", async () => {
    if (maxBudgetCents == null) throw new Error("Enter a maximum that covers the repair.")
    await approveQaRepair(jobs, jobId, maxBudgetCents)
  })
}

export async function packagePriceAction(formData: FormData) {
  const jobId = readId(formData)
  const budgetCents = dollarsToCents(String(formData.get("budget") ?? ""))
  await perform(jobId, "costs", "Package price updated.", async () => {
    if (budgetCents == null || budgetCents < 1) throw new Error("Enter a package price above zero.")
    await updatePackagePrice(jobs, jobId, budgetCents)
  })
}

export async function recordContinueAction(formData: FormData) {
  const jobId = readId(formData)
  try {
    await continueRecording(jobs, jobId)
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    recordBack(jobId, { error: messageFrom(error) })
  }
  recordBack(jobId, { notice: "Step complete." })
}

export async function recordResetAction(formData: FormData) {
  const jobId = readId(formData)
  try {
    await resetDemoJob(jobs, jobId)
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    recordBack(jobId, { error: messageFrom(error) })
  }
  recordBack(jobId, { notice: "Demo reset to the seeded brief." })
}

export async function recordCommercialsAction(formData: FormData) {
  const jobId = readId(formData)
  const budgetCents = dollarsToCents(String(formData.get("budget") ?? ""))
  const channelPercent = Number(formData.get("channelPercent"))
  const contingencyPercent = Number(formData.get("contingencyPercent"))
  try {
    if (budgetCents == null || budgetCents < 1) throw new Error("Enter a package price above zero.")
    if (!Number.isFinite(channelPercent) || !Number.isFinite(contingencyPercent)) {
      throw new Error("Enter the channel fee and contingency as percents.")
    }
    await updatePackagePrice(jobs, jobId, budgetCents)
    await updateCommercials(jobs, jobId, {
      channelFeeBps: Math.round(channelPercent * 100),
      contingencyBps: Math.round(contingencyPercent * 100),
    })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    recordBack(jobId, { error: messageFrom(error) })
  }
  recordBack(jobId, { notice: "Margin assumptions updated." })
}

function superviseBack(jobId: string, params: Record<string, string>): never {
  const search = new URLSearchParams(params)
  redirect(`/supervise/${jobId}?${search.toString()}`)
}

export async function superviseContinueAction(formData: FormData) {
  const jobId = readId(formData)
  try {
    await advanceSupervision(jobs, jobId)
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    superviseBack(jobId, { error: messageFrom(error) })
  }
  superviseBack(jobId, { notice: "Supervised step complete." })
}

export async function superviseResetAction(formData: FormData) {
  const jobId = readId(formData)
  try {
    await resetDemoJob(jobs, jobId)
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    superviseBack(jobId, { error: messageFrom(error) })
  }
  superviseBack(jobId, { notice: "Demo reset. The supervised run starts again." })
}

export async function saveAutonomyAction(formData: FormData) {
  try {
    const maxAutoSpendPerJobCents = dollarsToCents(String(formData.get("maxJob") ?? ""))
    const maxAutoSpendPerRepairCents = dollarsToCents(String(formData.get("maxRepair") ?? ""))
    if (maxAutoSpendPerJobCents == null || maxAutoSpendPerRepairCents == null) {
      throw new Error("Enter the automatic spend limits in dollars.")
    }
    const families = formData
      .getAll("family")
      .map(String)
      .filter((role): role is RouteRole => (ROUTE_ROLES as readonly string[]).includes(role))
    if (families.length === 0) throw new Error("Select at least one model family.")
    const autoSend = formData
      .getAll("autoSend")
      .map(String)
      .filter((kind): kind is MessageKind => (MESSAGE_KINDS as readonly string[]).includes(kind))
    const maxAttempts = {
      image: 8,
      video: 12,
      voice: 4,
      editing: 3,
      finishing: 4,
    }
    for (const capability of CAPABILITIES) {
      const parsed = Number(formData.get(`attempt_${capability}`))
      if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Attempt limits are whole numbers.")
      maxAttempts[capability] = parsed
    }
    await saveAutonomySettings({
      maxAutoSpendPerJobCents,
      maxAutoSpendPerRepairCents,
      maxAttempts,
      allowedFamilies: families,
      autoSend,
      shareConceptsAutomatically: formData.get("shareConcepts") === "yes",
      finalDeliveryRequiresApproval: formData.get("finalDelivery") === "yes",
    })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect(`/autonomy?error=${encodeURIComponent(messageFrom(error))}`)
  }
  redirect("/autonomy?notice=Autonomy%20settings%20saved.")
}

export async function consentCheckAction(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "")
  const personLabel = String(formData.get("personLabel") ?? "").trim()
  const kind = String(formData.get("kind") ?? "")
  const useScope = String(formData.get("useScope") ?? "").trim()
  const back = (params: Record<string, string>) => {
    const search = new URLSearchParams(params)
    redirect(`/clients/${accountId}?${search.toString()}`)
  }
  try {
    if (kind !== "likeness" && kind !== "voice") throw new Error("Choose likeness or voice.")
    if (personLabel.length < 2 || useScope.length < 2) throw new Error("Name the person and the exact use.")
    const account = await getAccount(accountId)
    if (!account) throw new Error("Account not found.")
    const covered = consentCoversAny(
      account.consents
        .filter((consent): consent is { id: string; personLabel: string; kind: LikenessKind; useScope: string } =>
          consent.kind === "likeness" || consent.kind === "voice",
        )
        .map((consent) => ({
          personLabel: consent.personLabel,
          kind: consent.kind,
          useScope: consent.useScope,
        })),
      { personLabel, kind, useScope },
    )
    back({
      notice: covered
        ? "Stored consent covers this person, this kind, and this exact use."
        : "Stored consent does not cover this person or this use. An earlier approval does not carry over.",
    })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    back({ error: messageFrom(error) })
  }
}

export async function noteAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "brief", "Note added.", () =>
    appendClientNote(jobs, jobId, String(formData.get("note") ?? "")),
  )
}
