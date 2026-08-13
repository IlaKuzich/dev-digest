import { isAbsolute, relative, resolve } from 'node:path';

/**
 * Pure path-traversal guard, shared by every module that reads an
 * attacker-influenceable relative path out of a repo clone (currently
 * `intent` and `context`). Lifted out of `intent/helpers.ts` (T3 of
 * `docs/plans/2026-07-17-project-context.md`) so both modules use the exact
 * same containment logic instead of two copies drifting apart.
 *
 * These two functions are a LEXICAL pre-filter only — see each module's
 * `service.ts` for the full guard sequence (lstat + realpath + extension
 * re-check) required before trusting a path enough to read it. A lexical
 * check alone cannot see through a symlink: a committed symlink (or a
 * symlinked parent directory) resolves lexically inside the root while its
 * real target can be anywhere on disk (server/INSIGHTS.md:41).
 */

/**
 * Resolve `candidate` against `root` and return the absolute path only if it
 * stays within `root` — rejects `..`-escapes, absolute inputs, and anything
 * resolving outside the clone. Returns null otherwise.
 */
export function safeRepoPath(root: string, candidate: string): string | null {
  if (!candidate || isAbsolute(candidate)) return null;
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, candidate);
  const rel = relative(resolvedRoot, target);
  if (rel === '') return null; // root itself is not a file
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return target;
}

/**
 * Pure containment check for two ALREADY-RESOLVED (realpath'd) absolute
 * paths. `safeRepoPath` above is a purely lexical pre-filter and cannot see
 * through symlinks; callers `realpath` both the clone root and the candidate
 * AFTER the lexical check and confirm the real (symlink-followed) target
 * still lives inside the real root. Same `relative()` logic as
 * `safeRepoPath`, kept separate because the inputs here are real paths, not
 * lexical ones.
 */
export function isRealPathContained(realRoot: string, realTarget: string): boolean {
  const rel = relative(realRoot, realTarget);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
