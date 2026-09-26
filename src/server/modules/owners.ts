/**
 * Desk module owners. `src/server/studio.ts` keeps status transitions and calls these.
 * Do not collapse the three catalog layers. Do not add a second copy of this policy in the state machine.
 *
 * - Analysis — `src/lib/analysis.ts`, `src/server/services/analyze-brief.ts`
 * - Catalog and pricing — `src/lib/catalog.ts` (planning rates, routable ids, live workflows)
 * - Router — `src/lib/route.ts`, `src/server/services/plan-from-analysis.ts`
 * - Provider — `src/server/services/provider-run.ts`, `providers.ts`, `higgsfield/`, `live-generation.ts`
 * - QA — `src/lib/qa.ts`, `src/server/services/qa-desk.ts`
 * - Autonomy — `src/lib/autonomy-policy.ts`, `src/server/supervise.ts`, `src/server/services/autonomy.ts`
 * - Audit — `src/server/services/audit.ts` (AuditEvent rows for model decisions, drafts, approvals, generations, repairs, cost changes, and escalations)
 */

export { finalizeDeskAnalysis, produceAnalysis, catalogPrices } from "@/server/services/analyze-brief"
export { planFromAnalysis, plannedStepsFromRouteLines } from "@/server/services/plan-from-analysis"
export {
  assertLiveStepsSubmittable,
  recordFinishingRevision,
  recordQaRepairPreview,
  runProviderSteps,
  stepsAwaitingOutput,
} from "@/server/services/provider-run"
export { evaluateJobQa, persistQa, runApprovedRepair } from "@/server/services/qa-desk"
export { clearJobSupervision } from "@/server/services/autonomy"
export { addAudit, listAudit } from "@/server/services/audit"

export const DESK_MODULE_OWNERS = {
  analysis: "src/server/services/analyze-brief.ts",
  catalog: "src/lib/catalog.ts",
  router: "src/lib/route.ts",
  provider: "src/server/services/provider-run.ts",
  qa: "src/lib/qa.ts",
  autonomy: "src/server/supervise.ts",
  audit: "src/server/services/audit.ts",
} as const
