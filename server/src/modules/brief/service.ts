import { Brief, type BriefEnvelope, type Provider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { PullRow } from '../pulls/repository.js';
import { PullsService } from '../pulls/service.js';
import { IntentService } from '../intent/service.js';
import { BlastService } from '../blast/service.js';
import { SmartDiffService } from '../smart-diff/service.js';
import { ContextService } from '../context/service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BriefRepository, type CachedBrief } from './repository.js';
import { groundBrief } from './grounding.js';
import { assembleFileSet, buildBriefMessages } from './helpers.js';
import { BRIEF_MAX_RETRIES } from './constants.js';

/** Minimal structured logger — mirrors `intent/service.ts`'s `IntentLogger`. */
export type BriefLogger = { info: (obj: unknown, msg?: string) => void };

/**
 * Per-PR in-flight coalescing guard (AC-25). Module-scope (not per-instance)
 * so it survives across the multiple `BriefService` instances a route module
 * may construct per request — this is a single-process, local-first server,
 * so an in-memory map is sufficient; no cross-process lock is needed.
 */
const inFlight = new Map<string, Promise<BriefEnvelope>>();

/**
 * Why+Risk Brief use case. Assembles ALREADY-BUILT outputs (Intent, Blast,
 * SmartDiff, linked issue, discovered context docs) into exactly ONE
 * structured LLM call (AC-1/AC-3), grounds every file_ref (AC-5/AC-6), and
 * caches the result in the existing `pr_brief` table (AC-8/AC-10). Never
 * re-derives Intent/Blast/SmartDiff (Non-goals) and never touches
 * `reviewer-core`.
 */
export class BriefService {
  private repo: BriefRepository;

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
  }

  /**
   * Cache read (AC-8/AC-9). `getById` runs FIRST — it is both the
   * workspace-scoped IDOR guard (AC-14) and the only source of `headSha`
   * (`PrDetail`/`PrMeta` carry no `repoId`/head at all — `server/INSIGHTS.md:50`).
   * Returns `null` when nothing is cached yet (the client then auto-generates
   * once, AC-9); otherwise maps the cached blob to the transport envelope,
   * computing `stale` from the PR's CURRENT head — zero LLM calls either way.
   */
  async get(workspaceId: string, prId: string): Promise<BriefEnvelope | null> {
    const pull = await this.container.pullsRepo.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const cached = await this.repo.read(prId);
    if (!cached) return null;
    return {
      brief: cached.brief,
      generated_at: cached.generated_at,
      stale: cached.head_sha !== pull.headSha,
    };
  }

  /**
   * Regenerate — the single path serving BOTH first-open auto-generation
   * (AC-9) and the Regenerate button (AC-10). `getById` runs FIRST (AC-14).
   * A concurrent call for the SAME `prId` is coalesced onto the in-flight
   * promise rather than starting a second generation (AC-25).
   */
  async regenerate(workspaceId: string, prId: string, logger?: BriefLogger): Promise<BriefEnvelope> {
    const pull = await this.container.pullsRepo.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const existing = inFlight.get(prId);
    if (existing) return existing;

    const task = this.doRegenerate(workspaceId, prId, pull, logger);
    inFlight.set(prId, task);
    // `.finally()` returns a NEW promise that adopts `task`'s rejection; the
    // caller below awaits/handles the ORIGINAL `task` (returned as-is), so
    // this derived promise's rejection must be explicitly swallowed here —
    // otherwise a failed generation (AC-24) surfaces as an unhandled
    // rejection on top of the properly-propagated error.
    task.finally(() => {
      // Only clear the slot if it's still THIS task — a slower stale entry
      // could otherwise clobber a newer one, though `prId` keying makes that
      // scenario unreachable here in practice (one task per prId at a time).
      if (inFlight.get(prId) === task) inFlight.delete(prId);
    }).catch(() => {});
    return task;
  }

  /**
   * Assemble (from already-built outputs, no re-derivation), make exactly
   * ONE structured call, ground the result, and persist it — or, on failure,
   * leave the existing cache untouched and propagate the typed error (AC-24).
   */
  private async doRegenerate(
    workspaceId: string,
    prId: string,
    pull: PullRow,
    logger?: BriefLogger,
  ): Promise<BriefEnvelope> {
    const [detail, intent, blast, smartDiff, contextDocs] = await Promise.all([
      new PullsService(this.container).getDetail(workspaceId, prId),
      new IntentService(this.container).getIntent(workspaceId, prId), // may be null (AC-12) — never derived here
      new BlastService(this.container).getBlast(workspaceId, prId), // may be degraded/empty (AC-13)
      new SmartDiffService(this.container).getSmartDiff(workspaceId, prId),
      this.discoverContextDocs(workspaceId, pull.repoId), // GAP-1: discovery set, no per-PR selector
    ]);

    const changedFiles = detail.files.map((f) => f.path);
    const fileSet = assembleFileSet({
      changedFiles,
      blast,
      contextDocPaths: contextDocs.map((d) => d.path),
    });

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const llm = await this.container.llm(provider as Provider);

    // ---- Exactly ONE structured call (AC-3/AC-4) ---------------------------
    const res = await llm.completeStructured({
      model,
      schema: Brief,
      schemaName: 'Brief',
      messages: buildBriefMessages({
        title: detail.title,
        body: detail.body ?? null,
        issue: detail.linked_issue ?? undefined,
        intent,
        blast,
        smartDiff,
        contextDocs,
      }),
      maxRetries: BRIEF_MAX_RETRIES,
    });

    const { brief: grounded, dropped } = groundBrief(res.data, fileSet);
    if (dropped.length > 0) {
      logger?.info({ prId, dropped }, 'brief: grounding dropped ungrounded file_ref(s)');
    }

    const cached: CachedBrief = {
      brief: grounded,
      head_sha: pull.headSha,
      generated_at: new Date().toISOString(),
    };
    await this.repo.upsert(prId, cached);

    return { brief: grounded, generated_at: cached.generated_at, stale: false };
  }

  /**
   * GAP-1 (owner-resolved, 2026-07-17): the brief's context-spec input is the
   * repo clone's DISCOVERED context docs (the safe grounding superset) — NOT
   * an agent-attached union, and NOT a new per-PR relevance selector. Reuses
   * `ContextService`'s existing discovery (`listDocs`) + guarded per-doc read
   * (`getDocContent`, bounded by `CONTEXT_MAX_DOC_BYTES`) exactly as-is; adds
   * no new selector code.
   */
  private async discoverContextDocs(
    workspaceId: string,
    repoId: string,
  ): Promise<{ path: string; text: string }[]> {
    const contextService = new ContextService(this.container);
    const { docs } = await contextService.listDocs(workspaceId, repoId);

    const out: { path: string; text: string }[] = [];
    for (const doc of docs) {
      try {
        const content = await contextService.getDocContent(workspaceId, repoId, doc.path);
        out.push({ path: doc.path, text: content.text });
      } catch {
        // Guard-rejected / replaced-on-disk / oversized between list and
        // read — skip this doc only, never fail the whole brief for it.
      }
    }
    return out;
  }
}
