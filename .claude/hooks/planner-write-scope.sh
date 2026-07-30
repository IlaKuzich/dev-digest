#!/usr/bin/env bash
# PreToolUse(Write|Edit) write-scope gate for the implementation-planner subagent.
#
# implementation-planner may ONLY create/edit an Implementation Plan. Every other path
# in the repository is read-only for it. The gate is wired in the agent's OWN frontmatter
# (.claude/agents/implementation-planner.md `hooks:`), so it is active ONLY while the
# planner runs and never constrains implementer / test-writer / doc-writer. A session-wide
# permissions.deny in settings.json could NOT do this: subagents inherit deny rules
# unconditionally, so it would block every writer in the project.
#
# This replaces `permissionMode: plan`, which denied Write/Edit outright and forced the
# planner to author its plan through chunked Bash heredocs — costly in context, and prone
# to truncating the file mid-write. The hook expresses the real rule (ONE directory)
# instead of the blunt one (no writes at all). Mirrors spec-creator-write-scope.sh.
#
# Allowed (markdown only):
#   docs/plans/**.md              canonical Implementation Plans
#   docs/superpowers/plans/**.md  dated superpowers-style plans (only when asked for)
#
# Deliberately NOT allowed:
#   specs/**, <pkg>/specs/**      owned by spec-creator — the planner never authors a spec
#   docs/specs/**                 owned by doc-writer
#   docs/superpowers/specs/**     owned by doc-writer
#   **/INSIGHTS.md                owned by the engineering-insights flow
#
# Contract: exit 0 = allow; exit 2 = deny (stderr is shown to the agent).
# Fails CLOSED — this is a boundary, so anything unparseable is denied, not waved through.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"

deny() {
  echo "🚫 implementation-planner write-scope: $1" >&2
  echo "   You may only create or edit an Implementation Plan:" >&2
  echo "     docs/plans/<kebab-feature-name>.md          (canonical)" >&2
  echo "     docs/superpowers/plans/<YYYY-MM-DD>-<slug>.md  (only if explicitly asked)" >&2
  echo "   Everything else is read-only for you. Do not try to route around this:" >&2
  echo "   work that needs another file belongs to an implementer — describe it in the" >&2
  echo "   plan instead of doing it." >&2
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
# Without this, `docs/plans/../../server/src/index.ts` would satisfy a `docs/plans/*` pattern.
case "$rel" in
  *..*) deny "the path contains a '..' segment: $file_path" ;;
esac

# An absolute path that survived the prefix strip is outside the project.
case "$rel" in
  /*|?:/*) deny "the path is outside the project: $file_path" ;;
esac

# --- Allowlist --------------------------------------------------------------
# In a bash `case`, `*` also matches `/`, so these patterns permit nesting while
# still pinning the plans directory.
case "$rel" in
  docs/plans/*.md|docs/superpowers/plans/*.md)
    exit 0
    ;;
esac

# --- Targeted messages for the near-misses ---------------------------------
case "$rel" in
  specs/*|server/specs/*|client/specs/*|reviewer-core/specs/*)
    deny "specs/ and <pkg>/specs/ belong to spec-creator. You plan HOW to build stated requirements — you never author or amend a spec. An unstated requirement is a question for your clarification gate, not a spec paragraph you draft." ;;
  docs/specs/*|docs/superpowers/specs/*)
    deny "docs/specs/ and docs/superpowers/specs/ belong to doc-writer, which documents shipped work." ;;
  INSIGHTS.md|*/INSIGHTS.md)
    deny "no INSIGHTS.md is yours to write. Record the lesson in the plan's '## Planning notes' and flag it in your report so the engineering-insights flow can append it." ;;
  docs/plans/*|docs/superpowers/plans/*)
    deny "a plan must be a .md file: $file_path" ;;
esac

deny "$file_path is outside the plans directory."
