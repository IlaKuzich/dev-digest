/**
 * T7 — depgraph adapter regression test.
 *
 * Hermetic (no Docker, no DB): exercises `DepCruiseGraph.buildEdges` over a
 * real tmpdir fixture with dependency-cruiser actually cruising it (this is
 * the adapter's whole job — mocking cruise itself would defeat the point).
 *
 * Covers the three defects diagnosed in the plan (`docs/plans/2026-07-16-blast-radius.md`,
 * T7):
 *   (a) POSIX path separators in the output on every platform.
 *   (b) tsconfig `paths` alias imports (`~/*` → `./src/*`, deliberately with NO
 *       `baseUrl` — matching the real-world tsconfig this bug was found on)
 *       resolve to real edges, not just relative imports.
 *   (c) a genuine cruise failure (unrunnable root) THROWS instead of silently
 *       returning `[]` — this is what lets the pipeline distinguish "the graph
 *       failed" from "this repo genuinely has no local edges".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

/**
 * Writes `rel` (a POSIX-style relative path, e.g. `src/util.ts`) under `root`.
 * Uses `path.join` + `path.dirname` (both separator-aware) rather than a
 * manual `lastIndexOf('/')` split — on win32, `path.join` normalises its
 * result to backslashes, so a `/`-based split on the JOINED path silently
 * finds nothing and skips the `mkdir`, producing an ENOENT on the write. See
 * `server/test/indexer-pipeline.test.ts`'s `writeFileAt`, which has this exact
 * bug (server `INSIGHTS.md:11` documents its symptom as a Windows tmp-dir
 * flake — it's actually this).
 */
async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

describe('DepCruiseGraph.buildEdges', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'depgraph-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it(
    'resolves both a relative import and a tsconfig-alias import (no baseUrl) to real edges with POSIX separators',
    async () => {
      // Deliberately NO baseUrl — mirrors the real-world tsconfig this bug was
      // found on (plan T7 diagnosis note).
      await writeFileAt(
        root,
        'tsconfig.json',
        JSON.stringify({ compilerOptions: { paths: { '~/*': ['./src/*'] } } }),
      );
      await writeFileAt(root, 'src/util.ts', 'export function helper(): number { return 1; }\n');
      await writeFileAt(
        root,
        'src/relImporter.ts',
        "import { helper } from './util';\nexport function callRel(): number { return helper(); }\n",
      );
      await writeFileAt(
        root,
        'src/aliasImporter.ts',
        "import { helper } from '~/util';\nexport function callAlias(): number { return helper(); }\n",
      );

      const files = ['src/util.ts', 'src/relImporter.ts', 'src/aliasImporter.ts'];
      const graph = new DepCruiseGraph();
      const edges = await graph.buildEdges(root, files);

      expect(edges).toContainEqual({ from: 'src/relImporter.ts', to: 'src/util.ts' });
      expect(edges).toContainEqual({ from: 'src/aliasImporter.ts', to: 'src/util.ts' });

      // POSIX separators everywhere, on every platform (including Windows).
      for (const edge of edges) {
        expect(edge.from).not.toContain('\\');
        expect(edge.to).not.toContain('\\');
      }
    },
    20_000,
  );

  it('returns [] immediately for an empty file list (no child process spawned)', async () => {
    const graph = new DepCruiseGraph();
    const edges = await graph.buildEdges(root, []);
    expect(edges).toEqual([]);
  });

  it(
    'throws instead of silently returning [] when the cruise cannot run at all',
    async () => {
      const graph = new DepCruiseGraph();
      const missingRoot = join(root, 'does-not-exist');
      await expect(graph.buildEdges(missingRoot, ['src/a.ts'])).rejects.toThrow();
    },
    20_000,
  );
});
