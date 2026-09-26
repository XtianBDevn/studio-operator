import type { ApprovalGateRecord, GateKind, JobDetail } from "@/lib/types"

export const GATE_COPY: Record<
  GateKind,
  { label: string; waiting: string }
> = {
  workflow_budget: {
    label: "Workflow and maximum budget",
    waiting: "Opens when a production plan exists. Generation stays blocked until a person approves the plan and a maximum production budget.",
  },
  budget_increase: {
    label: "Budget increase",
    waiting: "Opens only if a generation or revision would exceed the approved maximum. The run does not continue on its own.",
  },
  workflow_change: {
    label: "Material workflow change",
    waiting: "Opens when someone asks to replace an already approved plan. The old plan stays in force until this is approved.",
  },
  rights: {
    label: "Rights issue",
    waiting: "Opens when analysis finds a likeness, trademark, or music-rights concern. Generation and delivery stay blocked until a person clears it.",
  },
  final_delivery: {
    label: "Final delivery",
    waiting: "Opens after generation is in QA. Approving it marks the job delivered inside Studio Operator. It does not upload files to a marketplace.",
  },
  qa_repair: {
    label: "QA repair outside the approved limit",
    waiting: "Opens only when a targeted repair would exceed the approved per-repair or per-job spend. The repair does not run until a person approves it.",
  },
}

export function latestGate(
  approvals: ApprovalGateRecord[],
  kind: GateKind,
): ApprovalGateRecord | null {
  for (let index = approvals.length - 1; index >= 0; index -= 1) {
    const gate = approvals[index]
    if (gate && gate.kind === kind) return gate
  }
  return null
}

export function hasOpenGate(approvals: ApprovalGateRecord[], kind: GateKind): boolean {
  return approvals.some((gate) => gate.kind === kind && gate.status === "required")
}

export function canRebuildPlan(job: Pick<JobDetail, "status" | "analysis" | "approvals">): boolean {
  if (!job.analysis) return false
  if (job.status === "delivered" || job.status === "rejected") return false
  const budget = latestGate(job.approvals, "workflow_budget")
  if (!budget || budget.status !== "approved") return true
  const change = latestGate(job.approvals, "workflow_change")
  if (!change || change.status !== "approved" || !change.resolvedAt || !budget.resolvedAt) {
    return false
  }
  return change.resolvedAt >= budget.resolvedAt
}

export type DeskActionState = {
  canAnalyze: boolean
  canPlan: boolean
  canApproveWorkflow: boolean
  canGenerate: boolean
  canRequestChange: boolean
  canApproveChange: boolean
  canDeliver: boolean
  canReject: boolean
  canRevise: boolean
  canEditCommercials: boolean
  rightsBlocked: boolean
  budgetBlocked: boolean
}

export function deskActions(job: JobDetail): DeskActionState {
  const rightsBlocked = hasOpenGate(job.approvals, "rights")
  const budgetBlocked = hasOpenGate(job.approvals, "budget_increase")
  const changeBlocked = hasOpenGate(job.approvals, "workflow_change")
  const workflowApproved =
    latestGate(job.approvals, "workflow_budget")?.status === "approved"
  const pendingRevision = job.revisions.some((revision) => revision.approvalStatus === "pending")

  return {
    canAnalyze: ["new", "needs_review", "rejected"].includes(job.status),
    canPlan: canRebuildPlan(job),
    canApproveWorkflow:
      job.steps.length > 0 &&
      hasOpenGate(job.approvals, "workflow_budget") &&
      !rightsBlocked &&
      job.analysis?.decision !== "reject",
    canGenerate:
      (job.status === "approved" || job.status === "generating") &&
      workflowApproved &&
      !rightsBlocked &&
      !changeBlocked &&
      !budgetBlocked &&
      job.analysis?.decision !== "reject",
    canRequestChange: ["approved", "generating", "qa"].includes(job.status),
    canApproveChange: changeBlocked,
    canDeliver:
      job.status === "qa" &&
      !pendingRevision &&
      !rightsBlocked &&
      !budgetBlocked &&
      !hasOpenGate(job.approvals, "qa_repair"),
    canReject: !["delivered", "rejected"].includes(job.status),
    canRevise: job.status === "qa",
    canEditCommercials: job.status !== "delivered",
    rightsBlocked,
    budgetBlocked,
  }
}
