/**
 * T3 — hermetic unit coverage of the context module's guard sequence
 * (`guardContextPath` in `src/modules/context/service.ts`), mirroring the
 * reasoning in `server/INSIGHTS.md:41` / `intent/service.ts:90-115`: a
 * lexical pre-filter alone cannot see through a symlink, so every candidate
 * is also `lstat`-checked (reject a symlink leaf), `realpath`-checked
 * (containment of the REAL target, catching a symlinked ancestor directory),
 * and extension-re-checked against the realpath'd target. No DB, no
 * container — pure filesystem fixtures in a tmp dir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardContextPath } from '../src/modules/context/service.js';

describe('context guard sequence (guardContextPath)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'context-guard-'));
    await mkdir(join(root, 'specs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('accepts a normal .md file contained in the root', async () => {
    await writeFile(join(root, 'specs', 'a.md'), '# a\ninvariant text');
    const result = await guardContextPath(root, 'specs/a.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.realTarget.endsWith('a.md')).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    }
  });

  it('rejects a lexical `..` escape', async () => {
    await writeFile(join(root, 'outside.md'), '# outside');
    const result = await guardContextPath(join(root, 'specs'), '../outside.md');
    expect(result.ok).toBe(false);
  });

  it('rejects an absolute-path candidate', async () => {
    const abs = join(root, 'specs', 'a.md');
    await writeFile(abs, '# a');
    const result = await guardContextPath(join(root, 'specs'), abs);
    expect(result.ok).toBe(false);
  });

  it('rejects a symlink leaf whose name looks like a doc but targets a non-doc file (ext re-check on the realpath)', async (ctx) => {
    const secretPath = join(root, 'secrets.env');
    await writeFile(secretPath, 'SECRET=shh');
    const linkPath = join(root, 'specs', 'looks-like-a-doc.md');
    try {
      await symlink(secretPath, linkPath, 'file');
    } catch {
      // Symlink creation can require elevated privileges (e.g. Windows
      // without Developer Mode) — skip rather than fail the whole suite.
      ctx.skip();
      return;
    }
    const result = await guardContextPath(root, 'specs/looks-like-a-doc.md');
    // Rejected regardless of which internal check fires first (symlink-leaf
    // lstat, or the realpath'd extension re-check) — the observable contract
    // is "never read a symlinked leaf, never trust the lexical extension".
    expect(result.ok).toBe(false);
  });

  it('rejects an escape via a symlinked ancestor directory (caught by realpath containment, not the lexical pre-filter)', async (ctx) => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'context-guard-outside-'));
    await writeFile(join(outsideDir, 'evil.md'), '# evil, not really inside root');
    const linkedDir = join(root, 'specs', 'linked');
    try {
      await symlink(outsideDir, linkedDir, 'dir');
    } catch {
      ctx.skip();
      await rm(outsideDir, { recursive: true, force: true });
      return;
    }
    try {
      // Lexically, 'specs/linked/evil.md' resolves INSIDE root — the pure
      // lexical pre-filter (safeRepoPath) would pass this. Only the
      // realpath + containment re-check catches the escape.
      const result = await guardContextPath(root, 'specs/linked/evil.md');
      expect(result.ok).toBe(false);
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('rejects a non-.md extension even when lexically contained', async () => {
    await writeFile(join(root, 'specs', 'notes.txt'), 'not markdown');
    const result = await guardContextPath(root, 'specs/notes.txt');
    expect(result.ok).toBe(false);
  });

  it('rejects a missing file', async () => {
    const result = await guardContextPath(root, 'specs/missing.md');
    expect(result.ok).toBe(false);
  });
});
