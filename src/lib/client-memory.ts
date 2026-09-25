export type LikenessKind = "likeness" | "voice"

export type StoredConsent = {
  personLabel: string
  kind: LikenessKind
  useScope: string
}

export type ConsentRequest = {
  personLabel: string
  kind: LikenessKind
  useScope: string
}

export function consentCovers(consent: StoredConsent, request: ConsentRequest): boolean {
  return (
    normalize(consent.personLabel) === normalize(request.personLabel) &&
    consent.kind === request.kind &&
    normalize(consent.useScope) === normalize(request.useScope)
  )
}

export function consentCoversAny(consents: StoredConsent[], request: ConsentRequest): boolean {
  return consents.some((consent) => consentCovers(consent, request))
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}
