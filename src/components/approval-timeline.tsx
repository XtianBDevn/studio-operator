import { GATE_COPY, hasOpenGate } from "@/lib/workflow-policy"
import { formatDateTime } from "@/lib/format"
import type { GateKind, JobDetail } from "@/lib/types"
import { GATE_KINDS } from "@/lib/types"

const STATE_TONE: Record<string, string> = {
  approved: "bg-emerald-500",
  required: "bg-amber-500",
  rejected: "bg-rose-500",
  clear: "bg-stone-300",
  waiting: "bg-stone-300",
}

export function ApprovalTimeline({ job }: { job: JobDetail }) {
  const items = GATE_KINDS.map((kind) => {
    const records = job.approvals.filter((gate) => gate.kind === kind)
    const latest = records.at(-1) ?? null
    return { kind, latest, history: records.slice(0, -1) }
  })

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-sm font-medium">Human approval</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        After the plan and maximum budget are approved, generation stays inside that limit.
        A budget increase, a material plan change, a rights issue, or final delivery stops for a person.
      </p>
      <ol className="mt-4 space-y-4">
        {items.map(({ kind, latest, history }) => (
          <li key={kind} className="relative pl-4">
            <span
              className={`absolute top-1.5 left-0 size-2 rounded-full ${STATE_TONE[latest?.status ?? placeholderState(job, kind)]}`}
            />
            <p className="text-sm">{GATE_COPY[kind].label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {latest ? latest.summary : GATE_COPY[kind].waiting}
            </p>
            {latest?.detail ? (
              <p className="mt-1 text-xs leading-5 text-foreground/80">{latest.detail}</p>
            ) : null}
            {latest ? (
              <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                {latest.status}
                {latest.resolvedAt ? ` · ${formatDateTime(latest.resolvedAt)}` : ` · ${formatDateTime(latest.createdAt)}`}
              </p>
            ) : null}
            {history.length > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {history.length} earlier {history.length === 1 ? "decision" : "decisions"} on this gate
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

function placeholderState(job: JobDetail, kind: GateKind): string {
  if (kind === "rights" && job.analysis && job.analysis.effective.rightsAndConsentFlags.length === 0) {
    return "clear"
  }
  if (hasOpenGate(job.approvals, kind)) return "required"
  return "waiting"
}
