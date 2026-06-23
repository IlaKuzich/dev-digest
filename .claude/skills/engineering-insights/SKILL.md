---
name: engineering-insights
description: "Use when wrapping up any DevDigest coding session, or the moment mid-task you hit something non-obvious worth recording. Also invoked manually via /engineering-insights."
---

# Engineering Insights

Capture durable, module-local engineering lessons into the touched package's
`INSIGHTS.md` so the next session starts smarter. Append-only.

## When to capture (double trigger)
- **Wrap-up (every session):** at the end of any session, run the evaluation below.
- **As you go:** the moment something non-obvious happens, record it before you forget.

## Wrap-up evaluation (do this every session — no time threshold)
1. Identify the module(s) this session touched.
2. **Read that module's `INSIGHTS.md`.**
3. Ask: did this session surface anything **important or interesting** — a fix, a
   dead end, a pattern, a tool quirk — that is **not already captured** there?
4. If yes → append it (format below). If nothing new and non-obvious → write nothing.

The gate is signal, not clock (signal-gated by design — session length is not a
criterion): dedup against what's already in `INSIGHTS.md` and skip anything obvious
from reading the code. Most sessions add 0–1 entries.

## Where to write — one file per module, picked by what the finding is ABOUT
- `server/` work (incl. `src/modules/repo-intel`) → `server/INSIGHTS.md`
- `client/`        → `client/INSIGHTS.md`
- `reviewer-core/` → `reviewer-core/INSIGHTS.md`
- `e2e/`           → `e2e/INSIGHTS.md`
- Cross-cutting / project-wide (scripts, root config, conventions spanning
  packages) → root `INSIGHTS.md`

A finding belongs to exactly one module. Touched several? Split findings so each
lands in the module it's about.

## Sections — append under the right heading; never reorder or rewrite existing entries
What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes ·
Decisions · Recurring Errors & Fixes · Session Notes (dated) · Open Questions.

**What Doesn't Work** is the most-skipped and most-valuable section — record dead ends.

**Decisions** — an architectural or technical choice **with its reasoning**: lead with
the *why*, name the alternative rejected and the constraint that decided it.

## Entry format
`- YYYY-MM-DD — <statement>` — actionable "cold": a future agent reads it and
KNOWS what to do, backed by `file:line` evidence. Mistake entries add a `**Why:**` line.

❌ "Promises can be tricky" / "be careful with async" — noise, not a lesson.
✅ "Promise.all() in `src/modules/repo-intel/ingest.ts:42` times out past 30 items —
   use Promise.allSettled() in batches of 10."

## Rules
- **Append-only:** add entries; never edit or delete others'. Correct a stale
  entry with a new dated note — don't overwrite (prevents merge conflicts / lost lessons).
- If it's obvious to anyone reading the code, don't write it.
- **Keep lean:** when a single `INSIGHTS.md` approaches ~200 entries, split by domain
  rather than letting signal-to-noise fall. Prune obsolete entries only during a
  deliberate review, not mid-session.
