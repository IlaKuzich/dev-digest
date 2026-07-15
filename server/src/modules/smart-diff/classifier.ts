import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole, ProposedSplit } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS, SPLIT_TOO_BIG_LINES } from './constants.js';

/**
 * L03/Smart Diff — pure, deterministic file classifier + DTO builder.
 * NO I/O, NO `this`, NO LLM call: `pseudocode_summary` always stays `null`
 * (feature spec KEY PRINCIPLE — Smart Diff only composes already-fetched
 * data). Unit-tested in `classifier.test.ts`.
 */

/** Minimal PR-file shape this module needs (subset of the `PrFile` contract). */
export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

const FIXED_ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/**
 * Match `pattern` against `path` using plain string ops (no RegExp).
 * - A pattern containing `/` (incl. `**`) matches the full path, split into
 *   `/`-separated segments; `**` matches zero-or-more path segments.
 * - A pattern without `/` matches the file's basename at any depth.
 */
function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.includes('/')) return matchPath(path.split('/'), pattern.split('/'));
  const basename = path.slice(path.lastIndexOf('/') + 1);
  return matchSegment(basename, pattern);
}

function matchPath(pathSegs: string[], patternSegs: string[]): boolean {
  if (patternSegs.length === 0) return pathSegs.length === 0;
  const [head, ...restPattern] = patternSegs;
  if (head === '**') {
    if (restPattern.length === 0) return true;
    for (let i = 0; i <= pathSegs.length; i++) {
      if (matchPath(pathSegs.slice(i), restPattern)) return true;
    }
    return false;
  }
  if (pathSegs.length === 0) return false;
  if (!matchSegment(pathSegs[0]!, head!)) return false;
  return matchPath(pathSegs.slice(1), restPattern);
}

/** Match a single path segment (no `/`) against a segment pattern that may
 *  contain `*` wildcards (e.g. `*.snap`, `tsconfig*.json`, `*.config.*`). */
function matchSegment(segment: string, pattern: string): boolean {
  if (!pattern.includes('*')) return segment === pattern;
  const parts = pattern.split('*');
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  if (!segment.startsWith(first)) return false;
  if (!segment.endsWith(last)) return false;
  let cursor = first.length;
  for (let i = 1; i < parts.length - 1; i++) {
    const middle = parts[i]!;
    if (middle === '') continue;
    const found = segment.indexOf(middle, cursor);
    if (found === -1) return false;
    cursor = found + middle.length;
  }
  return cursor <= segment.length - last.length;
}

/** Classify one file path: boilerplate → wiring → core, first match wins. */
export function classifyPath(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((p) => matchesPattern(path, p))) return 'boilerplate';
  if (WIRING_PATTERNS.some((p) => matchesPattern(path, p))) return 'wiring';
  return 'core';
}

/**
 * Compose PR files + active-finding line numbers into the `SmartDiff` DTO.
 * Deterministic: no model call, `pseudocode_summary` is always `null`.
 */
export function buildSmartDiff(
  files: SmartDiffFileInput[],
  findingsByFile: Map<string, number[]>,
): SmartDiff {
  const byRole: Record<SmartDiffRole, SmartDiffFile[]> = { core: [], wiring: [], boilerplate: [] };
  let totalLines = 0;

  for (const file of files) {
    const role = classifyPath(file.path);
    const lines = findingsByFile.get(file.path) ?? [];
    const findingLines = Array.from(new Set(lines)).sort((a, b) => a - b);
    byRole[role].push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines,
    });
    totalLines += file.additions + file.deletions;
  }

  const groups: SmartDiffGroup[] = FIXED_ROLE_ORDER.filter((role) => byRole[role].length > 0).map(
    (role) => ({ role, files: byRole[role] }),
  );

  const hasCore = byRole.core.length > 0;
  const hasNonCore = byRole.wiring.length > 0 || byRole.boilerplate.length > 0;
  const entangled = hasCore && hasNonCore;
  const tooBig = entangled && totalLines > SPLIT_TOO_BIG_LINES;

  const proposedSplits: ProposedSplit[] = [];
  if (tooBig) {
    if (hasCore) proposedSplits.push({ name: 'core', files: byRole.core.map((f) => f.path) });
    const nonCoreFiles = [...byRole.wiring, ...byRole.boilerplate].map((f) => f.path);
    if (nonCoreFiles.length > 0) {
      proposedSplits.push({ name: 'wiring & boilerplate', files: nonCoreFiles });
    }
  }

  return {
    groups,
    split_suggestion: {
      too_big: tooBig,
      total_lines: totalLines,
      proposed_splits: proposedSplits,
    },
  };
}
