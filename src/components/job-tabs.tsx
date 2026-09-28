import { GenerationTimeline } from "@/components/generation-timeline"
import { QaPanel } from "@/components/qa-panel"
import { RouteBoard } from "@/components/route-board"
import { decisionLabel } from "@/lib/analysis"
import { formatDateTime, formatWhen } from "@/lib/format"
import { formatMoney } from "@/lib/money"
import { linesFromStored, proposeRoute } from "@/lib/route"
import { CATALOG_OPERATOR_NOTE, modelLayerLabel } from "@/lib/live-workflows"
import { catalogByRole, ROUTE_ROLES } from "@/lib/router-catalog"
import { sourceLabel } from "@/lib/sources"
import type { JobDetail } from "@/lib/types"
import { deskActions } from "@/lib/workflow-policy"
import Link from "next/link"
import { getRuntimeConfig } from "@/server/config"
import {
  analyzeAction,
  commercialsAction,
  decisionAction,
  noteAction,
  qaAction,
  revisionAction,
  revisionDecisionAction,
} from "@/server/actions"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function JobTabs({ job, initialTab }: { job: JobDetail; initialTab: string }) {
  const tab = ["brief", "decision", "workflow", "costs", "outputs", "revisions", "qa"].includes(initialTab)
    ? initialTab
    : "brief"
  const deliverables = job.analysis?.effective.deliverables.map((item) => item.name) ?? []
  const live = getRuntimeConfig().mode === "live"
  const actions = deskActions(job)
  const proposal =
    job.analysis && job.steps.length === 0
      ? proposeRoute(job.analysis.effective, {
          rawBrief: job.rawBrief,
          deadlineIso: job.deadline,
          referenceCount: job.assets.length,
        })
      : null
  const savedLines = linesFromStored(job.steps)

  return (
    <Tabs key={tab} defaultValue={tab}>
      <TabsList className="h-auto w-full flex-wrap justify-start">
        <TabsTrigger value="brief">Brief</TabsTrigger>
        <TabsTrigger value="decision">Decision</TabsTrigger>
        <TabsTrigger value="workflow">Workflow</TabsTrigger>
        <TabsTrigger value="costs">Costs</TabsTrigger>
        <TabsTrigger value="outputs">Outputs</TabsTrigger>
        <TabsTrigger value="revisions">Revisions</TabsTrigger>
        <TabsTrigger value="qa">QA</TabsTrigger>
      </TabsList>

      <TabsContent value="brief" className="mt-4 space-y-4">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Pasted brief</h3>
          <p className="text-xs text-muted-foreground">
            Source {sourceLabel(job.source)} · client price {formatMoney(job.budgetCents)} · due{" "}
            {formatWhen(job.deadline)} · opened {formatDateTime(job.createdAt)}
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-sans text-sm leading-6 whitespace-pre-wrap">
            {job.rawBrief}
          </pre>
        </section>
        <section>
          <h3 className="text-sm font-medium">Reference assets</h3>
          {job.assets.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No references pasted.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {job.assets.map((asset) => (
                <li key={asset.id}>
                  <a className="underline-offset-2 hover:underline" href={asset.url}>
                    {asset.label}
                  </a>
                  <span className="text-muted-foreground"> · {asset.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="text-sm font-medium">Client notes</h3>
          <p className="mt-2 text-sm whitespace-pre-wrap text-foreground/90">
            {job.clientNotes || "No notes yet."}
          </p>
          <form action={noteAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="jobId" value={job.id} />
            <label className="min-w-[240px] flex-1 text-xs text-muted-foreground">
              Add a note
              <input name="note" className={`${fieldClass} mt-1 bg-card`} />
            </label>
            <SubmitButton variant="outline">Save note</SubmitButton>
          </form>
        </section>
      </TabsContent>

      <TabsContent value="decision" className="mt-4 space-y-4">
        {job.analysis ? (
          <>
            <AnalysisFacts job={job} />
            {["new", "needs_review", "rejected", "approved"].includes(job.status) ? (
              <div className="flex flex-wrap gap-2">
                <DecisionButton jobId={job.id} decision="accept" />
                <DecisionButton jobId={job.id} decision="human_review" />
                <DecisionButton jobId={job.id} decision="reject" />
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This brief has not been analyzed. With an OpenAI key the desk calls GPT-6 Astra. Otherwise it builds a realistic mock analysis locally. Prices still come from the catalog.
            </p>
            <form action={analyzeAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <SubmitButton>Analyze brief</SubmitButton>
            </form>
          </div>
        )}
        {job.analysis && ["new", "needs_review", "rejected"].includes(job.status) ? (
          <form action={analyzeAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton variant="outline">Re-analyze brief</SubmitButton>
          </form>
        ) : null}
      </TabsContent>

      <TabsContent value="workflow" className="mt-4 space-y-4">
        {proposal ? (
          <>
            <p className="text-sm text-muted-foreground">
              This proposal is not billed until you build the plan and a person approves the workflow and a maximum spend.
            </p>
            <RouteBoard
              jobId={job.id}
              lines={proposal.billed}
              notes={proposal.notes}
              skipReasons={proposal.skipReasons}
              mode="preview"
            />
          </>
        ) : savedLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Analyze the brief before a route can be proposed.</p>
        ) : (
          <RouteBoard
            jobId={job.id}
            lines={savedLines}
            notes={[]}
            mode={actions.canApproveWorkflow ? "edit" : "locked"}
          />
        )}
        <CapabilityCatalog />
      </TabsContent>

      <TabsContent value="costs" className="mt-4 space-y-4">
        {job.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Costs appear after a plan exists.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Step</th>
                <th className="py-1 font-medium">Attempts</th>
                <th className="py-1 text-right font-medium">Estimate</th>
              </tr>
            </thead>
            <tbody>
              {job.steps.map((step) => (
                <tr key={step.id} className="border-t">
                  <td className="py-2">{step.name}</td>
                  <td className="py-2 tabular-nums">{step.estimatedAttempts}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(step.estimatedTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {job.status === "delivered" ? (
          <p className="text-xs text-muted-foreground">Channel fee and contingency are locked after delivery.</p>
        ) : (
          <form action={commercialsAction} className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
            <input type="hidden" name="jobId" value={job.id} />
            <label className="text-xs text-muted-foreground">
              Channel fee %
              <input
                name="channelPercent"
                inputMode="decimal"
                defaultValue={(job.channelFeeBps / 100).toFixed(1)}
                className={`${fieldClass} mt-1 bg-card`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Contingency %
              <input
                name="contingencyPercent"
                inputMode="decimal"
                defaultValue={(job.contingencyBps / 100).toFixed(1)}
                className={`${fieldClass} mt-1 bg-card`}
              />
            </label>
            <div className="sm:col-span-2">
              <SubmitButton variant="outline">Update margin assumptions</SubmitButton>
            </div>
          </form>
        )}
      </TabsContent>

      <TabsContent value="outputs" className="mt-4">
        <GenerationTimeline job={job} live={live} />
      </TabsContent>

      <TabsContent value="revisions" className="mt-4 space-y-4">
        {job.revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revision notes.</p>
        ) : (
          <ul className="space-y-3">
            {job.revisions.map((revision) => (
              <li key={revision.id} className="rounded-lg bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{revision.affectedDeliverable}</p>
                  <Badge variant="outline" className="capitalize">
                    {revision.approvalStatus}
                  </Badge>
                </div>
                <p className="mt-2 text-sm">{revision.clientNote}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {revision.recommendedAction} · expected {formatMoney(revision.expectedIncrementalCents)} ·{" "}
                  {formatDateTime(revision.createdAt)}
                </p>
                {revision.approvalStatus === "pending" && job.status === "qa" ? (
                  <div className="mt-3 flex gap-2">
                    <form action={revisionDecisionAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="revisionId" value={revision.id} />
                      <input type="hidden" name="approval" value="approved" />
                      <SubmitButton>Approve revision</SubmitButton>
                    </form>
                    <form action={revisionDecisionAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="revisionId" value={revision.id} />
                      <input type="hidden" name="approval" value="rejected" />
                      <SubmitButton variant="outline">Decline</SubmitButton>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {job.status === "qa" ? (
          <form action={revisionAction} className="space-y-3 rounded-lg bg-muted/40 p-3">
            <input type="hidden" name="jobId" value={job.id} />
            <label className="block text-xs text-muted-foreground">
              Affected deliverable
              <select
                name="affectedDeliverable"
                className={`${fieldClass} mt-1 bg-card`}
                defaultValue={deliverables[0] ?? "Whole job"}
              >
                {(deliverables.length ? deliverables : ["Whole job"]).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Client note
              <Textarea name="clientNote" className="mt-1 bg-card" placeholder="What they asked to change" />
            </label>
            <SubmitButton variant="secondary">Record revision</SubmitButton>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">Revision notes open once the job is in QA.</p>
        )}
      </TabsContent>

      <TabsContent value="qa" className="mt-4 space-y-4">
        <QaPanel report={job.qaReports[0] ?? null} />
        {actions.canRevise && !job.approvals.some((gate) => gate.kind === "qa_repair" && gate.status === "required") ? (
          <form action={qaAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton>Run QA</SubmitButton>
          </form>
        ) : null}
      </TabsContent>
    </Tabs>
  )
}

function AnalysisFacts({ job }: { job: JobDetail }) {
  const analysis = job.analysis
  if (!analysis) return null
  const document = analysis.effective
  const deliverableLines = document.deliverables.map((item) => {
    const specs = [item.format, item.aspectRatio, item.duration, item.resolution].filter(Boolean)
    const text = item.exactText.length ? `Exact text: ${item.exactText.join(" / ")}` : "No exact text"
    return `${item.name}${specs.length ? ` · ${specs.join(" · ")}` : ""} · ${text}`
  })
  const cost = document.costing
  const costLine =
    cost.pricesComplete && cost.spendCents != null
      ? `Generation ${formatMoney(cost.generationCents ?? 0)} plus contingency ${formatMoney(cost.contingencyCents ?? 0)} against a production budget of ${formatMoney(cost.productionBudgetCents)}.`
      : "Price data is incomplete. The desk did not invent a generation cost."

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{decisionLabel(analysis.decision)}</Badge>
        <Badge variant="outline">Desk {decisionLabel(document.deskDecision)}</Badge>
        <span className="text-xs text-muted-foreground">
          Confidence {analysis.confidence}% · {analysis.modelLabel} · {analysis.provider}
        </span>
      </div>
      <p className="text-sm leading-6">{document.conciseSummary}</p>
      <p className="text-sm leading-6 text-muted-foreground">{costLine}</p>
      {analysis.edited ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Original desk decision was {decisionLabel(analysis.original.deskDecision)}. A person saved an edited version.
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">No human edit yet. The original analysis is the record.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Fact title="Deliverables" items={deliverableLines} />
        <Fact title="Supplied assets" items={document.suppliedAssets} />
        <Fact title="Missing assets" items={document.missingAssets} />
        <Fact title="Questions for the client" items={document.questionsForClient} />
        <Fact title="Brand constraints" items={document.brandConstraints} />
        <Fact title="Rights and consent" items={document.rightsAndConsentFlags} />
        <Fact title="Technical risks" items={document.technicalRisks} />
        <Fact title="Assumptions" items={document.assumptions} />
        <Fact title="Decision reasons" items={document.decisionReasons} />
        <Fact
          title="Proposed workflow"
          items={document.proposedWorkflow.map((step) => {
            const attempts = document.estimatedAttemptsByStep.find((item) => item.stepName === step.name)
            return `${step.name} · ${step.capability} · ${attempts?.attempts ?? "—"} attempts`
          })}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        <Link href={`/jobs/${job.id}/review`} className="underline underline-offset-2">
          Review analysis
        </Link>{" "}
        to edit any field. The original response stays stored beside the edit.
      </p>
    </>
  )
}

function Fact({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">None recorded.</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CapabilityCatalog() {
  return (
    <details className="rounded-lg bg-muted/40 p-3">
      <summary className="cursor-pointer text-sm font-medium">Capability catalog</summary>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Routable model ids, grouped from the Higgsfield image and video indexes checked for this desk. Seedream, Flux, Veo, Topaz, Speak, lip sync, and caption tools were not on those indexes. {CATALOG_OPERATOR_NOTE}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {ROUTE_ROLES.map((role) => (
          <section key={role}>
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{role}</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {catalogByRole(role).map((model) => (
                <li key={model.id}>
                  <a className="underline-offset-2 hover:underline" href={model.docsUrl}>
                    {model.label}
                  </a>
                  <span className="text-muted-foreground">
                    {" "}
                    · {model.capability} · {modelLayerLabel(model.id)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}

function DecisionButton({
  jobId,
  decision,
}: {
  jobId: string
  decision: "accept" | "human_review" | "reject"
}) {
  const label = decision === "accept" ? "Accept" : decision === "human_review" ? "Human review" : "Reject"
  return (
    <form action={decisionAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton variant={decision === "reject" ? "destructive" : "outline"}>{label}</SubmitButton>
    </form>
  )
}
