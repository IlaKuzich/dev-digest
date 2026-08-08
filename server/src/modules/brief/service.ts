import { Brief, type Provider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { IntentService } from '../intent/service.js';
import { BlastService } from '../blast/service.js';
import { SmartDiffService } from '../smart-diff/service.js';
import { ContextService } from '../context/service.js';
import { buildDiffFromFiles, hunkHeadersOnly, parseLinkedIssueRef } from '../intent/helpers.js';
import { BriefRepository } from './repository.js';
import { buildBriefMessages } from './helpers.js';
import { BRIEF_MAX_RETRIES } from './constants.js';

/** Minimal structured logger — mirrors `IntentLogger`, so this module doesn't
 *  depend on Fastify's `req.log` type directly. */
export type BriefLogger = { info: (obj: unknown, msg?: string) => void };

/**
 * Derivation + persistence for a PR's Brief. Mirrors `IntentService`: a
 * single structured LLM call over already-derived, deterministic inputs,
 * cached in `pr_brief.json`. Unlike Intent, a single `getOrDerive` serves
 * both the cached read and the recompute (spec Non-goals — no separate GET).
 */
export class BriefService {
  private repo: BriefRepository;

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
  }

  /**
   * `regenerate=false` (or omitted) returns the cached Brief with NO LLM call
   * (AC-11) — may be `null` when nothing has been generated yet (AC-17).
   * `regenerate=true` gathers inputs, makes one structured LLM call, and
   * overwrites the cache (AC-12). Every gathered input is best-effort — an
   * absent/failing optional input degrades silently rather than failing the
   * whole derivation (AC-19).
   */
  async getOrDerive(
    workspaceId: string,
    prId: string,
    regenerate: boolean,
    logger?: BriefLogger,
  ): Promise<Brief | null> {
    // Workspace-scoped IDOR guard AND the only source of `repoId` — PrDetail
    // has no `repo_id` (server INSIGHTS 2026-07-16), so it cannot come from
    // PullsService.getDetail().
    const pull = await this.container.pullsRepo.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    if (!regenerate) {
      return this.repo.getBrief(workspaceId, prId);
    }

    const repoRow = await this.container.reposRepo.getById(workspaceId, pull.repoId);

    const files = await this.container.pullsRepo.getFiles(prId);
    const diff = buildDiffFromFiles(files);
    const headers = hunkHeadersOnly(diff);

    // ---- Intent: already-derived, best-effort ----------------------------
    let intent: Awaited<ReturnType<IntentService['getIntent']>> | undefined;
    try {
      intent = (await new IntentService(this.container).getIntent(workspaceId, prId)) ?? undefined;
    } catch {
      intent = undefined; // not yet derived / read failure — degrade (AC-19)
    }

    // ---- Blast Radius summary + coverage: best-effort ---------------------
    let blastSummary: string | undefined;
    try {
      const blast = await new BlastService(this.container).getBlast(workspaceId, prId);
      blastSummary = blast.summary;
    } catch {
      blastSummary = undefined; // incomplete index / facade error — degrade (AC-19)
    }

    // ---- Smart-Diff group/diff statistics: best-effort ---------------------
    let smartDiff: Awaited<ReturnType<SmartDiffService['getSmartDiff']>> | undefined;
    try {
      smartDiff = await new SmartDiffService(this.container).getSmartDiff(workspaceId, prId);
    } catch {
      smartDiff = undefined;
    }

    // ---- Linked issue: live, non-fatal (mirrors intent/service.ts) --------
    let issue: { number: number; title: string; body?: string | null } | undefined;
    const issueNumber = parseLinkedIssueRef(pull.body);
    if (issueNumber != null && repoRow) {
      try {
        const gh = await this.container.github();
        const fetched = await gh.getIssue({ owner: repoRow.owner, name: repoRow.name }, issueNumber);
        issue = { number: fetched.number, title: fetched.title, body: fetched.body ?? null };
      } catch {
        issue = undefined; // missing token / missing issue / unreachable — degrade
      }
    }

    // ---- Project Context: the latest completed run's agent, best-effort ----
    let contextDocs: { path: string; text: string }[] | undefined;
    try {
      const runs = await this.container.reviewRepo.listRunsForPull(workspaceId, prId);
      const doneRun = runs.find((r) => r.status === 'done');
      if (doneRun?.agent_id && repoRow?.clonePath) {
        const resolved = await new ContextService(this.container).resolveForAgent(
          workspaceId,
          doneRun.agent_id,
          repoRow.clonePath,
        );
        contextDocs = resolved.injected;
      }
    } catch {
      // No run/agent yet, or ContextDocTooLargeError — best-effort, never
      // fail the Brief derivation over an oversized attached doc (AC-19).
      contextDocs = undefined;
    }

    // ---- Model resolution + structured call --------------------------------
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const llm = await this.container.llm(provider as Provider);
    const res = await llm.completeStructured({
      model,
      schema: Brief,
      schemaName: 'Brief',
      messages: buildBriefMessages({
        title: pull.title,
        body: pull.body,
        headers,
        intent,
        blastSummary,
        smartDiff,
        issue,
        contextDocs,
      }),
      maxRetries: BRIEF_MAX_RETRIES,
    });

    logger?.info({ prId, model }, 'brief: derived');

    await this.repo.upsertBrief(prId, res.data);
    return res.data;
  }
}
