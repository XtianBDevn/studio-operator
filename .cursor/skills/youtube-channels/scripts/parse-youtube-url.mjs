#!/usr/bin/env node
// Parse YouTube URLs into structured identifiers. No network, no dependencies.
//
// Usage:
//   node parse-youtube-url.mjs "<url>" ["<url>" ...]
//   echo "<url>" | node parse-youtube-url.mjs
//
// Emits a JSON array (one entry per input) to stdout. Each entry has:
//   { input, kind, ... }
// where kind is one of: video | shorts | playlist | channel | handle |
//   custom | user | unknown, plus the ids that could be extracted
//   (videoId, playlistId, channelId, handle, name, timestampSeconds).
// Exit code is 0 when every input resolved to a known kind, 1 otherwise.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/
const PLAYLIST_ID = /^(?:PL|UU|FL|LL|RD|OL)[A-Za-z0-9_-]+$/

function parseTimestamp(raw) {
  if (!raw) return undefined
  if (/^\d+$/.test(raw)) return Number(raw)
  // Supports 1h2m3s / 2m3s / 45s style timestamps.
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
}

function normalizeHost(host) {
  return host.replace(/^www\./, "").replace(/^m\./, "").toLowerCase()
}

export function parseYouTubeUrl(input) {
  const result = { input, kind: "unknown" }
  let url
  try {
    url = new URL(input.trim())
  } catch {
    // Bare id fallbacks so the script is useful on pasted ids too.
    const bare = input.trim()
    if (VIDEO_ID.test(bare)) return { input, kind: "video", videoId: bare }
    if (CHANNEL_ID.test(bare)) return { input, kind: "channel", channelId: bare }
    if (bare.startsWith("@")) return { input, kind: "handle", handle: bare }
    return result
  }

  const host = normalizeHost(url.hostname)
  const params = url.searchParams
  const ts = parseTimestamp(params.get("t") || params.get("start") || "")
  if (ts !== undefined) result.timestampSeconds = ts

  const segments = url.pathname.split("/").filter(Boolean)

  // youtu.be/<videoId>
  if (host === "youtu.be") {
    if (segments[0] && VIDEO_ID.test(segments[0])) {
      return { ...result, kind: "video", videoId: segments[0] }
    }
    return result
  }

  if (!host.endsWith("youtube.com")) return result

  // /watch?v=<videoId> (optionally with &list=<playlistId>)
  if (segments[0] === "watch") {
    const v = params.get("v")
    const list = params.get("list")
    if (v && VIDEO_ID.test(v)) {
      result.kind = "video"
      result.videoId = v
      if (list && PLAYLIST_ID.test(list)) result.playlistId = list
      return result
    }
    if (list && PLAYLIST_ID.test(list)) {
      return { ...result, kind: "playlist", playlistId: list }
    }
    return result
  }

  // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  if (["shorts", "embed", "live", "v"].includes(segments[0])) {
    if (segments[1] && VIDEO_ID.test(segments[1])) {
      return {
        ...result,
        kind: segments[0] === "shorts" ? "shorts" : "video",
        videoId: segments[1],
      }
    }
    return result
  }

  // /playlist?list=<playlistId>
  if (segments[0] === "playlist") {
    const list = params.get("list")
    if (list && PLAYLIST_ID.test(list)) {
      return { ...result, kind: "playlist", playlistId: list }
    }
    return result
  }

  // /channel/<UC...>
  if (segments[0] === "channel") {
    if (segments[1] && CHANNEL_ID.test(segments[1])) {
      return { ...result, kind: "channel", channelId: segments[1] }
    }
    return result
  }

  // /@handle
  if (segments[0] && segments[0].startsWith("@")) {
    return { ...result, kind: "handle", handle: segments[0] }
  }

  // Legacy /c/<name> and /user/<name>
  if (segments[0] === "c" && segments[1]) {
    return { ...result, kind: "custom", name: segments[1] }
  }
  if (segments[0] === "user" && segments[1]) {
    return { ...result, kind: "user", name: segments[1] }
  }

  return result
}

async function readStdin() {
  if (process.stdin.isTTY) return ""
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

async function main() {
  let inputs = process.argv.slice(2)
  if (inputs.length === 0) {
    const stdin = await readStdin()
    inputs = stdin.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  }
  if (inputs.length === 0) {
    console.error("Provide at least one YouTube URL as an argument or via stdin.")
    process.exit(2)
  }
  const parsed = inputs.map(parseYouTubeUrl)
  console.log(JSON.stringify(parsed, null, 2))
  process.exit(parsed.every((p) => p.kind !== "unknown") ? 0 : 1)
}

// Only run as a CLI; stay importable for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
