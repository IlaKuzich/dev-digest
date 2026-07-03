#!/usr/bin/env bash
# Single source of truth for the "current open changes" fingerprint.
# BOTH the pr-self-review skill (when it records a verdict) and the
# pr-self-review-gate hook (when it decides whether to block a push) call this
# so their notion of "the current diff" can never diverge.
#
# Scope = branch vs main (merge-base) + working tree + untracked files:
#   - `git diff <merge-base>` covers committed branch changes AND unstaged/staged
#     edits to tracked files in one shot (merge-base..working-tree).
#   - `git status --porcelain` folds in untracked/renamed/deleted state.
#
# Prints a single hex hash on stdout. Exits non-zero only if not in a git repo.
set -euo pipefail

# Resolve the base branch: prefer local `main`, fall back to `origin/main`.
if git rev-parse --verify --quiet main >/dev/null; then
  base_ref=main
elif git rev-parse --verify --quiet origin/main >/dev/null; then
  base_ref=origin/main
else
  # No main to diff against — hash the whole working state so the gate still
  # requires a fresh review rather than silently passing.
  base_ref=""
fi

merge_base=""
if [ -n "$base_ref" ]; then
  merge_base="$(git merge-base "$base_ref" HEAD 2>/dev/null || true)"
fi

{
  if [ -n "$merge_base" ]; then
    git diff "$merge_base"
  else
    git diff HEAD
  fi
  git status --porcelain
} | { shasum -a 256 2>/dev/null || sha256sum; } | awk '{print $1}'
