import { clientDeliveryNote, deliveryNoteIsClientSafe } from "@/lib/delivery-note"
import { resolveAnalysisProvider } from "@/server/config"
import { analysisModelId } from "@/server/services/analyze-brief"
import { redactSecrets } from "@/server/services/higgsfield/redact"

export type DraftedDeliveryNote = {
  body: string
  provider: "mock" | "openai"
  modelLabel: string
}

export async function draftClientDeliveryNote(input: {
  title: string
  deliverableNames: string[]
  fetchImpl?: typeof fetch
}): Promise<DraftedDeliveryNote> {
  const fallback = clientDeliveryNote({
    title: input.title,
    deliverableNames: input.deliverableNames,
  })
  if (resolveAnalysisProvider() !== "openai") {
    return {
      body: fallback,
      provider: "mock",
      modelLabel: "GPT-6 Astra",
    }
  }
  const key = process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_COMPAT_API_KEY?.trim()
  if (!key) {
    return { body: fallback, provider: "mock", modelLabel: "GPT-6 Astra" }
  }
  try {
    const response = await (input.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: analysisModelId(),
        input: [
          {
            role: "system",
            content:
              "Write a short client delivery note in plain text. Mention only the package title and the deliverable names supplied. Do not include prices, model names, endpoints, keys, or email addresses. Say the note was drafted by GPT-6 Astra and that nothing was uploaded to a marketplace.",
          },
          {
            role: "user",
            content: `Title: ${input.title}\nDeliverables:\n${input.deliverableNames.map((name) => `- ${name}`).join("\n")}`,
          },
        ],
      }),
    })
    if (!response.ok) return { body: fallback, provider: "mock", modelLabel: "GPT-6 Astra" }
    const payload = (await response.json()) as { output_text?: unknown; output?: unknown }
    const text = redactSecrets(readResponseText(payload)).trim()
    if (!text || !deliveryNoteIsClientSafe(text)) {
      return { body: fallback, provider: "mock", modelLabel: "GPT-6 Astra" }
    }
    return {
      body: text,
      provider: "openai",
      modelLabel: `GPT-6 Astra (${analysisModelId()})`,
    }
  } catch {
    return { body: fallback, provider: "mock", modelLabel: "GPT-6 Astra" }
  }
}

function readResponseText(payload: { output_text?: unknown; output?: unknown }): string {
  if (typeof payload.output_text === "string") return payload.output_text
  if (!Array.isArray(payload.output)) return ""
  const chunks: string[] = []
  for (const item of payload.output) {
    if (!item || typeof item !== "object") continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== "object") continue
      const text = (part as { text?: unknown }).text
      if (typeof text === "string") chunks.push(text)
    }
  }
  return chunks.join("\n")
}
