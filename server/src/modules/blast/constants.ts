/**
 * Blast radius module constants.
 */
export const MAX_CALLERS_PER_SYMBOL = 20;

/** Reprompt-on-error retries for the optional "explain" structured call (T4). */
export const BLAST_SUMMARY_MAX_RETRIES = 2;

/** Cap on "Prior PRs touching these files" (T11) — newest-first, capped at 5. */
export const MAX_PRIOR_PRS = 5;

/**
 * Extensions the indexer can extract symbols from. Deliberately a LOCAL copy of
 * repo-intel's `SUPPORTED_EXT` (`repo-intel/constants.ts:14`) rather than an
 * import: this list exists only to decide what counts as an "analyzable" changed
 * file for the coverage line. A lockfile or a .json changed by a PR is not a
 * coverage gap, so it must not be counted as one. If repo-intel ever learns a new
 * extension, this list should follow it — but blast must not depend on another
 * module's constants to state its own honesty caveat.
 */
export const ANALYZABLE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
