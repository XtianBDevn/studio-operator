"use client"

import { useState } from "react"

import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  CAPABILITIES,
  REVISION_RISKS,
  decisionLabel,
  toDraft,
  type AnalysisDraft,
  type Capability,
  type DeliverableSpec,
  type RevisionRisk,
  type StoredAnalysis,
} from "@/lib/analysis"
import { formatMoney } from "@/lib/money"
import type { Decision } from "@/lib/types"
import { reviewAnalysisAction } from "@/server/actions"

const fieldClass = "bg-card"

function lines(values: string[]): string {
  return values.join("\n")
}

function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function ReviewAnalysisForm({
  jobId,
  original,
  edited,
  locked,
}: {
  jobId: string
  original: StoredAnalysis
  edited: StoredAnalysis | null
  locked: boolean
}) {
  const starting = toDraft(edited ?? original)
  const [draft, setDraft] = useState<AnalysisDraft>(starting)

  function patch(partial: Partial<AnalysisDraft>) {
    setDraft((current) => ({ ...current, ...partial }))
  }

  function patchDeliverable(index: number, partial: Partial<DeliverableSpec>) {
    setDraft((current) => ({
      ...current,
      deliverables: current.deliverables.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...partial } : item,
      ),
    }))
  }

  const payload = JSON.stringify(draft)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <OriginalColumn document={original} hasEdit={edited != null} />
      <form action={reviewAnalysisAction} className="space-y-4">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="analysis" value={payload} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{edited ? "Edited analysis" : "Working copy"}</h2>
          <p className="text-xs text-muted-foreground">
            Saving recalculates the desk decision. Approve and reject record a human override.
          </p>
        </div>
        <label className="block text-xs text-muted-foreground">
          Job type
          <Input
            className={`mt-1 ${fieldClass}`}
            value={draft.jobType}
            disabled={locked}
            onChange={(event) => patch({ jobType: event.target.value })}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Concise summary
          <Textarea
            className={`mt-1 ${fieldClass}`}
            value={draft.conciseSummary}
            disabled={locked}
            onChange={(event) => patch({ conciseSummary: event.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-muted-foreground">
            Revision risk
            <select
              className="mt-1 h-8 w-full rounded-lg border border-input bg-card px-2 text-sm"
              value={draft.revisionRisk}
              disabled={locked}
              onChange={(event) => patch({ revisionRisk: event.target.value as RevisionRisk })}
            >
              {REVISION_RISKS.map((risk) => (
                <option key={risk} value={risk}>
                  {risk}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Confidence (0–100)
            <Input
              className={`mt-1 ${fieldClass}`}
              type="number"
              min={0}
              max={100}
              value={draft.confidence}
              disabled={locked}
              onChange={(event) => patch({ confidence: Number(event.target.value) })}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Model recommendation
            <select
              className="mt-1 h-8 w-full rounded-lg border border-input bg-card px-2 text-sm"
              value={draft.decision}
              disabled={locked}
              onChange={(event) => patch({ decision: event.target.value as Decision })}
            >
              <option value="accept">accept</option>
              <option value="human_review">human_review</option>
              <option value="reject">reject</option>
            </select>
          </label>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Deliverables</h3>
            <button
              type="button"
              className="text-xs underline"
              disabled={locked}
              onClick={() =>
                patch({
                  deliverables: [
                    ...draft.deliverables,
                    { name: "New deliverable", format: "", aspectRatio: "", duration: "", resolution: "", exactText: [] },
                  ],
                })
              }
            >
              Add deliverable
            </button>
          </div>
          {draft.deliverables.map((item, index) => (
            <div key={index} className="space-y-2 rounded-lg bg-muted/40 p-3">
              <Input
                value={item.name}
                disabled={locked}
                aria-label={`Deliverable ${index + 1} name`}
                onChange={(event) => patchDeliverable(index, { name: event.target.value })}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={item.format}
                  disabled={locked}
                  placeholder="Format"
                  aria-label={`Deliverable ${index + 1} format`}
                  onChange={(event) => patchDeliverable(index, { format: event.target.value })}
                />
                <Input
                  value={item.aspectRatio}
                  disabled={locked}
                  placeholder="Aspect ratio"
                  aria-label={`Deliverable ${index + 1} aspect ratio`}
                  onChange={(event) => patchDeliverable(index, { aspectRatio: event.target.value })}
                />
                <Input
                  value={item.duration}
                  disabled={locked}
                  placeholder="Duration"
                  aria-label={`Deliverable ${index + 1} duration`}
                  onChange={(event) => patchDeliverable(index, { duration: event.target.value })}
                />
                <Input
                  value={item.resolution}
                  disabled={locked}
                  placeholder="Resolution"
                  aria-label={`Deliverable ${index + 1} resolution`}
                  onChange={(event) => patchDeliverable(index, { resolution: event.target.value })}
                />
              </div>
              <Textarea
                value={lines(item.exactText)}
                disabled={locked}
                placeholder="Exact text, one line each"
                aria-label={`Deliverable ${index + 1} exact text`}
                onChange={(event) => patchDeliverable(index, { exactText: fromLines(event.target.value) })}
              />
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                disabled={locked}
                onClick={() =>
                  patch({ deliverables: draft.deliverables.filter((_, itemIndex) => itemIndex !== index) })
                }
              >
                Remove deliverable
              </button>
            </div>
          ))}
        </section>

        <ListField label="Supplied assets" value={draft.suppliedAssets} disabled={locked} onChange={(suppliedAssets) => patch({ suppliedAssets })} />
        <ListField label="Missing assets" value={draft.missingAssets} disabled={locked} onChange={(missingAssets) => patch({ missingAssets })} />
        <ListField label="Questions for the client" value={draft.questionsForClient} disabled={locked} onChange={(questionsForClient) => patch({ questionsForClient })} />
        <ListField label="Brand constraints" value={draft.brandConstraints} disabled={locked} onChange={(brandConstraints) => patch({ brandConstraints })} />
        <ListField label="Rights and consent flags" value={draft.rightsAndConsentFlags} disabled={locked} onChange={(rightsAndConsentFlags) => patch({ rightsAndConsentFlags })} />
        <ListField label="Technical risks" value={draft.technicalRisks} disabled={locked} onChange={(technicalRisks) => patch({ technicalRisks })} />
        <ListField label="Decision reasons" value={draft.decisionReasons} disabled={locked} onChange={(decisionReasons) => patch({ decisionReasons })} />
        <ListField label="Assumptions" value={draft.assumptions} disabled={locked} onChange={(assumptions) => patch({ assumptions })} />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Proposed workflow</h3>
            <button
              type="button"
              className="text-xs underline"
              disabled={locked}
              onClick={() => {
                const name = `Step ${draft.proposedWorkflow.length + 1}`
                patch({
                  proposedWorkflow: [...draft.proposedWorkflow, { name, capability: "image", purpose: "Catalog image capability." }],
                  estimatedAttemptsByStep: [
                    ...draft.estimatedAttemptsByStep,
                    { stepName: name, capability: "image", attempts: 1 },
                  ],
                })
              }}
            >
              Add step
            </button>
          </div>
          {draft.proposedWorkflow.map((step, index) => {
            const attempt = draft.estimatedAttemptsByStep.find((item) => item.stepName === step.name)
            return (
              <div key={`${step.name}-${index}`} className="space-y-2 rounded-lg bg-muted/40 p-3">
                <Input
                  value={step.name}
                  disabled={locked}
                  aria-label={`Step ${index + 1} name`}
                  onChange={(event) => {
                    const name = event.target.value
                    setDraft((current) => ({
                      ...current,
                      proposedWorkflow: current.proposedWorkflow.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, name } : item,
                      ),
                      estimatedAttemptsByStep: current.estimatedAttemptsByStep.map((item) =>
                        item.stepName === step.name ? { ...item, stepName: name } : item,
                      ),
                    }))
                  }}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
                    value={step.capability}
                    disabled={locked}
                    aria-label={`Step ${index + 1} capability`}
                    onChange={(event) => {
                      const capability = event.target.value as Capability
                      setDraft((current) => ({
                        ...current,
                        proposedWorkflow: current.proposedWorkflow.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, capability } : item,
                        ),
                        estimatedAttemptsByStep: current.estimatedAttemptsByStep.map((item) =>
                          item.stepName === step.name ? { ...item, capability } : item,
                        ),
                      }))
                    }}
                  >
                    {CAPABILITIES.map((capability) => (
                      <option key={capability} value={capability}>
                        {capability}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    disabled={locked}
                    aria-label={`Step ${index + 1} attempts`}
                    value={attempt?.attempts ?? 1}
                    onChange={(event) => {
                      const attempts = Number(event.target.value)
                      setDraft((current) => ({
                        ...current,
                        estimatedAttemptsByStep: current.estimatedAttemptsByStep.some((item) => item.stepName === step.name)
                          ? current.estimatedAttemptsByStep.map((item) =>
                              item.stepName === step.name ? { ...item, attempts } : item,
                            )
                          : [
                              ...current.estimatedAttemptsByStep,
                              { stepName: step.name, capability: step.capability, attempts },
                            ],
                      }))
                    }}
                  />
                </div>
                <Textarea
                  value={step.purpose}
                  disabled={locked}
                  aria-label={`Step ${index + 1} purpose`}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      proposedWorkflow: current.proposedWorkflow.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, purpose: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  disabled={locked}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      proposedWorkflow: current.proposedWorkflow.filter((_, itemIndex) => itemIndex !== index),
                      estimatedAttemptsByStep: current.estimatedAttemptsByStep.filter((item) => item.stepName !== step.name),
                    }))
                  }
                >
                  Remove step
                </button>
              </div>
            )
          })}
        </section>

        <CostNote document={edited ?? original} />
        {locked ? (
          <p className="text-sm text-muted-foreground">This analysis is locked while the job is in production or already delivered.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="intent" value="save" variant="secondary">
              Save edits
            </SubmitButton>
            <SubmitButton name="intent" value="approve">
              Approve job
            </SubmitButton>
            <SubmitButton name="intent" value="reject" variant="destructive">
              Reject job
            </SubmitButton>
          </div>
        )}
      </form>
    </div>
  )
}

function ListField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string[]
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <Textarea
        className={`mt-1 ${fieldClass}`}
        value={lines(value)}
        disabled={disabled}
        placeholder="One item per line"
        onChange={(event) => onChange(fromLines(event.target.value))}
      />
    </label>
  )
}

function CostNote({ document }: { document: StoredAnalysis }) {
  const cost = document.costing
  return (
    <p className="text-xs leading-5 text-muted-foreground">
      Desk decision on this copy: {decisionLabel(document.deskDecision)}. Recorded decision: {decisionLabel(document.decision)}.{" "}
      {cost.pricesComplete && cost.spendCents != null
        ? `Catalog spend ${formatMoney(cost.spendCents)} against production budget ${formatMoney(cost.productionBudgetCents)}.`
        : "A catalog price is missing, so spend was not invented."}
    </p>
  )
}

function OriginalColumn({ document, hasEdit }: { document: StoredAnalysis; hasEdit: boolean }) {
  return (
    <aside className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-sm font-medium">Original analysis</h2>
      <p className="text-xs text-muted-foreground">
        {hasEdit ? "Kept for comparison. Edits do not replace it." : "This is the only saved version so far."}
      </p>
      <p className="text-sm leading-6">{document.conciseSummary}</p>
      <p className="text-xs text-muted-foreground">
        Model {decisionLabel(document.decision)} · desk {decisionLabel(document.deskDecision)} · confidence {document.confidence}
      </p>
      <Readonly title="Deliverables" items={document.deliverables.map((item) => `${item.name} · ${item.format} · ${item.aspectRatio} · ${item.duration || "—"} · ${item.resolution || "—"} · ${item.exactText.join(", ") || "no exact text"}`)} />
      <Readonly title="Supplied assets" items={document.suppliedAssets} />
      <Readonly title="Missing assets" items={document.missingAssets} />
      <Readonly title="Questions" items={document.questionsForClient} />
      <Readonly title="Brand constraints" items={document.brandConstraints} />
      <Readonly title="Rights and consent" items={document.rightsAndConsentFlags} />
      <Readonly title="Technical risks" items={document.technicalRisks} />
      <Readonly title="Reasons" items={document.decisionReasons} />
      <Readonly
        title="Workflow"
        items={document.proposedWorkflow.map((step) => {
          const attempts = document.estimatedAttemptsByStep.find((item) => item.stepName === step.name)
          return `${step.name} · ${step.capability} · ${attempts?.attempts ?? "—"} attempts · ${step.purpose}`
        })}
      />
      <Readonly title="Assumptions" items={document.assumptions} />
    </aside>
  )
}

function Readonly({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">None.</p>
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
