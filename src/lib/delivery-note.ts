export function clientDeliveryNote(input: { title: string; deliverableNames: string[] }): string {
  const names = input.deliverableNames.map((name) => name.trim()).filter(Boolean)
  const lines = [
    input.title.trim(),
    "",
    "Drafted by GPT-6 Astra.",
    "",
    "These files are the approved delivery for this package.",
    "",
    "What is included:",
    ...(names.length > 0 ? names.map((name) => `- ${name}`) : ["- The approved stills and motion named in the brief"]),
    "",
    "Type, duration, aspect ratio, and resolution follow the approved brief.",
    "Please review the files and send notes back in the thread where this package was agreed.",
    "",
    "This note stays on the studio desk. It was not uploaded to a marketplace.",
  ]
  return lines.join("\n")
}

export function deliveryNoteIsClientSafe(note: string): boolean {
  if (/[@]|sk-|higgsfield|\/v\d|Bearer |KEY_ID|KEY_SECRET/i.test(note)) return false
  if (/\$\d|\b\d+\s*cents\b|\bUSD\b/i.test(note)) return false
  return note.includes("GPT-6 Astra") && note.includes("marketplace")
}
