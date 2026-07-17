import { lstat, open, realpath } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Intent, type Provider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { IntentRepository } from './repository.js';
import {
  buildDiffFromFiles,
  buildIntentMessages,
  estimateTokens,
  extractRepoDocRefs,
  hunkHeadersOnly,
  isRealPathContained,
  parseLinkedIssueRef,
  safeRepoPath,
} from './helpers.js';
import { INTENT_MAX_RETRIES, PLAN_SPEC_ALLOWED_EXTENSIONS, PLAN_SPEC_MAX_BYTES } from './constants.js';

/** Minimal structured logger — a subset of Fastify's pino `req.log` /
 *  `run-executor`'s `Logger`, so this module doesn't depend on either. */
export type IntentLogger = { info: (obj: unknown, msg?: string) => void };

/**
 * Derivation + persistence for a PR's Intent. Mirrors `ConventionsService`:
 * a cheap feature-model call → structured output → per-entity storage. Manual
 * route and auto-derive (reviews run-executor) share this single `derive()`.
 */
export class IntentService {
  private repo: IntentRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
  }

  /** Workspace-scoped read — mirrors `derive()`'s `getPull(workspaceId, prId)`
   *  tenancy guard so a PR's intent can't be read cross-tenant (IDOR). */
  async getIntent(workspaceId: string, prId: string): Promise<Intent | null> {
    return this.repo.getIntent(workspaceId, prId);
  }

  /**
   * Always returns a best-effort Intent — there is no "no documentation →
   * error" path (spec §"Classifier input & graceful degradation"). Every
   * optional signal (linked issue, plan/spec doc) degrades silently on
   * failure; only a missing PR itself is a hard error.
   */
  async derive(workspaceId: string, prId: string, logger?: IntentLogger): Promise<Intent> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repoRef = await this.repo.getRepoRef(pull.repoId);
    const files = await this.repo.getPrFiles(prId);

    const diff = buildDiffFromFiles(files);
    const headers = hunkHeadersOnly(diff);

    // ---- Linked issue: live, non-fatal ---------------------------------
    let issue: { number: number; title: string; body?: string | null } | undefined;
    const issueNumber = parseLinkedIssueRef(pull.body);
    if (issueNumber != null && repoRef) {
      try {
        const gh = await this.container.github();
        const fetched = await gh.getIssue({ owner: repoRef.owner, name: repoRef.name }, issueNumber);
        issue = { number: fetched.number, title: fetched.title, body: fetched.body ?? null };
      } catch {
        issue = undefined; // missing token / missing issue / unreachable — degrade
      }
    }

    // ---- Plan/spec resolution: bounded, non-fatal ----------------------
    // Inline body text is passed as-is (buildIntentMessages weights it);
    // linked in-repo docs are read from the local clone, path-guarded.
    //
    // `safeRepoPath` is a purely LEXICAL pre-filter (resolve+relative) — it
    // cannot see through symlinks. A malicious PR can commit a symlink inside
    // the clone (e.g. `docs/plan.md -> /home/<user>/.devdigest/secrets.json`)
    // and reference it in the PR body; without a realpath check we'd follow it
    // and exfiltrate the target's bytes to the LLM. So for every candidate we:
    //   1. lstat it and reject outright if the leaf is a symlink at all
    //      (defense-in-depth — a legit plan/spec is never a symlink);
    //   2. realpath both the clone root and the candidate, and require the
    //      real target still resolves inside the real root (this also catches
    //      escapes via a symlinked PARENT directory, which lstat alone won't);
    //   3. re-check the extension allowlist against the REAL path, not the
    //      lexical name (a `.md` symlink could point at a `.env` target).
    // A ref that fails any check, or errors at any step (ENOENT etc.), is
    // simply skipped — never fatal to the derivation (spec §"graceful
    // degradation").
    let planSpec = '';
    if (repoRef?.clonePath) {
      const refs = extractRepoDocRefs(pull.body);
      const realRoot = await realpath(resolve(repoRef.clonePath)).catch(() => null);
      for (const ref of refs) {
        if (!realRoot) break; // clone root itself unreadable — nothing to resolve against
        try {
          const resolved = safeRepoPath(repoRef.clonePath, ref);
          if (!resolved) continue; // traversal guard rejected it

          const stat = await lstat(resolved);
          if (stat.isSymbolicLink()) continue; // never follow a symlink for these doc reads

          const realTarget = await realpath(resolved);
          if (!isRealPathContained(realRoot, realTarget)) continue; // symlinked parent escaped the clone

          const ext = extname(realTarget).toLowerCase();
          if (!(PLAN_SPEC_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) continue;

          // Bounded read: never buffer more than PLAN_SPEC_MAX_BYTES, even for
          // an oversized file — open, read the first N bytes, close.
          const capped = await readCappedUtf8(realTarget, PLAN_SPEC_MAX_BYTES);
          planSpec += `${planSpec ? '\n\n' : ''}# ${ref}\n${capped}`;
        } catch {
          // unresolvable path / missing file / read error — skip this ref only
        }
      }
    }

    // ---- Model resolution + structured call ----------------------------
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(provider as Provider);
    const res = await llm.completeStructured({
      model,
      schema: Intent,
      schemaName: 'Intent',
      messages: buildIntentMessages({
        title: pull.title,
        body: pull.body,
        issue,
        planSpec: planSpec || undefined,
        headers,
      }),
      maxRetries: INTENT_MAX_RETRIES,
    });

    // ---- Token-savings log (once per derivation) ------------------------
    const fullDiffTokens = estimateTokens(diff.raw);
    const headersOnlyTokens = estimateTokens(headers);
    logger?.info(
      { prId, model, fullDiffTokens, headersOnlyTokens, saved: fullDiffTokens - headersOnlyTokens },
      'intent: token savings',
    );

    await this.repo.upsertIntent(prId, res.data);
    return res.data;
  }
}

/**
 * Read at most `maxBytes` from `path` without ever buffering the full file —
 * opens a file handle, reads only the first `maxBytes` into a fixed buffer,
 * then closes. Replaces the previous `readFile()` + `.slice()`, which fully
 * buffered an arbitrarily large file before truncating.
 *
 * Note: if the cap lands mid-codepoint, `Buffer#toString('utf8', ...)`
 * replaces the truncated trailing bytes with U+FFFD rather than throwing —
 * acceptable for a best-effort LLM context snippet.
 */
async function readCappedUtf8(path: string, maxBytes: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await handle.close();
  }
}
