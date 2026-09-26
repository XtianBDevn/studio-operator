---
name: tutorial-video-analysis
description: Analyze a tutorial or how-to video and produce a structured breakdown — chapters, step-by-step procedure, and a production/clarity QA verdict. Use when the user shares a tutorial video, transcript, or captions and asks to summarize it, extract the steps, outline chapters, or assess how good the tutorial is.
---

# Tutorial video analysis

Use this skill to turn a tutorial/how-to video into a structured, reviewable
artifact: a chaptered outline, an ordered list of the actual steps, and a
quality verdict. It works from a transcript or captions; it does not inspect
pixels or claim to have watched footage it cannot access.

## When to use

- The user shares a tutorial/how-to video URL, a transcript, or a captions file.
- The user asks to summarize a tutorial, extract its steps, outline its chapters,
  or judge how clear/complete it is.

## Step 1 — Get a transcript

Prefer real text over guessing:

- If the user provides a transcript or captions (`.vtt`, `.srt`, or plain
  `[mm:ss] text`), use it directly.
- If captions can be fetched with an authorized tool (for example `yt-dlp
  --write-auto-sub --skip-download`), use that. Keep credentials out of the repo.
- If no transcript is available, say so and ask for one; do not fabricate spoken
  content or timestamps.

If the input is a URL, normalize it first with the sibling skill's parser to
pull the `videoId` and any start timestamp:

```bash
node .cursor/skills/youtube-channels/scripts/parse-youtube-url.mjs "<url>"
```

## Step 2 — Build the outline

Run the transcript through the outliner to get deterministic chapters and
candidate steps:

```bash
# Markdown (default) — good for pasting into a summary
node .cursor/skills/tutorial-video-analysis/scripts/transcript-outline.mjs <transcript-file>

# Tune the chapter window, or emit JSON for further processing
node .cursor/skills/tutorial-video-analysis/scripts/transcript-outline.mjs <transcript-file> --window 90 --json
```

The outliner is dependency-free and offline. It parses WebVTT/SRT/inline
timestamps, groups cues into fixed-time chapters, and flags "candidate steps"
by action keywords (`click`, `run`, `install`, `npm`, `git`, `create`, …). Treat
the candidate steps as a starting point, then refine into the real procedure.

## Step 3 — Extract the real procedure

From the candidate steps and the transcript, write the clean, ordered steps a
viewer would actually follow: one action per step, with the timestamp, any exact
commands or values shown, and prerequisites. Collapse filler and repetition.

## Step 4 — Assess quality

Score the tutorial against `references/analysis-rubric.md` (clarity, completeness,
correctness signals, pacing, accessibility). Finish with a single verdict —
**solid**, **usable with caveats**, or **needs rework** — and the top fixes.

This mirrors the desk's QA mindset in `README.md`: compare the artifact against
what it promised and record a checklist plus a verdict, rather than a vibe.

## Output

Produce a short report: overview, chaptered outline, numbered procedure, and the
quality verdict with concrete recommendations. Keep observed vs. inferred claims
distinct.
