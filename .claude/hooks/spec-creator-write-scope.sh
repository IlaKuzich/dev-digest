#!/usr/bin/env bash
# PreToolUse(Write|Edit) write-scope gate for the spec-creator subagent.
#
# spec-creator may ONLY create/edit specification markdown. Every other path in the
# repository is read-only for it. The gate is wired in the agent's OWN frontmatter
# (.claude/agents/spec-creator.md `hooks:`), so it is active ONLY while spec-creator
# runs and never constrains implementer / test-writer / doc-writer. A session-wide
# permissions.deny in settings.json could NOT do this: subagents inherit deny rules
# unconditionally, so it would block every writer in the project.
#
# Allowed (markdown only):
#   specs/**.md                 cross-module specs (see specs/README.md)
#   server/specs/**.md          single-package specs
#   client/specs/**.md
#   reviewer-core/specs/**.md
#
# Deliberately NOT allowed:
#   e2e/specs/**                holds *.flow.json e2e flows — not prose specs
#   docs/specs/**               owned by doc-writer
#   docs/superpowers/specs/**   owned by doc-writer
#
# Contract: exit 0 = allow; exit 2 = deny (stderr is shown to the agent).
# Fails CLOSED — this is a boundary, so anything unparseable is denied, not waved through.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"

deny() {
  echo "🚫 spec-creator write-scope: $1" >&2
  echo "   You may only create or edit specification markdown:" >&2
  echo "     specs/<slug>.md                (cross-module feature)" >&2
  echo "     server/specs/<slug>.md         (single-package feature)" >&2
  echo "     client/specs/<slug>.md" >&2
  echo "     reviewer-core/specs/<slug>.md" >&2
  echo "   Everything else is read-only for you. Do not try to route around this:" >&2
  echo "   if the work needs a non-spec file, say so in your report instead." >&2
  exit 2
}

# --- Read the tool call from stdin (Claude Code passes JSON) ----------------
payload="$(cat)"

command -v jq >/dev/null 2>&1 || deny "jq is unavailable, so the target path cannot be verified."

file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -n "$file_path" ] || deny "the tool call carries no file_path to check."

# --- Normalise the path -----------------------------------------------------
# Windows hands us backslashes and a drive letter whose case varies between
# callers, so compare on forward slashes and match the repo prefix case-insensitively.
# Bash parameter expansion is used deliberately instead of sed: this file is read by
# bash directly, but a sed regex here would have to survive extra escaping layers
# (see root INSIGHTS.md:33 — nested escaping silently eats backslashes).
path="${file_path//\\//}"
root="${REPO_ROOT//\\//}"
root="${root%/}"

shopt -s nocasematch
if [[ "$path" == "$root"/* ]]; then
  rel="${path:${#root}+1}"
else
  rel="$path"
fi
shopt -u nocasematch

# --- Reject traversal before matching the allowlist -------------------------
# Without this, `specs/../server/src/index.ts` would satisfy a `specs/*` pattern.
case "$rel" in
  *..*) deny "the path contains a '..' segment: $file_path" ;;
esac

# An absolute path that survived the prefix strip is outside the project.
case "$rel" in
  /*|?:/*) deny "the path is outside the project: $file_path" ;;
esac

# --- Allowlist --------------------------------------------------------------
# In a bash `case`, `*` also matches `/`, so these patterns permit nesting
# (e.g. specs/onboarding/reading-path.md) while still pinning the root directory.
case "$rel" in
  specs/*.md|server/specs/*.md|client/specs/*.md|reviewer-core/specs/*.md)
    exit 0
    ;;
esac

# --- Targeted messages for the near-misses ---------------------------------
case "$rel" in
  e2e/specs/*)
    deny "e2e/specs/ holds *.flow.json e2e flows, not prose specs. A spec that touches e2e is cross-module — write specs/<slug>.md instead." ;;
  docs/specs/*|docs/superpowers/specs/*)
    deny "docs/specs/ and docs/superpowers/specs/ belong to doc-writer, which documents shipped work. An SDD spec goes to specs/ or <pkg>/specs/." ;;
  specs/*|*/specs/*)
    deny "a spec must be a .md file: $file_path" ;;
esac

deny "$file_path is outside every specs directory."
