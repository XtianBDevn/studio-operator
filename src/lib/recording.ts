export const RECORDING_PAUSES = [
  "analysis",
  "plan",
  "approval",
  "generation",
  "qa",
  "repair",
  "delivery",
  "done",
  "stopped",
] as const

export type RecordingPauseId = (typeof RECORDING_PAUSES)[number]

export type RecordingSnapshot = {
  status: string
  hasAnalysis: boolean
  stepCount: number
  decision: "accept" | "human_review" | "reject" | null
  openGates: string[]
  latestVerdict: string | null
}

export type RecordingPause = {
  id: RecordingPauseId
  label: string
}

export function recordingPause(snapshot: RecordingSnapshot): RecordingPause {
  if (snapshot.status === "delivered") return { id: "done", label: "Deliverables" }
  if (snapshot.status === "rejected" || snapshot.decision === "reject") {
    return { id: "stopped", label: "Rejected" }
  }
  if (snapshot.openGates.includes("qa_repair")) {
    return { id: "repair", label: "Paused before repair approval" }
  }
  if (snapshot.status === "qa" && snapshot.latestVerdict === "ready") {
    return { id: "delivery", label: "Paused before delivery" }
  }
  if (snapshot.status === "qa") return { id: "qa", label: "Paused before QA" }
  if (snapshot.status === "approved" || snapshot.status === "generating") {
    return { id: "generation", label: "Paused before generation" }
  }
  if (snapshot.openGates.includes("workflow_budget")) {
    return { id: "approval", label: "Paused before approval" }
  }
  if (snapshot.hasAnalysis && snapshot.stepCount === 0) {
    return { id: "plan", label: "Paused before the production plan" }
  }
  return { id: "analysis", label: "Paused before analysis" }
}
