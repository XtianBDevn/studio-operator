"use server"

import { redirect } from "next/navigation"

import { dollarsToCents } from "@/lib/money"
import type { Decision } from "@/lib/types"
import { jobs } from "@/server/repositories"
import {
  addRevision,
  analyzeJob,
  appendClientNote,
  approveBudgetIncrease,
  approveDelivery,
  approveWorkflowAndBudget,
  approveWorkflowChange,
  clearRights,
  decideRevision,
  intakeJob,
  planJob,
  rejectJob,
  requestWorkflowChange,
  runGeneration,
  saveHumanAnalysis,
  setHumanDecision,
  updateCommercials,
} from "@/server/studio"

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed"
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
  await perform(jobId, "outputs", "Approved steps generated in mock mode.", () =>
    runGeneration(jobs, jobId),
  )
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

export async function noteAction(formData: FormData) {
  const jobId = readId(formData)
  await perform(jobId, "brief", "Note added.", () =>
    appendClientNote(jobs, jobId, String(formData.get("note") ?? "")),
  )
}
