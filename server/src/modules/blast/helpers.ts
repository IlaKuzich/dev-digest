import type { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, IndexState } from '../repo-intel/types.js';
import type { BlastCoverage, BlastIndexState } from './service.js';
import { ANALYZABLE_EXT, MAX_CALLERS_PER_SYMBOL } from './constants.js';

/**
 * Pure transforms for the blast radius module — no I/O, no container. The
 * facade (`container.repoIntel.getBlastRadius`) already does the graph
 * traversal (finds symbols declared in changed files, finds callers, excludes
 * the declaration's own file — `repo-intel/service.ts:273`). This module only:
 *   - groups `callers` by `viaSymbol` into `DownstreamImpact[]`;
 *   - sorts each group's callers by `rank` descending;
 *   - caps at `MAX_CALLERS_PER_SYMBOL` callers per symbol;
 *   - attributes endpoints/crons per symbol via `factsByFile`, falling back to
 *     the flat `impactedEndpoints` union when `factsByFile` is absent (the
 *     degraded path — no cron data exists there, so `crons_affected` stays
 *     `[]` and must never be presented as "0 crons").
 * No dynamically-built RegExp anywhere — plain string/Set ops only.
 */

/**
 * `index_state` must describe the data we actually RETURN, not an index row
 * fetched independently of it. The two sources can legitimately disagree:
 * `getBlastRadius` skips the persistent path whenever `repoIntelEnabled` is
 * false (`repo-intel/service.ts:223`) and returns a degraded result with no
 * cron data, while `getIndexState` does not gate on that flag
 * (`repo-intel/service.ts:189-205`) and still reports the persisted
 * `status: 'full'`. Reporting that row verbatim would present `crons_affected: []`
 * as fact — the exact fabrication this feature exists to avoid. So the result's
 * own `degraded`/`reason` are folded in and always win.
 */
/** True for files the indexer could have extracted symbols from. Plain string
    ops — no dynamically-built RegExp (root INSIGHTS.md:29). */
function isAnalyzable(path: string): boolean {
  return ANALYZABLE_EXT.some((ext) => path.endsWith(ext));
}

/**
 * How much of this PR the blast map can actually speak about.
 *
 * The index is a snapshot of the repo's DEFAULT BRANCH, so a file created by
 * the PR under review does not exist in it and yields no symbols. That is not a
 * bug and not a degraded index — new code genuinely has no downstream callers
 * yet. But without this number the UI reports a huge PR as "3 symbols, 0
 * endpoints" on a `status: full` index, which reads as "nothing is affected"
 * when the truth is "most of this PR is new and outside the analysis".
 *
 * Measured on `IlaKuzich/next_js_harness_testing#3`: 22 changed files, +1592
 * lines, but only 2 pre-existing files → 3 changed symbols. Every layer was
 * telling the truth; the sum of them still misled.
 *
 * Non-code files (lockfiles, package.json, .md) are excluded from the
 * denominator — they are not coverage gaps, so counting them would manufacture
 * a caveat rather than report one.
 */
export function toCoverage(
  changedFiles: string[],
  changedSymbols: { file: string }[],
): BlastCoverage {
  const codeFiles = changedFiles.filter(isAnalyzable);
  const withSymbols = new Set(changedSymbols.map((s) => s.file));
  const analyzed = codeFiles.filter((f) => withSymbols.has(f));
  return {
    changed_code_files: codeFiles.length,
    analyzed_files: analyzed.length,
    unanalyzed_files: codeFiles.filter((f) => !withSymbols.has(f)),
  };
}

export function toIndexStateDto(
  s: IndexState,
  resDegraded?: boolean,
  resReason?: string,
): BlastIndexState {
  const degraded = s.degraded === true || resDegraded === true;
  // A row claiming full/partial coverage cannot stand over degraded data.
  const status = resDegraded === true && (s.status === 'full' || s.status === 'partial')
    ? 'degraded'
    : s.status;
  return {
    status,
    filesIndexed: s.filesIndexed,
    filesSkipped: s.filesSkipped,
    degraded: degraded || undefined,
    degradedReason: s.degradedReason ?? resReason,
  };
}

export function toBlastRadius(res: BlastResult): BlastRadius {
  const changed_symbols = res.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Group callers by viaSymbol, preserving first-seen order.
  const groups = new Map<string, BlastCallerRow[]>();
  for (const caller of res.callers) {
    const group = groups.get(caller.viaSymbol);
    if (group) group.push(caller);
    else groups.set(caller.viaSymbol, [caller]);
  }

  const downstream: DownstreamImpact[] = [];
  for (const [symbol, group] of groups) {
    // (a) caller files computed from the FULL group, before capping.
    const callerFiles = new Set(group.map((c) => c.file));

    // (b)/(c) endpoints/crons attributed per symbol from factsByFile over
    // callerFiles, falling back to the flat impactedEndpoints union (and []
    // crons) when factsByFile is absent.
    let endpoints_affected: string[];
    let crons_affected: string[];
    if (res.factsByFile) {
      const endpointSet = new Set<string>();
      const cronSet = new Set<string>();
      for (const file of callerFiles) {
        const facts = res.factsByFile[file];
        if (!facts) continue;
        for (const e of facts.endpoints) endpointSet.add(e);
        for (const c of facts.crons) cronSet.add(c);
      }
      endpoints_affected = [...endpointSet].sort();
      crons_affected = [...cronSet].sort();
    } else {
      endpoints_affected = [...res.impactedEndpoints];
      crons_affected = [];
    }

    // (d) sort the FULL group by rank descending, stable tie-break file asc
    // then line asc, for a deterministic output.
    const sorted = [...group].sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      if (a.file !== b.file) return a.file < b.file ? -1 : 1;
      return a.line - b.line;
    });

    // (e) cap AFTER sorting/attribution.
    const callers = sorted.slice(0, MAX_CALLERS_PER_SYMBOL).map((c) => ({
      name: c.symbol,
      file: c.file,
      line: c.line,
    }));

    downstream.push({ symbol, callers, endpoints_affected, crons_affected });
  }

  // Sort downstream by callers.length desc, then symbol asc. A changed symbol
  // with zero callers never gets a group here — it appears only in
  // changed_symbols (this is what the client's `noDownstream` message renders).
  downstream.sort((a, b) => {
    if (b.callers.length !== a.callers.length) return b.callers.length - a.callers.length;
    if (a.symbol === b.symbol) return 0;
    return a.symbol < b.symbol ? -1 : 1;
  });

  return { changed_symbols, downstream, summary: '' };
}
