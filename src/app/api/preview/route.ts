function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function hue(text: string): number {
  let hash = 0
  for (const char of text) hash = (hash * 33 + char.charCodeAt(0)) % 360
  return 18 + (hash % 36)
}

export function GET(request: Request) {
  const url = new URL(request.url)
  const title = escapeXml((url.searchParams.get("title") ?? "Frame").slice(0, 80))
  const subtitle = escapeXml((url.searchParams.get("subtitle") ?? "Mock output").slice(0, 120))
  const kind = escapeXml((url.searchParams.get("kind") ?? "image").slice(0, 24))
  const tone = hue(title + subtitle)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${tone} 28% 28%)"/>
      <stop offset="55%" stop-color="hsl(${tone + 12} 22% 46%)"/>
      <stop offset="100%" stop-color="hsl(28 18% 18%)"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#sky)"/>
  <rect x="0" y="0" width="1280" height="72" fill="#111"/>
  <rect x="0" y="648" width="1280" height="72" fill="#111"/>
  ${Array.from({ length: 16 }, (_, index) => {
    const x = 28 + index * 80
    return `<rect x="${x}" y="22" width="36" height="28" rx="3" fill="#2a2a2a"/><rect x="${x}" y="670" width="36" height="28" rx="3" fill="#2a2a2a"/>`
  }).join("")}
  <rect x="180" y="250" width="920" height="8" fill="rgba(255,255,255,0.18)"/>
  <circle cx="240" cy="420" r="70" fill="rgba(255,244,220,0.18)"/>
  <rect x="430" y="300" width="220" height="300" fill="rgba(20,16,12,0.45)"/>
  <text x="80" y="140" fill="#f6f1e7" font-family="ui-sans-serif, system-ui, sans-serif" font-size="42">${title}</text>
  <text x="80" y="188" fill="#f6f1e7" font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" opacity="0.8">${subtitle}</text>
  <text x="80" y="600" fill="#f6f1e7" font-family="ui-monospace, monospace" font-size="18" opacity="0.75">MOCK OUTPUT · ${kind} · not a marketplace delivery</text>
</svg>`

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
