import type { Capability } from "@/lib/analysis"
import { assertAllowedOperation } from "@/lib/guardrails"
import { APPROVED_ATTEMPT_LIMITS } from "@/lib/analysis"
import {
  DEFAULT_AUTONOMY_SETTINGS,
  MESSAGE_KINDS,
  type AutonomySettings,
  type MessageChannel,
  type MessageKind,
} from "@/lib/autonomy-policy"
import type { RouteRole } from "@/lib/router-catalog"
import { ROUTE_ROLES } from "@/lib/router-catalog"
import { prisma } from "@/server/db"

const SETTINGS_ID = "studio"

export type AccountRecord = {
  id: string
  name: string
  channel: string
  memory: {
    logos: string[]
    colors: string[]
    fonts: string[]
    tone: string
    productDetails: string
    winningAssets: string[]
    rejectedStyles: string[]
    deliveryPreferences: string
    communicationPreferences: string
  } | null
  consents: Array<{ id: string; personLabel: string; kind: string; useScope: string }>
}

export type MessageRecord = {
  id: string
  kind: string
  channel: string
  disposition: string
  body: string
  createdAt: string
}

export type AuditRecord = {
  id: string
  kind: string
  summary: string
  detail: string
  createdAt: string
}

export async function getAutonomySettings(): Promise<AutonomySettings> {
  const row = await prisma.autonomySettings.findUnique({ where: { id: SETTINGS_ID } })
  if (!row) {
    await prisma.autonomySettings.create({ data: settingsRow(DEFAULT_AUTONOMY_SETTINGS) })
    return DEFAULT_AUTONOMY_SETTINGS
  }
  return settingsFrom(row)
}

export async function saveAutonomySettings(settings: AutonomySettings): Promise<void> {
  assertAllowedOperation("autonomy.configure")
  const data = settingsRow(clampSettings(settings))
  await prisma.autonomySettings.upsert({
    where: { id: SETTINGS_ID },
    create: data,
    update: data,
  })
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const rows = await prisma.clientAccount.findMany({
    orderBy: { name: "asc" },
    include: { memory: true, consents: { orderBy: { createdAt: "asc" } } },
  })
  return rows.map(mapAccount)
}

export async function getAccount(id: string): Promise<AccountRecord | null> {
  const row = await prisma.clientAccount.findUnique({
    where: { id },
    include: { memory: true, consents: { orderBy: { createdAt: "asc" } } },
  })
  return row ? mapAccount(row) : null
}

export async function listJobLinks(accountId: string): Promise<Array<{ jobId: string; templateId: string }>> {
  const rows = await prisma.clientJobLink.findMany({
    where: { accountId },
    orderBy: { jobId: "asc" },
  })
  return rows.map((row) => ({ jobId: row.jobId, templateId: row.templateId }))
}

export async function getJobLink(jobId: string): Promise<{ accountId: string; templateId: string } | null> {
  const link = await prisma.clientJobLink.findUnique({ where: { jobId } })
  return link ? { accountId: link.accountId, templateId: link.templateId } : null
}

export async function listMessages(jobId: string): Promise<MessageRecord[]> {
  const rows = await prisma.clientMessage.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" },
  })
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    channel: row.channel,
    disposition: row.disposition,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }))
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

export async function addMessage(input: {
  jobId: string
  kind: MessageKind
  channel: MessageChannel
  disposition: "draft" | "sent" | "blocked"
  body: string
}): Promise<void> {
  await prisma.clientMessage.create({ data: input })
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

export async function getBeat(jobId: string): Promise<string | null> {
  const row = await prisma.superviseCursor.findUnique({ where: { jobId } })
  return row?.beat ?? null
}

export async function setBeat(jobId: string, beat: string): Promise<void> {
  await prisma.superviseCursor.upsert({
    where: { jobId },
    create: { jobId, beat },
    update: { beat },
  })
}

export async function clearJobSupervision(jobId: string): Promise<void> {
  await prisma.$transaction([
    prisma.clientMessage.deleteMany({ where: { jobId } }),
    prisma.auditEvent.deleteMany({ where: { jobId } }),
    prisma.superviseCursor.deleteMany({ where: { jobId } }),
  ])
}

function settingsRow(settings: AutonomySettings) {
  return {
    id: SETTINGS_ID,
    maxAutoSpendPerJobCents: settings.maxAutoSpendPerJobCents,
    maxAutoSpendPerRepairCents: settings.maxAutoSpendPerRepairCents,
    maxAttemptsJson: JSON.stringify(settings.maxAttempts),
    allowedFamiliesJson: JSON.stringify(settings.allowedFamilies),
    autoSendJson: JSON.stringify(settings.autoSend),
    shareConceptsAutomatically: settings.shareConceptsAutomatically,
    finalDeliveryRequiresApproval: settings.finalDeliveryRequiresApproval,
  }
}

function settingsFrom(row: {
  maxAutoSpendPerJobCents: number
  maxAutoSpendPerRepairCents: number
  maxAttemptsJson: string
  allowedFamiliesJson: string
  autoSendJson: string
  shareConceptsAutomatically: boolean
  finalDeliveryRequiresApproval: boolean
}): AutonomySettings {
  return clampSettings({
    maxAutoSpendPerJobCents: row.maxAutoSpendPerJobCents,
    maxAutoSpendPerRepairCents: row.maxAutoSpendPerRepairCents,
    maxAttempts: parseAttempts(row.maxAttemptsJson),
    allowedFamilies: parseFamilies(row.allowedFamiliesJson),
    autoSend: parseAutoSend(row.autoSendJson),
    shareConceptsAutomatically: row.shareConceptsAutomatically,
    finalDeliveryRequiresApproval: row.finalDeliveryRequiresApproval,
  })
}

export function clampSettings(settings: AutonomySettings): AutonomySettings {
  const maxAttempts = { ...DEFAULT_AUTONOMY_SETTINGS.maxAttempts }
  for (const capability of Object.keys(APPROVED_ATTEMPT_LIMITS) as Capability[]) {
    const requested = settings.maxAttempts[capability]
    const desk = APPROVED_ATTEMPT_LIMITS[capability]
    maxAttempts[capability] = Number.isInteger(requested) ? Math.min(desk, Math.max(0, requested)) : desk
  }
  const allowedFamilies = settings.allowedFamilies.filter((role): role is RouteRole =>
    (ROUTE_ROLES as readonly string[]).includes(role),
  )
  const autoSend = settings.autoSend.filter((kind): kind is MessageKind =>
    (MESSAGE_KINDS as readonly string[]).includes(kind),
  )
  return {
    maxAutoSpendPerJobCents: Math.max(0, settings.maxAutoSpendPerJobCents),
    maxAutoSpendPerRepairCents: Math.max(0, settings.maxAutoSpendPerRepairCents),
    maxAttempts,
    allowedFamilies: allowedFamilies.length > 0 ? allowedFamilies : [...ROUTE_ROLES],
    autoSend,
    shareConceptsAutomatically: settings.shareConceptsAutomatically,
    finalDeliveryRequiresApproval: settings.finalDeliveryRequiresApproval,
  }
}

function parseAttempts(raw: string): Record<Capability, number> {
  try {
    const parsed = JSON.parse(raw) as Partial<Record<Capability, number>>
    return { ...DEFAULT_AUTONOMY_SETTINGS.maxAttempts, ...parsed }
  } catch {
    return { ...DEFAULT_AUTONOMY_SETTINGS.maxAttempts }
  }
}

function parseFamilies(raw: string): RouteRole[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...ROUTE_ROLES]
    return parsed.filter((item): item is RouteRole => (ROUTE_ROLES as readonly string[]).includes(String(item)))
  } catch {
    return [...ROUTE_ROLES]
  }
}

function parseAutoSend(raw: string): MessageKind[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return ["progress_update"]
    return parsed.filter((item): item is MessageKind => (MESSAGE_KINDS as readonly string[]).includes(String(item)))
  } catch {
    return ["progress_update"]
  }
}

function mapAccount(row: {
  id: string
  name: string
  channel: string
  memory: {
    logosJson: string
    colorsJson: string
    fontsJson: string
    tone: string
    productDetails: string
    winningAssetsJson: string
    rejectedStylesJson: string
    deliveryPreferences: string
    communicationPreferences: string
  } | null
  consents: Array<{ id: string; personLabel: string; kind: string; useScope: string }>
}): AccountRecord {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    memory: row.memory
      ? {
          logos: stringList(row.memory.logosJson),
          colors: stringList(row.memory.colorsJson),
          fonts: stringList(row.memory.fontsJson),
          tone: row.memory.tone,
          productDetails: row.memory.productDetails,
          winningAssets: stringList(row.memory.winningAssetsJson),
          rejectedStyles: stringList(row.memory.rejectedStylesJson),
          deliveryPreferences: row.memory.deliveryPreferences,
          communicationPreferences: row.memory.communicationPreferences,
        }
      : null,
    consents: row.consents.map((consent) => ({
      id: consent.id,
      personLabel: consent.personLabel,
      kind: consent.kind,
      useScope: consent.useScope,
    })),
  }
}

function stringList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}
