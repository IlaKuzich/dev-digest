import { describe, it, expect } from 'vitest';
import { SEV_ORDER, TOP_FINDINGS_LIMIT } from './constants.js';
import {
  snippetOf,
  latestByPr,
  buildFindingsBuckets,
  toPrMetaDto,
  prDetailFromGitHub,
  prDetailFromPersisted,
  type FindingRollupRow,
  type PrListRollups,
} from './helpers.js';
import type { PullRow } from '../../db/rows.js';
import type { PrDetail } from '@devdigest/shared';
import type { PrRunAgg } from '../reviews/rollup.js';

const basePull: PullRow = {
  id: 'pr-1',
  workspaceId: 'ws-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Add caching',
  author: 'ada',
  branch: 'feat/cache',
  base: 'main',
  headSha: 'sha-head',
  lastReviewedSha: 'sha-head',
  additions: 10,
  deletions: 2,
  filesCount: 3,
  status: 'open',
  body: 'body text',
  openedAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

const emptyRollups: PrListRollups = { metrics: new Map(), findings: new Map() };

describe('snippetOf', () => {
  it('returns short rationales unchanged', () => {
    expect(snippetOf('short reason')).toBe('short reason');
  });
  it('truncates long rationales at a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(40).trim(); // 199 chars
    const out = snippetOf(long);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s\S+…$/); // no partial trailing word before the ellipsis
  });
});

describe('latestByPr', () => {
  it('keeps the first row seen per prId (input is newest-first)', () => {
    const map = latestByPr([
      { prId: 'a', score: 90 },
      { prId: 'a', score: 10 },
      { prId: 'b', score: 50 },
    ]);
    expect(map.get('a')).toEqual({ prId: 'a', score: 90 });
    expect(map.get('b')).toEqual({ prId: 'b', score: 50 });
    expect(map.size).toBe(2);
  });
});

describe('buildFindingsBuckets', () => {
  const mk = (over: Partial<FindingRollupRow>): FindingRollupRow => ({
    prId: 'pr-1', id: 'f', severity: 'WARNING', category: 'bug', title: 't',
    file: 'a.ts', startLine: 1, endLine: 2, confidence: 0.5, rationale: 'why', ...over,
  });

  it('counts by severity and maps rows to TopFinding DTO fields', () => {
    const map = buildFindingsBuckets([
      mk({ id: '1', severity: 'CRITICAL', confidence: 0.9 }),
      mk({ id: '2', severity: 'WARNING', confidence: 0.8 }),
      mk({ id: '3', severity: 'SUGGESTION', confidence: 0.7 }),
    ]);
    const b = map.get('pr-1')!;
    expect(b.bySeverity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
    expect(b.top[0]).toMatchObject({ id: '1', start_line: 1, end_line: 2, rationale_snippet: 'why' });
  });

  it('sorts by severity then confidence desc and trims to TOP_FINDINGS_LIMIT', () => {
    const rows = Array.from({ length: TOP_FINDINGS_LIMIT + 2 }, (_, i) =>
      mk({ id: String(i), severity: 'SUGGESTION', confidence: i / 100 }),
    );
    rows.push(mk({ id: 'crit', severity: 'CRITICAL', confidence: 0.01 }));
    const b = buildFindingsBuckets(rows).get('pr-1')!;
    expect(b.top).toHaveLength(TOP_FINDINGS_LIMIT);
    expect(b.top[0]!.id).toBe('crit'); // CRITICAL wins regardless of confidence
    expect(SEV_ORDER.CRITICAL).toBeLessThan(SEV_ORDER.WARNING);
  });
});

describe('toPrMetaDto', () => {
  it('maps a row to PrMeta with the rollup MIN score / SUM cost and derived status', () => {
    const agg: PrRunAgg = { runIds: ['r1'], score: 88, costUsd: 0.42, tokensIn: 100, tokensOut: 50 };
    const rollups: PrListRollups = {
      metrics: new Map([['pr-1', agg]]),
      findings: new Map([['pr-1', { bySeverity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }, top: [] }]]),
    };
    const dto = toPrMetaDto(basePull, rollups, Date.parse('2026-06-02T00:00:00Z'));
    expect(dto).toMatchObject({
      id: 'pr-1', number: 7, head_sha: 'sha-head',
      score: 88, latest_run_cost_usd: 0.42,
      findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
      status: 'reviewed',
    });
  });
  it('nulls score/cost/findings when absent', () => {
    const dto = toPrMetaDto(basePull, emptyRollups, Date.now());
    expect(dto.score).toBeNull();
    expect(dto.latest_run_cost_usd).toBeNull();
    expect(dto.findings_by_severity).toBeNull();
    expect(dto.top_findings).toBeNull();
  });
});

describe('prDetail mappers', () => {
  it('prDetailFromGitHub overrides the id with the local PR id', () => {
    const detail = { number: 7, files: [], commits: [] } as unknown as PrDetail;
    expect(prDetailFromGitHub(basePull, detail).id).toBe('pr-1');
  });
  it('prDetailFromPersisted builds the DTO from persisted rows', () => {
    const dto = prDetailFromPersisted(
      basePull,
      [{ path: 'a.ts', additions: 1, deletions: 0, patch: null }],
      [{ sha: 's', message: 'm', author: 'ada', committedAt: null }],
    );
    expect(dto.files).toHaveLength(1);
    expect(dto.commits[0]).toEqual({ sha: 's', message: 'm', author: 'ada', committed_at: null });
    expect(dto.body).toBe('body text');
  });
});
