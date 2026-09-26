import { prisma } from "@/server/db"

/**
 * Audit owner. Desk and supervised-run decisions are rows on AuditEvent.
 * This is the only log. Do not add a second table or logger.
 *
 * Queryable kinds:
 * - model_decision — route the desk stored
 * - message_draft / message_sent — client messages (a draft is not a send)
 * - approval — a person cleared a gate inside the desk
 * - generation — approved steps that finished
 * - repair — a priced continuity repair
 * - cost_change — price, commercials, production maximum, or repair spend
 * - escalation — a refusal or a stop that needs a person
 */

export const QUERYABLE_AUDIT_KINDS = [
  "model_decision",
  "message_draft",
  "message_sent",
  "approval",
  "generation",
  "repair",
  "cost_change",
  "escalation",
] as const

export type AuditKind = (typeof QUERYABLE_AUDIT_KINDS)[number]

export type AuditRecord = {
  id: string
  kind: string
  summary: string
  detail: string
  createdAt: string
}

export async function listAudit(jobId: string): Promise<AuditRecord[]> {
  const rows = await prisma.auditEvent.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" },
  })
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function addAudit(input: {
  jobId: string
  kind: AuditKind
  summary: string
  detail?: string
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      jobId: input.jobId,
      kind: input.kind,
      summary: input.summary,
      detail: input.detail ?? "",
    },
  })
}

/** Prisma promise so a reset can delete audit rows in the same transaction. */
export function deleteJobAudit(jobId: string) {
  return prisma.auditEvent.deleteMany({ where: { jobId } })
}
