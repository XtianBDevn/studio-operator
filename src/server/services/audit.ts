import { prisma } from "@/server/db"

/**
 * Audit owner. Desk events are rows on AuditEvent, not log lines.
 * Stage 04 may record more kinds. This module only owns read, write, and delete.
 */

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
  kind: string
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
