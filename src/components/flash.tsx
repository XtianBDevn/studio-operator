export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null
  const tone = error
    ? "border-rose-200 bg-rose-50 text-rose-950"
    : "border-emerald-200 bg-emerald-50 text-emerald-950"
  return (
    <p className={`rounded-lg border px-3 py-2 text-sm ${tone}`} role="status">
      {error ?? notice}
    </p>
  )
}
