import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RunRequest, MultiAgentRunRequest } from '@devdigest/shared';
import type { RunEvent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, PrRunParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewService } from './service.js';
import { MultiAgentService } from './multi-agent.service.js';

/**
 * reviews module.
 *   POST   /pulls/:id/review          {agentId} | {all:true}  → run review(s); returns runs
 *   GET    /runs/:id/events                                    → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                                     → the single-document RunTrace
 *   GET    /pulls/:id/reviews                                  → persisted reviews + findings for a PR
 *   POST   /pulls/:id/multi-agent-run {agent_ids}              → fan out N agents, one parent run (A5)
 *   GET    /pulls/:id/multi-agent                              → latest multi-agent run for the PR (A5)
 *   GET    /pulls/:id/agent-estimates                          → per-agent time/cost estimate + PR summary (A5)
 *   GET    /repos/:id/multi-agent/latest                       → repo's most recent multi-agent run's PR, or null (nav landing)
 *   GET    /repos/:id/multi-agent/history                      → every past multi-agent run in the repo, newest-first, repo-wide (A5, 2026-08-27)
 *   GET    /pulls/:id/multi-agent/runs/:runId                  → one specific historical run by id (A5, 2026-08-27)
 *   POST   /findings/:id/(accept|dismiss|learn|reply)          → finding actions
 */
const FINDING_ACTIONS = ['accept', 'dismiss', 'learn', 'reply'] as const;
/** Optional body for the finding-action routes — only `reply` reads it. */
const FindingActionBody = z.object({ reply: z.string().nullish() }).nullish();

export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);
  const multiAgentService = new MultiAgentService(container);

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  // Body stays a tolerant manual parse (both fields optional; empty body is OK).
  app.post(
    '/pulls/:id/review',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = RunRequest.parse(req.body ?? {});
    const targets = await service.resolveTargets(workspaceId, {
      ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
      ...(body.all !== undefined ? { all: body.all } : {}),
    });
    const { runs, reviews } = await service.runReview(
      workspaceId,
      req.params.id,
      targets,
      req.log,
    );
    return { pr_id: req.params.id, runs, reviews };
  });

  // ---- SSE: live run events (replay buffer first, then live; ends on done) -
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
    await getContext(container, req);
    const runId = req.params.id;

    reply.sse(
      (async function* () {
        // Bridge the in-memory RunBus to an async iterator the SSE plugin drains.
        const queue: RunEvent[] = [];
        let resolve: (() => void) | null = null;
        let done = false;

        const unsubscribe = container.runBus.subscribe(runId, (e) => {
          queue.push(e);
          resolve?.();
        });
        const offDone = container.runBus.onDone(runId, () => {
          done = true;
          resolve?.();
        });

        try {
          while (true) {
            if (queue.length === 0) {
              if (done) break;
              await new Promise<void>((r) => (resolve = r));
              resolve = null;
              continue;
            }
            const e = queue.shift()!;
            yield {
              id: String(e.seq),
              event: e.kind,
              data: JSON.stringify(e),
            };
          }
        } finally {
          unsubscribe();
          offDone();
        }
      })(),
    );
  });

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get('/pulls/:id/runs/active', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.activeRuns(workspaceId, req.params.id);
  });

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get('/pulls/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  // ---- PR-wide metrics rollup (latest done run per agent) ------------------
  app.get('/pulls/:id/metrics-rollup', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.metricsRollup(workspaceId, req.params.id);
  });

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post('/runs/:id/cancel', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    await service.cancelRun(req.params.id);
    return { ok: true };
  });

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get('/runs/:id/trace', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    const trace = await service.getRunTrace(req.params.id);
    if (!trace) throw new NotFoundError('Run trace not found');
    return trace;
  });

  // ---- Reads --------------------------------------------------------------
  app.get('/pulls/:id/reviews', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.reviewsForPull(workspaceId, req.params.id);
  });

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete('/reviews/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteReview(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Review not found');
    return { ok: true };
  });

  // ---- Multi-agent review (A5) ---------------------------------------------
  // Trigger: fan the selected agent set out via the EXISTING parallel review
  // path (AC-11) and attribute every resulting run to one parent (AC-12).
  // Tight per-route limit mirrors `/pulls/:id/review` — each call fans out to
  // N expensive LLM runs.
  app.post(
    '/pulls/:id/multi-agent-run',
    {
      schema: { params: IdParams, body: MultiAgentRunRequest },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return multiAgentService.trigger(workspaceId, req.params.id, req.body.agent_ids, req.log);
    },
  );

  // Latest multi-agent run for a PR (AC-29 — latest-per-PR, survives reload).
  app.get('/pulls/:id/multi-agent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return multiAgentService.getForPr(workspaceId, req.params.id);
  });

  // Per-agent time/cost estimate + latest per-PR summary (AC-3/AC-4/AC-5/AC-6).
  app.get('/pulls/:id/agent-estimates', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return multiAgentService.estimatesForPr(workspaceId, req.params.id);
  });

  // One specific historical multi-agent run by id ("Previous Runs" detail).
  app.get(
    '/pulls/:id/multi-agent/runs/:runId',
    { schema: { params: PrRunParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return multiAgentService.getById(workspaceId, req.params.id, req.params.runId);
    },
  );

  // Repo-level "Multi-Agent Review" nav landing: the PR to jump back to (the
  // repo's most recently-run multi-agent run), or `null` when none exists yet
  // — lets the nav item return to the last run instead of always starting a
  // new one (see MultiAgentService.latestForRepo).
  app.get('/repos/:id/multi-agent/latest', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return multiAgentService.latestForRepo(workspaceId, req.params.id);
  });

  // Every past multi-agent run anywhere in this repo, newest-first — repo-
  // wide "Previous Runs" (2026-08-27 follow-on; supersedes the original "no
  // browsable history" non-goal; requester decision: repo-wide, not per-PR).
  app.get('/repos/:id/multi-agent/history', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return multiAgentService.historyForRepo(workspaceId, req.params.id);
  });

  // ---- Finding actions (accept / dismiss / learn / reply) -----------------
  for (const action of FINDING_ACTIONS) {
    app.post(
      `/findings/:id/${action}`,
      { schema: { params: IdParams, body: FindingActionBody } },
      async (req) => {
        const { workspaceId } = await getContext(container, req);
        const reply = req.body?.reply ?? undefined;
        const result = await service.actOnFinding(
          workspaceId,
          req.params.id,
          action,
          action === 'reply' ? { reply: reply ?? '' } : {},
        );
        return result;
      },
    );
  }
}
