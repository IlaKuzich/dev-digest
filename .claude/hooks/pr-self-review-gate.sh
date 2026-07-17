#!/usr/bin/env bash
# PreToolUse(Bash) gate for DevDigest pr-self-review.
#
# Blocks `git push` / `gh pr create` unless a FRESH pr-self-review with ZERO
# blockers exists for the current open changes. Reads the verdict artifact the
# skill wrote (.claude/.pr-self-review-state.json) and recomputes the diff
# fingerprint via pr-review-diff-hash.sh so a stale review can't slip through.
#
# Contract: exit 0 = allow; exit 2 = deny (stderr shown to the agent).
# Any command that is not a push/PR-create is allowed untouched.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
STATE_FILE="$REPO_ROOT/.claude/.pr-self-review-state.json"

# --- Read the tool call from stdin (Claude Code passes JSON) ----------------
payload="$(cat)"
command="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"

# Fallback if jq is unavailable: use the raw payload as the haystack.
[ -z "$command" ] && command="$payload"

# --- Only gate pushes / PR creation ----------------------------------------
# Match the trigger only as an actual command invocation: at the start of the
# string or right after a command separator (; && || | newline), optionally
# after leading env/whitespace. This avoids false positives like
# `echo "git push"` where the phrase sits inside a quoted argument.
trigger='(^|[;&|]|&&|\|\|)[[:space:]]*(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)([[:space:]]|$)'
if ! printf '%s' "$command" | grep -Eq "$trigger"; then
  exit 0
fi

deny() {
  echo "🚫 pr-self-review gate: $1" >&2
  echo "   Run the pr-self-review skill on the open changes, resolve blockers, then retry the push." >&2
  exit 2
}

# --- Must have a verdict artifact ------------------------------------------
[ -f "$STATE_FILE" ] || deny "no self-review has been run for this branch yet."

current_hash="$(bash "$HOOK_DIR/pr-review-diff-hash.sh" 2>/dev/null || true)"
[ -n "$current_hash" ] || deny "could not compute the current diff fingerprint (not a git repo?)."

reviewed_hash="$(jq -r '.diffHash // empty' "$STATE_FILE" 2>/dev/null || true)"
verdict="$(jq -r '.verdict // empty' "$STATE_FILE" 2>/dev/null || true)"
blockers="$(jq -r '.blockerCount // empty' "$STATE_FILE" 2>/dev/null || true)"

# --- Freshness: the review must match the current open changes -------------
[ "$reviewed_hash" = "$current_hash" ] || \
  deny "the open changes changed since the last review — the verdict is stale."

# --- Verdict: zero blockers ------------------------------------------------
if [ "$verdict" != "pass" ] || [ "${blockers:-1}" != "0" ]; then
  deny "the last self-review found ${blockers:-?} blocker(s)."
fi

exit 0
