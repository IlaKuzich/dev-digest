/**
 * `RepoService.refresh` — the Refresh button's server path.
 *
 * REGRESSION GUARD. Refresh used to enqueue REFRESH_JOB_KIND, which could never
 * advance the index: the clone job it enqueues alongside only does a bare
 * `fetch` on an already-cloned repo (`adapters/git/simple-git.ts` `clone()`),
 * which moves `origin/<branch>` but leaves HEAD and the worktree on the old sha.
 * `runIncremental` then saw `currentHead === lastIndexedSha` and no-op'd, so
 * merging a PR upstream never showed up in blast radius no matter how many times
 * the user hit Refresh. Only RESYNC does its own `sync()`
 * (fetch + `reset --hard origin/<branch>`) before reindexing.
 *
 * These tests assert the WIRING (which kinds get enqueued), not the indexing
 * itself — `repo-intel-resync.test.ts` covers `resyncRepo`, and
 * `indexer-pipeline.test.ts` covers the incremental slice.
 */
import { describe, it, expect } from 'vitest';
import { RepoService } from '../src/modules/repos/service.js';
import { CLONE_JOB_KIND } from '../src/modules/repos/constants.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from '../src/modules/repo-intel/constants.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { RepoRepository } from '../src/modules/repos/repository.js';
import type { Container } from '../src/platform/container.js';

interface EnqueuedCall {
  kind: string;
  payload: unknown;
}

const REPO_ROW = {
  id: 'r1',
  owner: 'acme',
  name: 'app',
  fullName: 'acme/app',
};

/** RepoService with a stubbed repository + a recording job runner (no DB, no queue). */
function makeService(opts: { row?: typeof REPO_ROW | undefined; enqueueThrowsOn?: string } = {}) {
  const calls: EnqueuedCall[] = [];
  const repo = {
    getById: async () => ('row' in opts ? opts.row : REPO_ROW),
  } as unknown as RepoRepository;

  const container = {
    jobs: {
      enqueue: async (_ws: string, kind: string, payload: unknown) => {
        if (opts.enqueueThrowsOn === kind) throw new Error('no handler registered');
        calls.push({ kind, payload });
        return { id: `job-${calls.length}` };
      },
    },
    db: {},
  } as unknown as Container;

  const service = new RepoService(container);
  (service as unknown as { repo: RepoRepository }).repo = repo;
  return { service, calls };
}

describe('RepoService.refresh', () => {
  it('enqueues RESYNC — not REFRESH — so the clone actually advances past the old sha', async () => {
    const { service, calls } = makeService();

    const result = await service.refresh('ws1', 'r1');

    expect(result).toEqual({ status: 'refreshing' });
    const kinds = calls.map((c) => c.kind);
    expect(kinds).toContain(RESYNC_JOB_KIND);
    // The bug: REFRESH's runIncremental no-ops because the bare-fetch clone
    // leaves HEAD unmoved. If this ever comes back, Refresh silently stops
    // picking up new commits and blast radius goes stale with no error.
    expect(kinds).not.toContain(REFRESH_JOB_KIND);
  });

  it('still enqueues the clone job, so a repo with no clone yet self-heals', async () => {
    const { service, calls } = makeService();

    await service.refresh('ws1', 'r1');

    // resyncRepo degrades to `no_clone` when clonePath is null; the clone job's
    // own INDEX follow-up is what covers that path, so both must be enqueued.
    const clone = calls.find((c) => c.kind === CLONE_JOB_KIND);
    expect(clone).toBeDefined();
    expect(clone!.payload).toMatchObject({ repoId: 'r1', owner: 'acme', name: 'app' });
    expect(calls.map((c) => c.kind)).not.toContain(INDEX_JOB_KIND);
  });

  it('passes the repo identity the resync job needs', async () => {
    const { service, calls } = makeService();

    await service.refresh('ws1', 'r1');

    const resync = calls.find((c) => c.kind === RESYNC_JOB_KIND);
    expect(resync!.payload).toMatchObject({ repoId: 'r1', owner: 'acme', name: 'app' });
  });

  it('still reports refreshing when the resync enqueue fails (best-effort, clone already queued)', async () => {
    const { service, calls } = makeService({ enqueueThrowsOn: RESYNC_JOB_KIND });

    const result = await service.refresh('ws1', 'r1');

    expect(result).toEqual({ status: 'refreshing' });
    expect(calls.map((c) => c.kind)).toEqual([CLONE_JOB_KIND]);
  });

  it('throws NotFoundError for a repo outside the workspace (tenancy guard)', async () => {
    const { service, calls } = makeService({ row: undefined });

    await expect(service.refresh('ws1', 'r1')).rejects.toBeInstanceOf(NotFoundError);
    expect(calls).toHaveLength(0);
  });
});
