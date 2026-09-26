import { deleteJobAudit } from "@/server/services/audit"
import { prisma } from "@/server/db"

/**
 * Autonomy owner for the state machine.
 * Policy lives in `src/lib/autonomy-policy.ts`. The supervised walk is `src/server/supervise.ts`.
 * Reset clears messages, the supervise cursor, and audit rows together.
 */

export async function clearJobSupervision(jobId: string): Promise<void> {
  await prisma.$transaction([
    prisma.clientMessage.deleteMany({ where: { jobId } }),
    deleteJobAudit(jobId),
    prisma.superviseCursor.deleteMany({ where: { jobId } }),
  ])
}
