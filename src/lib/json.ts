export function parseStringList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

export function toIso(value: Date | null | undefined): string | null {
  if (!value) return null
  return value.toISOString()
}
