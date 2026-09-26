"use client"

import { useMemo, useState } from "react"

import { routeOverrideAction } from "@/server/actions"
import { formatMoney } from "@/lib/money"
import {
  applyOverride,
  maxSpendCents,
  stagesFromLines,
  type RouteLine,
} from "@/lib/route"
import { CATALOG_OPERATOR_NOTE, modelLayerLabel } from "@/lib/live-workflows"
import { PLANNING_RATE_NOTE } from "@/lib/planning-rates"
import {
  catalogByRole,
  PATTERN_LABEL,
  ROUTE_ROLES,
  type RouteStage,
} from "@/lib/router-catalog"
import { SubmitButton } from "@/components/submit-button"

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function RouteBoard({
  jobId,
  lines,
  notes,
  skipReasons,
  mode,
}: {
  jobId: string
  lines: RouteLine[]
  notes: string[]
  skipReasons?: Partial<Record<RouteStage, string>>
  mode: "preview" | "edit" | "locked"
}) {
  const [draft, setDraft] = useState<Record<number, { modelId: string; attempts: number }>>(() =>
    Object.fromEntries(lines.map((line) => [line.position, { modelId: line.modelId, attempts: line.attempts }])),
  )

  const priced = useMemo(
    () =>
      lines.map((line) => {
        const patch = draft[line.position]
        if (!patch) return line
        return applyOverride(line, patch) ?? line
      }),
    [draft, lines],
  )
  const stages = stagesFromLines(priced, skipReasons)
  const spend = maxSpendCents(priced)
  const editable = mode === "edit"
  const dirty = priced.some((line, index) => {
    const original = lines[index]
    return (
      original &&
      (line.modelId !== original.modelId ||
        line.requestedAttempts !== original.attempts ||
        line.lineCents !== original.lineCents)
    )
  })

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{PATTERN_LABEL}</p>
        <p className="mt-1 text-sm">
          Maximum authorized spend for this route: <span className="font-medium tabular-nums">{formatMoney(spend)}</span>
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{PLANNING_RATE_NOTE}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{CATALOG_OPERATOR_NOTE}</p>
      </div>
      {notes.length > 0 ? (
        <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <ol className="space-y-3">
        {stages.map((stage) => (
          <li key={stage.stage} className="rounded-lg bg-muted/40 p-3">
            <h3 className="text-sm font-medium">
              {stage.label}
              {stage.skipped ? " · skipped" : stage.lines.length === 0 ? " · human gate" : ""}
            </h3>
            {stage.lines.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">{stage.reason}</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {stage.lines.map((line) => (
                  <li key={`${line.position}-${line.name}`}>
                    <RouteLineView
                      line={line}
                      editable={editable}
                      requestedAttempts={draft[line.position]?.attempts ?? line.attempts}
                      onModel={(modelId) =>
                        setDraft((current) => ({
                          ...current,
                          [line.position]: {
                            modelId,
                            attempts: current[line.position]?.attempts ?? line.attempts,
                          },
                        }))
                      }
                      onAttempts={(attempts) =>
                        setDraft((current) => ({
                          ...current,
                          [line.position]: {
                            modelId: current[line.position]?.modelId ?? line.modelId,
                            attempts,
                          },
                        }))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {editable ? (
        <form action={routeOverrideAction} className="space-y-2">
          <input type="hidden" name="jobId" value={jobId} />
          {priced.map((line) => (
            <span key={line.position}>
              <input type="hidden" name={`model-${line.position}`} value={draft[line.position]?.modelId ?? line.modelId} />
              <input
                type="hidden"
                name={`attempts-${line.position}`}
                value={draft[line.position]?.attempts ?? line.attempts}
              />
            </span>
          ))}
          <SubmitButton variant="outline">Save route</SubmitButton>
          <p className="text-xs leading-5 text-muted-foreground">
            {dirty
              ? `Unsaved maximum is ${formatMoney(spend)}. Saving recalculates the plan. Generation stays blocked until you approve the workflow and a maximum that covers it.`
              : "Changing a model or the attempt count updates the maximum on this page immediately. Save it before approving the budget."}
          </p>
        </form>
      ) : mode === "preview" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Build the production plan to save this route. A person still approves the workflow and the maximum spend before any generation.
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          This route is locked after approval. Request a workflow change before replacing a model or the maximum spend.
          Generation runs only inside the approved maximum.
        </p>
      )}
    </div>
  )
}

function RouteLineView({
  line,
  editable,
  requestedAttempts,
  onModel,
  onAttempts,
}: {
  line: RouteLine
  editable: boolean
  requestedAttempts: number
  onModel: (modelId: string) => void
  onAttempts: (attempts: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {line.position}. {line.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {line.role}
          {line.catalogGroup !== line.role ? ` · catalog ${line.catalogGroup}` : ""} · {line.capability}
        </p>
      </div>
      {editable ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
          <label className="text-xs text-muted-foreground">
            Model override
            <select
              className={`${fieldClass} mt-1 bg-card`}
              value={line.modelId}
              onChange={(event) => onModel(event.target.value)}
            >
              {ROUTE_ROLES.map((role) => (
                <optgroup key={role} label={role}>
                  {catalogByRole(role).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} · {modelLayerLabel(model.id)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Attempts
            <input
              className={`${fieldClass} mt-1 bg-card`}
              inputMode="numeric"
              value={requestedAttempts}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isInteger(next) && next >= 1) onAttempts(next)
                if (event.target.value === "") onAttempts(1)
              }}
            />
          </label>
        </div>
      ) : (
        <p className="text-sm">{line.modelLabel}</p>
      )}
      <p className="text-sm">{line.why}</p>
      <p className="text-xs leading-5 text-muted-foreground">Known limit: {line.failureMode}</p>
      <p className="text-xs leading-5 text-muted-foreground">
        Alternative: {line.alternativeLabel || line.alternativeModelId || "None documented"}
      </p>
      {line.substituteNote ? (
        <p className="text-xs leading-5 text-muted-foreground">{line.substituteNote}</p>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        {line.modelLabel} · {line.modelId}
        {line.liveSubmit ? " · Live submit" : " · Planning only — not sent in live mode"}
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {line.capped
          ? `Requested ${line.requestedAttempts}, billed ${line.attempts} (limit ${line.attemptLimit}). `
          : `${line.attempts} attempts. `}
        {formatMoney(line.unitCostCents)} per {line.unitLabel} = {formatMoney(line.lineCents)}
      </p>
      {line.docsUrl ? (
        <p className="text-xs">
          <a className="underline-offset-2 hover:underline" href={line.docsUrl}>
            Model page
          </a>
        </p>
      ) : null}
    </div>
  )
}
