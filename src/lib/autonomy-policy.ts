import { APPROVED_ATTEMPT_LIMITS, type Capability } from "@/lib/analysis"
import { ROUTE_ROLES, type RouteRole } from "@/lib/router-catalog"

export const MESSAGE_KINDS = [
  "intake_question",
  "asset_request",
  "proposal",
  "progress_update",
  "concept_presentation",
  "revision_note",
  "change_order",
  "delivery_package",
  "follow_up",
] as const

export type MessageKind = (typeof MESSAGE_KINDS)[number]

export const MESSAGE_CHANNELS = ["marketplace", "email", "portal"] as const
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number]

export const PAUSE_CONDITIONS = [
  { id: "likeness_or_voice", label: "Likeness or voice" },
  { id: "unclear_ownership", label: "Unclear asset ownership" },
  { id: "factual_claim", label: "Factual advertising claims" },
  { id: "exact_packaging", label: "Exact packaging or regulated copy" },
  { id: "negative_margin", label: "Negative expected margin" },
  { id: "deadline_risk", label: "Missed deadline risk" },
  { id: "client_dispute", label: "A client dispute" },
] as const

export type PauseConditionId = (typeof PAUSE_CONDITIONS)[number]["id"]

export type AutonomySettings = {
  maxAutoSpendPerJobCents: number
  maxAutoSpendPerRepairCents: number
  maxAttempts: Record<Capability, number>
  allowedFamilies: RouteRole[]
  autoSend: MessageKind[]
  shareConceptsAutomatically: boolean
  finalDeliveryRequiresApproval: boolean
}

export const DEFAULT_AUTONOMY_SETTINGS: AutonomySettings = {
  maxAutoSpendPerJobCents: 30_000,
  maxAutoSpendPerRepairCents: 4_500,
  maxAttempts: { ...APPROVED_ATTEMPT_LIMITS },
  allowedFamilies: [...ROUTE_ROLES],
  autoSend: ["progress_update"],
  shareConceptsAutomatically: false,
  finalDeliveryRequiresApproval: true,
}

export type DispatchDecision = {
  disposition: "draft" | "sent" | "blocked"
  reason: string
}

export function dispatchMessage(input: {
  kind: MessageKind
  channel: MessageChannel
  settings: AutonomySettings
  pauses: PauseConditionId[]
}): DispatchDecision {
  if (input.channel === "marketplace") {
    return {
      disposition: "blocked",
      reason:
        "This draft stays with a person. Studio Operator does not send proposals, messages, or files through a third-party marketplace.",
    }
  }
  if (input.pauses.length > 0) {
    return {
      disposition: "draft",
      reason: `Paused for a person: ${input.pauses.join(", ")}.`,
    }
  }
  if (input.kind === "proposal" || input.kind === "change_order" || input.kind === "delivery_package") {
    return {
      disposition: "draft",
      reason: "Proposals, change orders, and delivery notes are drafted for a person even on a first-party channel.",
    }
  }
  if (input.kind === "concept_presentation" && !input.settings.shareConceptsAutomatically) {
    return {
      disposition: "draft",
      reason: "Concept sharing is set to draft for approval.",
    }
  }
  if (
    (input.channel === "email" || input.channel === "portal") &&
    input.settings.autoSend.includes(input.kind)
  ) {
    return {
      disposition: "sent",
      reason: `Sent on the first-party ${input.channel}. Nothing was sent through a marketplace.`,
    }
  }
  return {
    disposition: "draft",
    reason: "This message type is drafted for approval.",
  }
}

export function decideDelivery(settings: AutonomySettings): DispatchDecision {
  if (settings.finalDeliveryRequiresApproval) {
    return {
      disposition: "blocked",
      reason: "Final delivery requires a person. The agent prepared the package and stopped.",
    }
  }
  return {
    disposition: "sent",
    reason: "Autonomy settings allow the agent to record delivery. This still does not upload files to a marketplace.",
  }
}

export type SpendDecision = {
  allowed: boolean
  reason: string
}

export function decideAutoSpend(input: {
  settings: AutonomySettings
  spentCents: number
  incrementalCents: number
  pauses: PauseConditionId[]
}): SpendDecision {
  if (input.pauses.length > 0) {
    return { allowed: false, reason: `Paused for a person: ${input.pauses.join(", ")}.` }
  }
  if (input.incrementalCents > input.settings.maxAutoSpendPerRepairCents) {
    return {
      allowed: false,
      reason: "The repair is above the automatic per-repair spend. A person has to approve it.",
    }
  }
  if (input.spentCents + input.incrementalCents > input.settings.maxAutoSpendPerJobCents) {
    return {
      allowed: false,
      reason: "The repair would cross the automatic spend for this job. A person has to approve it.",
    }
  }
  return { allowed: true, reason: "The repair is inside the automatic per-repair and per-job spend." }
}

export function attemptsWithinAutonomy(
  capability: Capability,
  requested: number,
  settings: AutonomySettings,
): boolean {
  const desk = APPROVED_ATTEMPT_LIMITS[capability]
  const cap = Math.min(desk, settings.maxAttempts[capability] ?? desk)
  return requested >= 1 && requested <= cap
}

export function familyAllowed(role: RouteRole, settings: AutonomySettings): boolean {
  return settings.allowedFamilies.includes(role)
}
