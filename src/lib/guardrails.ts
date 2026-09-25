/**
 * PRODUCT GUARDRAILS
 *
 * Studio Operator is an internal desk for a one-person studio.
 * A marketplace name (Upwork, Fiverr, Contra, and others) is only an intake
 * source for text the operator pastes. This application must not:
 * - scrape a marketplace
 * - auto-apply to jobs
 * - submit proposals
 * - accept contracts
 * - message anyone through a third-party marketplace
 * - deliver files through a marketplace
 *
 * Those actions stay unavailable until a later change adds an explicitly
 * approved integration for that exact action. Even then they require a human
 * approval. Prompt 1 does not add any of those integrations.
 *
 * Final delivery inside this app records a status on the job. It does not
 * upload work to a marketplace.
 */

export const PRODUCT_GUARDRAILS = {
  statement:
    "Intake only. Studio Operator does not scrape marketplaces, submit proposals, accept contracts, message through a marketplace, or deliver files through a marketplace.",
  forbidden: [
    "marketplace.scrape",
    "marketplace.auto_apply",
    "marketplace.submit_proposal",
    "marketplace.accept_contract",
    "marketplace.message",
    "marketplace.deliver",
  ],
  allowed: [
    "intake.paste_brief",
    "analysis.structure_requirements",
    "decision.qualify",
    "workflow.plan",
    "cost.estimate",
    "approval.human",
    "generation.run_within_limits",
    "qa.revision_notes",
    "delivery.record_internal",
    "client.draft_message",
    "client.send_first_party",
    "autonomy.configure",
    "autonomy.audit",
  ],
} as const

export type AllowedOperation = (typeof PRODUCT_GUARDRAILS.allowed)[number]
export type ForbiddenOperation = (typeof PRODUCT_GUARDRAILS.forbidden)[number]

export function assertAllowedOperation(operation: string): void {
  const forbidden: readonly string[] = PRODUCT_GUARDRAILS.forbidden
  if (forbidden.includes(operation)) {
    throw new Error(
      `Blocked by Studio Operator guardrail (${operation}). Marketplace scrape, auto-apply, proposal, contract, message, and delivery automation are not available.`,
    )
  }
}
