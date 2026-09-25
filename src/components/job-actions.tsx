import { centsToDollarInput, formatMoney } from "@/lib/money"
import { computeProfitability } from "@/lib/profitability"
import { deskActions } from "@/lib/workflow-policy"
import type { JobDetail } from "@/lib/types"
import { estimatedGenerationCents } from "@/lib/types"
import {
  analyzeAction,
  budgetIncreaseAction,
  approveChangeAction,
  approveWorkflowAction,
  clearRightsAction,
  deliverAction,
  generateAction,
  planAction,
  rejectAction,
  workflowChangeAction,
} from "@/server/actions"
import { SubmitButton } from "@/components/submit-button"

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function JobActions({ job }: { job: JobDetail }) {
  const actions = deskActions(job)
  const estimate = estimatedGenerationCents(job.steps)
  const profit = computeProfitability({
    clientPriceCents: job.budgetCents,
    estimatedGenerationCents: estimate,
    contingencyBps: job.contingencyBps,
    channelFeeBps: job.channelFeeBps,
  })
  const suggestedMax = estimate + profit.contingencyCents

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!job.analysis && actions.canAnalyze ? (
          <form action={analyzeAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton>Analyze brief</SubmitButton>
          </form>
        ) : null}
        {actions.canPlan ? (
          <form action={planAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton variant="secondary">Build production plan</SubmitButton>
          </form>
        ) : null}
        {actions.canGenerate ? (
          <form action={generateAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton>Run approved generation</SubmitButton>
          </form>
        ) : null}
        {actions.canApproveChange ? (
          <form action={approveChangeAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton>Approve workflow change</SubmitButton>
          </form>
        ) : null}
        {actions.rightsBlocked ? (
          <form action={clearRightsAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton variant="outline">Clear rights for production</SubmitButton>
          </form>
        ) : null}
        {actions.canDeliver ? (
          <form action={deliverAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton>Approve final delivery</SubmitButton>
          </form>
        ) : null}
        {actions.canReject ? (
          <form action={rejectAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton variant="destructive">Reject job</SubmitButton>
          </form>
        ) : null}
      </div>

      {actions.canApproveWorkflow ? (
        <form action={approveWorkflowAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/60 p-3">
          <input type="hidden" name="jobId" value={job.id} />
          <label className="text-xs text-muted-foreground">
            Maximum production budget
            <input
              name="maxBudget"
              inputMode="decimal"
              defaultValue={centsToDollarInput(suggestedMax)}
              className={`${fieldClass} mt-1 w-36 bg-card`}
            />
          </label>
          <SubmitButton>Approve workflow and budget</SubmitButton>
          <p className="basis-full text-xs text-muted-foreground">
            Suggested cap is generation {formatMoney(estimate)} plus contingency {formatMoney(profit.contingencyCents)}.
            The desk cannot spend past this number without another approval.
          </p>
        </form>
      ) : null}

      {actions.budgetBlocked ? (
        <form action={budgetIncreaseAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-amber-50 p-3">
          <input type="hidden" name="jobId" value={job.id} />
          <label className="text-xs text-amber-950">
            New maximum production budget
            <input name="maxBudget" inputMode="decimal" className={`${fieldClass} mt-1 w-36 bg-card`} />
          </label>
          <SubmitButton>Approve budget increase</SubmitButton>
        </form>
      ) : null}

      {actions.canRequestChange ? (
        <form action={workflowChangeAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="jobId" value={job.id} />
          <label className="min-w-[220px] flex-1 text-xs text-muted-foreground">
            Material change
            <input
              name="reason"
              placeholder="What has to change in the plan"
              className={`${fieldClass} mt-1 bg-card`}
            />
          </label>
          <SubmitButton variant="outline">Request workflow change</SubmitButton>
        </form>
      ) : null}
    </div>
  )
}
