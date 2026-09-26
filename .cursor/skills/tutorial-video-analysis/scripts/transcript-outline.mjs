#!/usr/bin/env node
// Turn a tutorial-video transcript into a structured outline. No network, no deps.
//
// Accepts WebVTT (.vtt), SubRip (.srt), or plain "[mm:ss] text" / "mm:ss text"
// lines. Produces a deterministic Markdown outline with:
//   - total duration and cue count
//   - fixed-window chapters (default 120s) with the text spoken in each
//   - candidate step lines detected by imperative/action keywords, timestamped
//
// Usage:
//   node transcript-outline.mjs <transcript-file> [--window <seconds>] [--json]
//   cat transcript.vtt | node transcript-outline.mjs [--window <seconds>] [--json]

import { readFileSync } from "node:fs"

const ACTION_KEYWORDS = [
  "click", "open", "close", "select", "choose", "type", "enter", "press",
  "run", "install", "create", "add", "remove", "delete", "drag", "drop",
  "copy", "paste", "save", "download", "upload", "import", "export",
  "set", "configure", "enable", "disable", "navigate", "go to", "head to",
  "首先", // tolerant of pasted mixed content; harmless if unmatched
  "first", "next", "then", "now", "finally", "let's", "lets", "we'll",
  "npm", "npx", "yarn", "pnpm", "git", "cd ", "mkdir", "curl", "docker",
]

function toSeconds(stamp) {
  // Handles HH:MM:SS(.mmm), MM:SS(.mmm), and MM:SS,mmm (SRT).
  const clean = stamp.replace(",", ".").trim()
  const parts = clean.split(":").map(Number)
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds % 60)
  const m = Math.floor((totalSeconds / 60) % 60)
  const h = Math.floor(totalSeconds / 3600)
  const pad = (n) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

const TIME_RANGE =
  /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)/
const INLINE_STAMP = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*)$/

export function parseTranscript(raw) {
  const lines = raw.split(/\r?\n/)
  const cues = []
  let pendingStart = null
  let pendingText = []

  const flush = () => {
    if (pendingStart !== null && pendingText.length) {
      const text = pendingText.join(" ").replace(/\s+/g, " ").trim()
      if (text) cues.push({ start: pendingStart, text })
    }
    pendingStart = null
    pendingText = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    if (trimmed === "WEBVTT" || /^\d+$/.test(trimmed)) continue // header / SRT index

    const range = trimmed.match(TIME_RANGE)
    if (range) {
      flush()
      pendingStart = toSeconds(range[1])
      continue
    }

    const inline = trimmed.match(INLINE_STAMP)
    if (inline && pendingStart === null) {
      flush()
      cues.push({ start: toSeconds(inline[1]), text: inline[2].trim() })
      continue
    }

    if (pendingStart !== null) {
      // Strip VTT inline tags like <00:00:01.000> and <c> markup.
      pendingText.push(trimmed.replace(/<[^>]+>/g, ""))
    }
  }
  flush()

  return cues
    .filter((c) => c.start !== null && c.text)
    .sort((a, b) => a.start - b.start)
}

export function detectSteps(cues) {
  return cues.filter((c) => {
    const lower = c.text.toLowerCase()
    return ACTION_KEYWORDS.some((k) => lower.includes(k))
  })
}

export function buildChapters(cues, windowSeconds) {
  if (!cues.length) return []
  const chapters = []
  const end = cues[cues.length - 1].start
  for (let start = 0; start <= end; start += windowSeconds) {
    const bucket = cues.filter((c) => c.start >= start && c.start < start + windowSeconds)
    if (bucket.length) {
      chapters.push({ start, cues: bucket })
    }
  }
  return chapters
}

export function buildOutline(cues, windowSeconds) {
  const chapters = buildChapters(cues, windowSeconds)
  const steps = detectSteps(cues)
  const duration = cues.length ? cues[cues.length - 1].start : 0
  return { cueCount: cues.length, duration, windowSeconds, chapters, steps }
}

function renderMarkdown(outline) {
  const out = []
  out.push("# Tutorial video outline", "")
  out.push(`- Cues parsed: ${outline.cueCount}`)
  out.push(`- Approx. duration: ${formatTime(outline.duration)}`)
  out.push(`- Chapter window: ${outline.windowSeconds}s`, "")

  out.push("## Chapters", "")
  if (!outline.chapters.length) {
    out.push("_No cues parsed._", "")
  }
  for (const ch of outline.chapters) {
    const preview = ch.cues.map((c) => c.text).join(" ").slice(0, 160)
    out.push(`### ${formatTime(ch.start)} (${ch.cues.length} cues)`)
    out.push(preview + (preview.length >= 160 ? "…" : ""), "")
  }

  out.push("## Candidate steps", "")
  if (!outline.steps.length) {
    out.push("_No action keywords detected._", "")
  }
  outline.steps.forEach((s, i) => {
    out.push(`${i + 1}. [${formatTime(s.start)}] ${s.text}`)
  })
  return out.join("\n")
}

function readInput(args) {
  const fileArg = args.find((a) => !a.startsWith("--"))
  if (fileArg) return readFileSync(fileArg, "utf8")
  if (!process.stdin.isTTY) return readFileSync(0, "utf8")
  return null
}

function main() {
  const args = process.argv.slice(2)
  const windowIdx = args.indexOf("--window")
  const windowSeconds = windowIdx !== -1 ? Number(args[windowIdx + 1]) : 120
  const asJson = args.includes("--json")

  const raw = readInput(args)
  if (raw === null) {
    console.error("Provide a transcript file path or pipe a transcript via stdin.")
    process.exit(2)
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    console.error("--window must be a positive number of seconds.")
    process.exit(2)
  }

  const cues = parseTranscript(raw)
  const outline = buildOutline(cues, windowSeconds)
  console.log(asJson ? JSON.stringify(outline, null, 2) : renderMarkdown(outline))
  process.exit(cues.length ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
