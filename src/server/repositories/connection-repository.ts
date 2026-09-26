import type { PrismaClient } from "@prisma/client"

export type ConnectionTestView = {
  id: string
  endpointId: string
  providerRequestId: string | null
  statusUrl: string | null
  cancelUrl: string | null
  correlationId: string | null
  providerStatus: string | null
  appStatus: string
  estimatedCredits: string | null
  estimatedUsd: string | null
  costEstimateCents: number | null
  actualCostCents: number | null
  actualCredits: string | null
  actualUsd: string | null
  costSource: string | null
  outputUrl: string | null
  settingsJson: string | null
  error: string | null
  createdAt: string
}

export class ConnectionTestRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(): Promise<ConnectionTestView[]> {
    const rows = await this.db.connectionTest.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
    return rows.map(toView)
  }

  async create(input: {
    endpointId: string
    confirmed: boolean
    appStatus: string
    estimatedCredits?: string | null
    estimatedUsd?: string | null
    costEstimateCents?: number | null
    settingsJson?: string | null
  }): Promise<string> {
    const row = await this.db.connectionTest.create({
      data: {
        endpointId: input.endpointId,
        confirmed: input.confirmed,
        appStatus: input.appStatus,
        estimatedCredits: input.estimatedCredits ?? null,
        estimatedUsd: input.estimatedUsd ?? null,
        costEstimateCents: input.costEstimateCents ?? null,
        settingsJson: input.settingsJson ?? null,
      },
    })
    return row.id
  }

  async update(
    id: string,
    patch: Partial<Omit<ConnectionTestView, "id" | "createdAt" | "endpointId">> & { localPath?: string | null },
  ): Promise<void> {
    await this.db.connectionTest.update({
      where: { id },
      data: {
        providerRequestId: patch.providerRequestId,
        statusUrl: patch.statusUrl,
        cancelUrl: patch.cancelUrl,
        correlationId: patch.correlationId,
        providerStatus: patch.providerStatus,
        appStatus: patch.appStatus,
        estimatedCredits: patch.estimatedCredits,
        estimatedUsd: patch.estimatedUsd,
        costEstimateCents: patch.costEstimateCents,
        actualCostCents: patch.actualCostCents,
        actualCredits: patch.actualCredits,
        actualUsd: patch.actualUsd,
        costSource: patch.costSource,
        outputUrl: patch.outputUrl,
        localPath: patch.localPath,
        settingsJson: patch.settingsJson,
        error: patch.error,
      },
    })
  }

  async localPath(id: string): Promise<string | null> {
    const row = await this.db.connectionTest.findUnique({
      where: { id },
      select: { localPath: true },
    })
    return row?.localPath ?? null
  }
}

function toView(row: {
  id: string
  endpointId: string
  providerRequestId: string | null
  statusUrl: string | null
  cancelUrl: string | null
  correlationId: string | null
  providerStatus: string | null
  appStatus: string
  estimatedCredits: string | null
  estimatedUsd: string | null
  costEstimateCents: number | null
  actualCostCents: number | null
  actualCredits: string | null
  actualUsd: string | null
  costSource: string | null
  outputUrl: string | null
  settingsJson: string | null
  error: string | null
  createdAt: Date
}): ConnectionTestView {
  return {
    id: row.id,
    endpointId: row.endpointId,
    providerRequestId: row.providerRequestId,
    statusUrl: row.statusUrl,
    cancelUrl: row.cancelUrl,
    correlationId: row.correlationId,
    providerStatus: row.providerStatus,
    appStatus: row.appStatus,
    estimatedCredits: row.estimatedCredits,
    estimatedUsd: row.estimatedUsd,
    costEstimateCents: row.costEstimateCents,
    actualCostCents: row.actualCostCents,
    actualCredits: row.actualCredits,
    actualUsd: row.actualUsd,
    costSource: row.costSource,
    outputUrl: row.outputUrl,
    settingsJson: row.settingsJson,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  }
}
