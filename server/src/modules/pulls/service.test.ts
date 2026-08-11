import { describe, it, expect } from 'vitest';
import { PullsService } from './service.js';
import { MockGitHubClient } from '../../adapters/mocks.js';
import { Container, type ContainerOverrides } from '../../platform/container.js';
import type { AppConfig } from '../../platform/config.js';
import type { Db } from '../../db/client.js';
import type { PullRow, PullsRepository } from './repository.js';
import type { RepoRepository } from '../repos/repository.js';

// --- fakes -----------------------------------------------------------------
const repoRow = {
  id: 'repo-1', workspaceId: 'ws-1', owner: 'acme', name: 'app',
  fullName: 'acme/app', clonePath: null, createdBy: 'sys', lastPolledAt: null,
} as unknown as Awaited<ReturnType<RepoRepository['getById']>>;

const prRow: PullRow = {
  id: 'pr-1', workspaceId: 'ws-1', repoId: 'repo-1', number: 482,
  title: 'x', author: 'a', branch: 'b', base: 'main', headSha: 'a1b2c3d4',
  lastReviewedSha: null, additions: 0, deletions: 0, filesCount: 0,
  status: 'open', body: null, openedAt: null, updatedAt: null,
};

function fakeRepos(): Pick<RepoRepository, 'getById'> {
  return { getById: async () => repoRow };
}

function fakePulls(rows: PullRow[]) {
  const calls = { upsert: 0, updateStats: 0 };
  const repo = {
    getById: async () => rows[0],
    listByRepo: async () => rows,
    getFiles: async () => [],
    getCommits: async () => [],
    upsertFromGitHub: async () => { calls.upsert++; },
    updateStats: async (_id: string, s: { additions: number; deletions: number; filesCount: number }) => {
      calls.updateStats++; rows[0]!.additions = s.additions; rows[0]!.deletions = s.deletions; rows[0]!.filesCount = s.filesCount;
    },
    replaceFiles: async () => {},
    replaceCommits: async () => {},
    updateDetail: async () => {},
  } as unknown as PullsRepository;
  return { repo, calls };
}

const fakeReviews = {
  doneRunsForRollup: async () => [
    {
      prId: 'pr-1', runId: 'run-1', agentId: 'agent-1', ranAt: '2026-06-01T00:00:00.000Z',
      score: 77, costUsd: 0.5, tokensIn: 100, tokensOut: 50,
    },
  ],
  activeFindingsForPrs: async () => [
    { prId: 'pr-1', id: 'f1', severity: 'CRITICAL', category: 'sec', title: 't',
      file: 'a.ts', startLine: 1, endLine: 2, confidence: 0.9, rationale: 'r' },
  ],
};

function makeContainer(overrides: ContainerOverrides): Container {
  const config = { cloneDir: '/tmp', secretsPath: '/tmp/s.json', embeddingsEnabled: false } as unknown as AppConfig;
  return new Container(config, {} as Db, overrides);
}

describe('PullsService.listForRepo', () => {
  it('syncs from GitHub, backfills stats, and assembles rollups', async () => {
    const rows = [{ ...prRow }];
    const pulls = fakePulls(rows);
    const gh = new MockGitHubClient(); // default pull #482 + detail with 247/38/9
    const svc = new PullsService(makeContainer({ github: gh }), fakeRepos(), pulls.repo, fakeReviews);

    const list = await svc.listForRepo('ws-1', 'repo-1');

    expect(pulls.calls.upsert).toBe(1);
    expect(pulls.calls.updateStats).toBe(1); // zeroed stats → one backfill
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'pr-1', score: 77, latest_run_cost_usd: 0.5,
      additions: 247, deletions: 38, files_count: 9,
      findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
    });
  });

  it('degrades to persisted PRs when GitHub is unavailable', async () => {
    const rows = [{ ...prRow, additions: 5, deletions: 1, filesCount: 2 }];
    const pulls = fakePulls(rows);
    // No github override → container.github() throws (no token) → gh = null.
    const svc = new PullsService(makeContainer({}), fakeRepos(), pulls.repo, fakeReviews);

    const list = await svc.listForRepo('ws-1', 'repo-1');

    expect(pulls.calls.upsert).toBe(0);
    expect(pulls.calls.updateStats).toBe(0);
    expect(list[0]).toMatchObject({ additions: 5, files_count: 2 });
  });
});

describe('PullsService.getDetail', () => {
  it('refreshes from GitHub and returns the local PR id', async () => {
    const rows = [{ ...prRow }];
    const pulls = fakePulls(rows);
    const svc = new PullsService(makeContainer({ github: new MockGitHubClient() }), fakeRepos(), pulls.repo, fakeReviews);
    const detail = await svc.getDetail('ws-1', 'pr-1');
    expect(detail.id).toBe('pr-1');
    expect(detail.files.length).toBeGreaterThan(0);
  });

  it('falls back to persisted rows when GitHub is unavailable', async () => {
    const rows = [{ ...prRow, body: 'persisted body' }];
    const pulls = fakePulls(rows);
    const svc = new PullsService(makeContainer({}), fakeRepos(), pulls.repo, fakeReviews);
    const detail = await svc.getDetail('ws-1', 'pr-1');
    expect(detail.id).toBe('pr-1');
    expect(detail.body).toBe('persisted body');
    expect(detail.files).toEqual([]);
  });
});
