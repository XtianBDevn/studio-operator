export function resolveAnalysisProvider(): "mock" | "openai" {
  const forced = process.env.STUDIO_ANALYSIS_MODE?.trim().toLowerCase()
  if (forced === "mock") return "mock"
  const key = process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_COMPAT_API_KEY?.trim()
  if (forced === "openai") return "openai"
  return key ? "openai" : "mock"
}

export function getRuntimeConfig() {
  const mode = process.env.STUDIO_OPERATOR_MODE === "live" ? "live" : "mock"
  return {
    mode,
    analysisProvider: resolveAnalysisProvider(),
    analysisModel: process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_COMPAT_MODEL?.trim() || "gpt-6-astra",
    analysisLabel: "GPT-6 Astra",
  } as const
}
