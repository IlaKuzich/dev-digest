/**
 * Smart Diff classification literals — the ONLY place patterns/thresholds
 * live (`classifier.ts` is pure logic that reads these tables). Patterns are
 * plain glob strings matched via `classifier.ts`'s hand-rolled matcher
 * (string ops only — no dynamically-built `RegExp`, per root `INSIGHTS.md`).
 *
 * Precedence: BOILERPLATE_PATTERNS checked first, then WIRING_PATTERNS.
 * Unmatched → 'core'. A pattern with no `/` matches the file's basename at
 * any depth; a pattern with `/` (incl. `**`) matches the full path.
 */

/** Lock-files and generated/build artifacts — collapsed by default. */
export const BOILERPLATE_PATTERNS: readonly string[] = [
  'pnpm-lock.yaml',
  'package-lock.json',
  '*.lock', // yarn.lock, bun.lock, Cargo.lock, Gemfile.lock, composer.lock, poetry.lock, flake.lock, deno.lock…
  'bun.lockb', // bun's legacy binary lockfile (no `.lock` suffix)
  '*.snap',
  'dist/**',
  'build/**',
  '*.min.js',
  '*.map',
  '**/__snapshots__/**',
  '*.generated.*',
];

/** Configs and barrels — wires the core into the app; shown per-file. */
export const WIRING_PATTERNS: readonly string[] = [
  '*.config.*',
  'tsconfig*.json',
  '**/index.ts',
  '**/index.tsx',
  '.env*',
  'Dockerfile',
  '*.yml',
  '*.yaml',
  '**/routes.ts',
];

/** Total changed lines (additions+deletions) above which an entangled PR is flagged too_big. */
export const SPLIT_TOO_BIG_LINES = 400;
