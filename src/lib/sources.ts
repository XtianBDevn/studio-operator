export const SOURCES = [
  { id: "upwork", label: "Upwork", channelFeeBps: 1000 },
  { id: "fiverr", label: "Fiverr", channelFeeBps: 2000 },
  { id: "contra", label: "Contra", channelFeeBps: 0 },
  { id: "email", label: "Email", channelFeeBps: 0 },
  { id: "sales_call", label: "Sales call", channelFeeBps: 0 },
  { id: "intake", label: "Direct intake", channelFeeBps: 0 },
] as const

export type SourceId = (typeof SOURCES)[number]["id"]

export function isSourceId(value: string): value is SourceId {
  return SOURCES.some((source) => source.id === value)
}

export function sourceLabel(source: string): string {
  return SOURCES.find((item) => item.id === source)?.label ?? source
}

export function defaultChannelFeeBps(source: SourceId): number {
  return SOURCES.find((item) => item.id === source)?.channelFeeBps ?? 0
}
