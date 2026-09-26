---
name: youtube-channels
description: Research and audit YouTube channels and turn the findings into a Studio Operator brief or content plan. Use when the user shares a YouTube channel, handle, or video URL, or asks to audit a channel, study a competitor/reference channel, plan a content cadence, review thumbnails/titles, or scope channel work as a job.
---

# YouTube channels

Use this skill to go from a YouTube URL (channel, `@handle`, video, playlist, or Short) to a structured understanding of a channel, and to translate that into something the Studio Operator desk can act on: a brief, a service scope, or a content plan.

This skill is intake and research only. It never touches a marketplace or a real account. It produces text the operator pastes into the desk, consistent with the product guardrails in `src/lib/guardrails.ts` (no scraping a marketplace, no auto-applying, no messaging through an external platform).

## When to use

- The user pastes a YouTube channel, `@handle`, video, Short, or playlist URL.
- The user asks to audit or research a channel (theirs, a client's, or a reference/competitor).
- The user wants a content cadence, thumbnail/title review, or a channel-work scope framed as a job.

## Step 1 — Normalize the input

Always resolve the raw URL(s) to structured ids first, so later steps reference stable identifiers instead of pasted links.

```bash
node .cursor/skills/youtube-channels/scripts/parse-youtube-url.mjs "<url>" ["<url>" ...]
```

The script is dependency-free and offline. It classifies each input as `video`, `shorts`, `playlist`, `channel`, `handle`, `custom`, `user`, or `unknown`, and extracts `videoId`, `playlistId`, `channelId`, `handle`, `name`, and any `timestampSeconds`. It exits non-zero if any input is `unknown` — re-check those URLs with the user before continuing.

## Step 2 — Gather the facts

Decide how you can actually observe the channel before asserting anything:

- If the YouTube Data API or a tool like `yt-dlp` is available and the user authorized it, collect public metadata (recent titles, durations, publish dates, view counts, thumbnails). Never store credentials in the repo, logs, or output.
- If no data access is available, do not invent metrics. Ask the user to paste the channel's About text, a list of recent video titles, or a screenshot, and work from that.

State plainly which facts are observed versus assumed.

## Step 3 — Audit

Run the audit against `references/channel-audit.md`. Keep it evidence-based: positioning and niche, upload cadence, title and thumbnail patterns, hook and retention signals you can see, series/playlist structure, and clear gaps or opportunities.

## Step 4 — Turn it into desk work

Convert findings into something actionable:

- A **brief** the operator can paste into New Job and Analyze (see the intake flow in `README.md`). Write it as plain pasted-source copy: deliverables, exact on-screen text, brand constraints, references, deadline, and budget when known.
- Or a **content plan**: a prioritized backlog of video concepts, each with a working title, format, hook, and rough production route (which fits the Explore → Choose → Control → Ship → Repair → Finish → QA pattern once inside the desk).

## Guardrails

- Research and drafting only; a person still approves anything that spends or sends.
- Do not fabricate view counts, subscriber numbers, or growth claims.
- Keep any API keys out of the repository, logs, and screenshots.
