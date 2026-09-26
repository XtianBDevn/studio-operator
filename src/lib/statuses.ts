export const JOB_STATUSES = [
  { id: "new", label: "New" },
  { id: "needs_review", label: "Needs Review" },
  { id: "approved", label: "Approved" },
  { id: "generating", label: "Generating" },
  { id: "qa", label: "QA" },
  { id: "delivered", label: "Delivered" },
  { id: "rejected", label: "Rejected" },
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]["id"]

export function isJobStatus(value: string): value is JobStatus {
  return JOB_STATUSES.some((status) => status.id === value)
}

export function statusLabel(status: string): string {
  return JOB_STATUSES.find((item) => item.id === status)?.label ?? status
}

export function statusTone(status: string): string {
  switch (status) {
    case "new":
      return "bg-stone-100 text-stone-800"
    case "needs_review":
      return "bg-amber-100 text-amber-950"
    case "approved":
      return "bg-sky-100 text-sky-950"
    case "generating":
      return "bg-indigo-100 text-indigo-950"
    case "qa":
      return "bg-violet-100 text-violet-950"
    case "delivered":
      return "bg-emerald-100 text-emerald-950"
    case "rejected":
      return "bg-rose-100 text-rose-950"
    default:
      return "bg-muted text-muted-foreground"
  }
}
