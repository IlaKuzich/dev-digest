/**
 * L03/Smart Diff — GET /pulls/:id/smart-diff end-to-end against a real
 * Postgres. Mirrors the `*.it.test.ts` harness in `conventions.it.test.ts` /
 * `pulls-comments.it.test.ts`: `startPg()` + `seed(db)` + `buildApp({ config,
 * db, overrides })` + `app.inject(...)`, gated on Docker.
 *
 * Covers what the unit suites (classifier.test.ts, SmartDiffViewer.test.tsx)
 * cannot: the real route composing PullsService.getDetail (workspace-scoped)
 * with ReviewRepository.activeFindingsForPrs against actual rows, and the
 * tenancy guard end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff, PrDetail } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

/** Insert a fresh repo + PR under the given workspace; returns the PR row. */
async function seedRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 11,
      title: 'Mixed-role PR',
      author: 'marisa.koch',
      branch: 'feat/mixed',
      base: 'main',
      headSha: 'cafebabe',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return pr!;
}

/** The GitHub detail files this test drives through MockGitHubClient — one
 *  file per Smart Diff role, so the response exercises real grouping. */
const MIXED_FILES: PrDetail['files'] = [
  { path: 'src/modules/foo/service.ts', additions: 40, deletions: 5, patch: null },
  { path: 'src/modules/foo/routes.ts', additions: 6, deletions: 1, patch: null },
  { path: 'pnpm-lock.yaml', additions: 120, deletions: 80, patch: null },
];

d('smart-diff routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns a PR with mixed files bucketed into core/wiring/boilerplate, with findings overlaid', async () => {
    const gh = new MockGitHubClient({ detail: { files: MIXED_FILES } });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    // A review flagging the core file at line 12 — must surface as finding_lines.
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'one blocker',
        score: 40,
        model: 'test',
      })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/modules/foo/service.ts',
      startLine: 12,
      endLine: 12,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      rationale: 'literal key on line 12',
      confidence: 0.95,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    const core = body.groups.find((g) => g.role === 'core')!;
    expect(core.files).toHaveLength(1);
    expect(core.files[0]).toMatchObject({
      path: 'src/modules/foo/service.ts',
      pseudocode_summary: null,
      additions: 40,
      deletions: 5,
      finding_lines: [12],
    });

    const wiring = body.groups.find((g) => g.role === 'wiring')!;
    expect(wiring.files[0]).toMatchObject({ path: 'src/modules/foo/routes.ts', finding_lines: [] });

    const boilerplate = body.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files[0]).toMatchObject({ path: 'pnpm-lock.yaml', finding_lines: [] });

    // total_lines = sum(additions+deletions) across all 3 files = 45+7+200 = 252 (< 400 threshold)
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 252, proposed_splits: [] });

    await app.close();
  });

  it('overlay-before-review: a PR with no review yet still returns a valid layout with empty finding_lines', async () => {
    const gh = new MockGitHubClient({ detail: { files: MIXED_FILES } });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);
    // Deliberately no `reviews`/`findings` rows inserted for this PR.

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;

    // Layout is still fully populated (all 3 groups present, correctly bucketed) ...
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(body.groups.flatMap((g) => g.files).map((f) => f.path).sort()).toEqual(
      ['pnpm-lock.yaml', 'src/modules/foo/routes.ts', 'src/modules/foo/service.ts'].sort(),
    );
    // ... but every file's finding_lines is empty — no red dots / line badges yet.
    for (const group of body.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }

    await app.close();
  });

  it('rejects a PR belonging to another workspace as not_found (IDOR guard)', async () => {
    // A second, separate workspace + repo + PR — never resolvable via the
    // no-auth default-workspace context this app always resolves to.
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const otherPr = await seedRepoAndPr(pg.handle.db, otherWs!.id);

    const gh = new MockGitHubClient({ detail: { files: MIXED_FILES } });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });

    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });

  it('rejects a non-uuid id as a validation error', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
