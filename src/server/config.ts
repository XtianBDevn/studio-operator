export function getRuntimeConfig() {
  const mode = process.env.STUDIO_OPERATOR_MODE === "live" ? "live" : "mock"
  return {
    mode,
    analysisModel: process.env.OPENAI_COMPAT_MODEL?.trim() || "gpt-6-astra",
    analysisLabel: "GPT-6 Astra",
  } as const
}
