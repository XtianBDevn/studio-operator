import type { PauseConditionId, AutonomySettings } from "@/lib/autonomy-policy"
import { decideAutoSpend, familyAllowed } from "@/lib/autonomy-policy"
import type { QaCheck } from "@/lib/qa"
import type { RouteRole } from "@/lib/router-catalog"

export type RepairAction = "targeted_edit" | "regenerate_shot" | "change_model" | "ask_client" | "escalate"

export type RepairPlan = {
  action: RepairAction
  component: string
  modelId: string | null
  modelLabel: string | null
  incrementalCents: number
  allowed: boolean
  reason: string
}

export function chooseRepair(input: {
  checks: Array<Pick<QaCheck, "id" | "status">>
  repairModelId: string | null
  repairModelLabel: string | null
  repairRole: RouteRole
  incrementalCents: number
  spentCents: number
  settings: AutonomySettings
  pauses: PauseConditionId[]
  missingQuestion: boolean
}): RepairPlan {
  const failed = input.checks.find((check) => check.status === "fail")
  const component = failed?.id ?? "output"
  if (input.missingQuestion) {
    return {
      action: "ask_client",
      component,
      modelId: null,
      modelLabel: null,
      incrementalCents: 0,
      allowed: false,
      reason: "A missing input would change the picture. The agent asked the client instead of guessing.",
    }
  }
  if (input.pauses.length > 0 || component === "exact_text" || component === "face_hands" || component === "audio_lipsync") {
    return {
      action: "escalate",
      component,
      modelId: input.repairModelId,
      modelLabel: input.repairModelLabel,
      incrementalCents: input.incrementalCents,
      allowed: false,
      reason: "The failure touches rights, identity, exact copy, or another pause condition. A person decides.",
    }
  }
  if (!familyAllowed(input.repairRole, input.settings)) {
    return {
      action: "change_model",
      component,
      modelId: input.repairModelId,
      modelLabel: input.repairModelLabel,
      incrementalCents: input.incrementalCents,
      allowed: false,
      reason: "The repair model family is not in the allowed list. The agent stopped before changing models on its own.",
    }
  }
  const spend = decideAutoSpend({
    settings: input.settings,
    spentCents: input.spentCents,
    incrementalCents: input.incrementalCents,
    pauses: input.pauses,
  })
  if (component === "motion" && input.repairModelId) {
    return {
      action: "targeted_edit",
      component: "reflection and geometry continuity",
      modelId: input.repairModelId,
      modelLabel: input.repairModelLabel,
      incrementalCents: input.incrementalCents,
      allowed: spend.allowed,
      reason: spend.allowed
        ? `The smallest failure is continuity. One targeted shot repair on ${input.repairModelLabel} stays inside the automatic spend.`
        : spend.reason,
    }
  }
  if (component === "required_scenes" || component === "deliverable_type") {
    return {
      action: spend.allowed ? "regenerate_shot" : "escalate",
      component,
      modelId: input.repairModelId,
      modelLabel: input.repairModelLabel,
      incrementalCents: input.incrementalCents,
      allowed: spend.allowed,
      reason: spend.allowed
        ? "One shot can be regenerated inside the automatic spend."
        : spend.reason,
    }
  }
  return {
    action: "escalate",
    component,
    modelId: input.repairModelId,
    modelLabel: input.repairModelLabel,
    incrementalCents: input.incrementalCents,
    allowed: false,
    reason: spend.allowed
      ? "The failure does not have a priced single-shot repair. A person chooses the next action."
      : spend.reason,
  }
}
