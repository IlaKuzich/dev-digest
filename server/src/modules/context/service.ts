import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type {
  ContextAttachment,
  ContextDoc,
  ContextDocContent,
  ContextDocsResponse,
  SetContextBody,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { isRealPathContained, safeRepoPath } from '../_shared/path-guard.js';
import { ContextRepository } from './repository.js';
import { estimateTokensBounded, toAttachedRows, toContextAttachment } from './helpers.js';
import { CONTEXT_ALLOWED_EXTENSIONS, CONTEXT_MAX_DOC_BYTES, CONTEXT_ROOTS, type ContextRootName } from './constants.js';

/**
 * T3 — context service. Discovery, content, attach (paths + order only, never
 * text — AC-10/11), and the run-time resolution `resolveForAgent` that T4's
 * run-executor calls.
 *
 * Every file read goes through `guardContextPath` (Step 6 of the plan): a
 * lexical pre-filter, then `lstat` (reject a symlink leaf), then `realpath`
 * both the clone root and the candidate + containment re-check (catches a
 * symlinked PARENT directory), then the extension allowlist re-derived from
 * the REALPATH'd target, then a size check against `CONTEXT_MAX_DOC_BYTES` —
 * a crash guard only, never a token budget (see `constants.ts`). Mirrors
 * `intent/service.ts:90-115`, but with its own bound and fail-loud-on-oversize
 * instead of a capped read (server/INSIGHTS.md:41).
 */

/** Thrown when a resolved document exceeds `CONTEXT_MAX_DOC_BYTES` — a crash
 *  guard, not a token budget (AC-29). NEVER thrown after bytes have been
 *  read; the size check happens via `stat`, before any `readFile` call. */
export class ContextDocTooLargeError extends AppError {
  constructor(
    public readonly path: string,
    public readonly size: number,
  ) {
    super(
      'context_doc_too_large',
      `Context document too large to read: ${path} (${size} bytes, bound ${CONTEXT_MAX_DOC_BYTES})`,
      413,
      { path, size, bound: CONTEXT_MAX_DOC_BYTES },
    );
    this.name = 'ContextDocTooLargeError';
  }
}

type GuardOk = { ok: true; realTarget: string; size: number };
type GuardFail = { ok: false; reason: string };
type GuardResult = GuardOk | GuardFail;

/** The full guard sequence (Step 6) — does NOT read any bytes; only stats.
 *  Exported for `test/context-guard.test.ts`'s hermetic, container-free unit
 *  coverage of the sequence itself (lexical → lstat → realpath → ext
 *  re-check); every other consumer goes through `ContextService`. */
export async function guardContextPath(clonePath: string, relPath: string): Promise<GuardResult> {
  const resolved = safeRepoPath(clonePath, relPath);
  if (!resolved) return { ok: false, reason: 'invalid_path' };

  let leafStat;
  try {
    leafStat = await lstat(resolved);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (leafStat.isSymbolicLink()) return { ok: false, reason: 'symlink' };

  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = await realpath(resolve(clonePath));
    realTarget = await realpath(resolved);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (!isRealPathContained(realRoot, realTarget)) return { ok: false, reason: 'escaped_root' };

  const ext = extname(realTarget).toLowerCase();
  if (!(CONTEXT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, reason: 'bad_extension' };
  }

  let realStat;
  try {
    realStat = await stat(realTarget);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  return { ok: true, realTarget, size: realStat.size };
}

/** Recursively walk `absDir`, never descending into a symlinked directory and
 *  never listing a symlinked file — discovery only ever lists REAL `.md`
 *  files; the full guard sequence re-validates each one again before it's
 *  ever read (defense in depth, not a redundant no-op: a doc can be replaced
 *  on disk between the walk and the read). */
async function walkMarkdownDir(
  absDir: string,
  clonePath: string,
  root: ContextRootName,
  out: { path: string; root: ContextRootName }[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return; // root doesn't exist for this repo — not every repo has all three
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow a symlink during discovery
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownDir(abs, clonePath, root, out);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      const rel = relative(clonePath, abs).split(sep).join('/');
      out.push({ path: rel, root });
    }
  }
}

/** Every `.md` file (repo-relative path) beneath the configured roots, at any
 *  depth (AC-1). Perf: walks only `CONTEXT_ROOTS`, never the whole tree. */
async function discoverMarkdownDocs(
  clonePath: string,
): Promise<{ path: string; root: ContextRootName }[]> {
  const out: { path: string; root: ContextRootName }[] = [];
  for (const root of CONTEXT_ROOTS) {
    await walkMarkdownDir(join(clonePath, root), clonePath, root, out);
  }
  return out;
}

export class ContextService {
  private repo: ContextRepository;

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
  }

  /** Discovery list for a repo's last-synced clone (AC-1, AC-2, AC-4, AC-26). */
  async listDocs(workspaceId: string, repoId: string): Promise<ContextDocsResponse> {
    const repoRow = await this.repo.getRepoClone(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const syncedAt = repoRow.syncedAt ? repoRow.syncedAt.toISOString() : null;
    if (!repoRow.clonePath) {
      return { docs: [], clone: { present: false, synced_at: syncedAt } };
    }

    const found = await discoverMarkdownDocs(repoRow.clonePath);
    const usedCounts = await this.repo.usedByAgentsCounts(workspaceId);

    const docs: ContextDoc[] = [];
    for (const entry of found) {
      // Re-validate + read each discovered file once, guarded — a doc can be
      // replaced by a symlink between the walk above and this read.
      const guard = await guardContextPath(repoRow.clonePath, entry.path);
      if (!guard.ok) continue; // shouldn't happen for a freshly-walked real file; skip defensively
      if (guard.size > CONTEXT_MAX_DOC_BYTES) continue; // never buffer an oversized doc just to list it
      const text = await readFile(guard.realTarget, 'utf8');
      docs.push({
        path: entry.path,
        root: entry.root,
        bytes: guard.size,
        token_estimate: estimateTokensBounded(this.container.tokenizer, text),
        used_by_agents: usedCounts.get(entry.path) ?? 0,
      });
    }
    return { docs, clone: { present: true, synced_at: syncedAt } };
  }

  /** Read-only Markdown content for Preview (AC-6). Guard-rejected/missing →
   *  404 (no bytes leaked); oversized → 413 naming the doc + size. */
  async getDocContent(
    workspaceId: string,
    repoId: string,
    relPath: string,
  ): Promise<ContextDocContent> {
    const repoRow = await this.repo.getRepoClone(workspaceId, repoId);
    if (!repoRow?.clonePath) throw new NotFoundError('Context document not found');

    const guard = await guardContextPath(repoRow.clonePath, relPath);
    if (!guard.ok) throw new NotFoundError('Context document not found');
    if (guard.size > CONTEXT_MAX_DOC_BYTES) throw new ContextDocTooLargeError(relPath, guard.size);

    const text = await readFile(guard.realTarget, 'utf8');
    return { path: relPath, text };
  }

  // ---- agent attach (AC-10) -----------------------------------------------

  async getAgentContext(
    workspaceId: string,
    agentId: string,
  ): Promise<ContextAttachment[] | undefined> {
    const rows = await this.repo.agentContext(workspaceId, agentId);
    return rows?.map(toContextAttachment);
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    body: SetContextBody,
  ): Promise<ContextAttachment[] | undefined> {
    const validPaths = await this.validAttachPaths(workspaceId);
    const rows = toAttachedRows(body, validPaths);
    const persisted = await this.repo.setAgentContext(workspaceId, agentId, rows);
    return persisted?.map(toContextAttachment);
  }

  /**
   * The agent's own attached context paths, in order — no skill inheritance.
   * Exposed for `AgentsService`'s version-snapshot path (AC-27) so
   * `agent_context` has exactly one owning repository (architecture-review
   * W2 fix) instead of `agents/repository.ts` re-querying the table itself.
   */
  async pathsForAgent(agentId: string): Promise<string[]> {
    return this.repo.pathsForAgent(agentId);
  }

  // ---- skill attach (AC-11) -----------------------------------------------

  async getSkillContext(
    workspaceId: string,
    skillId: string,
  ): Promise<ContextAttachment[] | undefined> {
    const rows = await this.repo.skillContext(workspaceId, skillId);
    return rows?.map(toContextAttachment);
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    body: SetContextBody,
  ): Promise<ContextAttachment[] | undefined> {
    const validPaths = await this.validAttachPaths(workspaceId);
    const rows = toAttachedRows(body, validPaths);
    const persisted = await this.repo.setSkillContext(workspaceId, skillId, rows);
    return persisted?.map(toContextAttachment);
  }

  /**
   * Every path currently discoverable across the workspace's repos. Agents
   * and skills aren't repo-scoped (no `repoId` on either table), so a POSTed
   * attachment's paths are validated against the union across every repo in
   * the workspace that has a clone, rather than a single repo — this is the
   * one workspace-wide reach in an otherwise per-repo module.
   */
  private async validAttachPaths(workspaceId: string): Promise<Set<string>> {
    const clonePaths = await this.repo.listClonePaths(workspaceId);
    const set = new Set<string>();
    for (const clonePath of clonePaths) {
      const found = await discoverMarkdownDocs(clonePath);
      for (const f of found) set.add(f.path);
    }
    return set;
  }

  // ---- run-time resolution (T4 calls this) --------------------------------

  /**
   * Resolve + guard + read every path this agent should inject for its next
   * run. `clonePath` is the REVIEW's repo clone (not repo-scoped to the
   * agent) — a null clone (no clone yet) yields nothing to inject (AC-2's
   * run-time analogue). Guard-reject/missing → pushed to `skipped`, run
   * continues (AC-16/17). Oversize → THROWS `ContextDocTooLargeError` WITHOUT
   * reading any bytes (AC-29) — the caller (T4) fails the run naming the doc.
   */
  async resolveForAgent(
    workspaceId: string,
    agentId: string,
    clonePath: string | null,
  ): Promise<{ injected: { path: string; text: string }[]; skipped: { path: string; reason: string }[] }> {
    if (!clonePath) return { injected: [], skipped: [] };

    const paths = await this.repo.resolvePathsForAgent(workspaceId, agentId);
    const injected: { path: string; text: string }[] = [];
    const skipped: { path: string; reason: string }[] = [];

    for (const path of paths) {
      const guard = await guardContextPath(clonePath, path);
      if (!guard.ok) {
        skipped.push({ path, reason: guard.reason });
        continue;
      }
      if (guard.size > CONTEXT_MAX_DOC_BYTES) {
        throw new ContextDocTooLargeError(path, guard.size);
      }
      const text = await readFile(guard.realTarget, 'utf8');
      injected.push({ path, text });
    }
    return { injected, skipped };
  }
}
