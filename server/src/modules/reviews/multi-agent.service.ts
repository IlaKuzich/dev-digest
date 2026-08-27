import type { Container } from '../../platform/container.js';
import type { AgentColumn, AgentColumnFinding, MultiAgentRun, MultiAgentRunSummary } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from './repository.js';
import { ReviewService } from './service.js';
import type { Logger } from './run-executor.js';
import {
  buildAgentEstimate,
  buildConflicts,
  type AgentEstimate,
  type ParticipatingAgentFindings,
} from './multi-agent.helpers.js';

export type { AgentEstimate } from './multi-agent.helpers.js';

/**
 * A5 — multi-agent review orchestration. Fans a PR out to a chosen set of
 * agents in ONE run (AC-10/AC-30), reusing the EXISTING parallel review path
 * (`ReviewService.runReview` / `ReviewRunExecutor`) rather than a new engine
 * (AC-11), and links every resulting `agent_runs` row to a single
 * `multi_agent_runs` parent (AC-12). Reads build the `MultiAgentRun` DTO
 * (columns + conflicts + totals) and the per-agent picker estimates.
 */
export class MultiAgentService {
  private repo: ReviewRepository;
  private reviewService: ReviewService;

  constructor(private container: Container) {
    // Reuse the shared, container-owned ReviewRepository instance (the same
    // one ReviewService uses) rather than constructing a second wrapper over
    // the same db — onion-architecture: services receive Container, and
    // cross-cutting repos are shared via it.
    this.repo = container.reviewRepo;
    this.reviewService = new ReviewService(container);
  }

  // ===========================================================================
  // Trigger (AC-10, AC-11, AC-12, AC-30)
  // ===========================================================================

  /**
   * Fan the PR out to exactly the selected agent set. Resolves + validates
   * every agent id against the workspace FIRST (404s any missing/cross-
   * workspace id before creating anything), then creates ONE
   * `multi_agent_runs` parent, reuses `ReviewService.runReview` to fan out
   * (it creates each child `agent_runs` row up front and executes them in the
   * background — unchanged, AC-11), and links every returned run id to the
   * parent (AC-12). N===1 takes the exact same path (AC-30).
   */
  async trigger(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<{ id: string }> {
    const targets = [];
    for (const agentId of agentIds) {
      const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
      if (!agent) throw new NotFoundError(`Agent not found: ${agentId}`);
      targets.push(agent);
    }

    const multiAgentRunId = await this.repo.createMultiAgentRun(workspaceId, prId);
    const { runs } = await this.reviewService.runReview(workspaceId, prId, targets, logger);
    await this.repo.linkAgentRunsToParent(
      runs.map((r) => r.run_id),
      multiAgentRunId,
    );
    return { id: multiAgentRunId };
  }

  // ===========================================================================
  // Read (AC-13, AC-16, AC-20, AC-21, AC-22, AC-24, AC-26, AC-28, AC-29)
  // ===========================================================================

  /** The latest multi-agent run for this PR, workspace-scoped (AC-26/AC-29). */
  async getForPr(workspaceId: string, prId: string): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const latest = await this.repo.getLatestMultiAgentRunForPr(workspaceId, prId);
    if (!latest) throw new NotFoundError('No multi-agent run found for this pull request');

    return this.buildMultiAgentRun(prId, pull.number, latest);
  }

  /**
   * One specific historical multi-agent run by id — the "Previous Runs"
   * follow-on (2026-08-27). Supersedes the original plan's non-goal ("no
   * browsable history of past runs on this page"): the requester asked for a
   * way back to an older run, not just the latest. Workspace-scoped via
   * `getPull` first, then the run row itself must actually belong to this PR
   * — a run id for a different PR (even in the same workspace) 404s exactly
   * like a cross-workspace one, so a guessable uuid can't leak another PR's
   * run.
   */
  async getById(workspaceId: string, prId: string, multiAgentRunId: string): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const run = await this.repo.getMultiAgentRunById(workspaceId, multiAgentRunId);
    if (!run || run.prId !== prId) {
      throw new NotFoundError('Multi-agent run not found for this pull request');
    }

    return this.buildMultiAgentRun(prId, pull.number, run);
  }

  /**
   * Every past multi-agent run anywhere in a REPO, newest-first, summarized
   * for the "Previous Runs" list (2026-08-27 follow-on; requester decision:
   * repo-wide across all the repo's PRs, not scoped to one PR, so each row
   * can show which PR it ran against). One extra query per run to total its
   * agents' duration/cost — fine at this scale (a repo's multi-agent run
   * count), same pragmatic N+1 already accepted for `estimatesForPr` below.
   */
  async historyForRepo(workspaceId: string, repoId: string): Promise<MultiAgentRunSummary[]> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const runs = await this.repo.listMultiAgentRunsForRepo(workspaceId, repoId);
    const summaries: MultiAgentRunSummary[] = [];
    for (const run of runs) {
      const agentRunRows = await this.repo.agentRunsForMultiRun(run.id);
      const durations = agentRunRows.flatMap((r) => (r.durationMs != null ? [r.durationMs] : []));
      const costs = agentRunRows.flatMap((r) => (r.costUsd != null ? [r.costUsd] : []));
      // Same terminal-status classification as buildMultiAgentRun's per-column
      // status (AC-16's 'done'|'failed'|'running' split) — running while ANY
      // child hasn't settled yet, so the caller never sees a misleadingly
      // "finished" 0s/$0 total for an in-progress run (2026-08-27 fix).
      const isRunning = agentRunRows.some(
        (r) => r.status !== 'done' && r.status !== 'failed' && r.status !== 'cancelled',
      );
      const hasFailure = agentRunRows.some((r) => r.status === 'failed' || r.status === 'cancelled');
      const status: MultiAgentRunSummary['status'] = isRunning ? 'running' : hasFailure ? 'failed' : 'done';
      summaries.push({
        id: run.id,
        pr_number: run.prNumber,
        pr_title: run.prTitle,
        ran_at: run.ranAt.toISOString(),
        agent_count: agentRunRows.length,
        total_duration_ms: durations.length ? Math.max(...durations) : 0,
        total_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
        status,
      });
    }
    return summaries;
  }

  /** Shared column/conflict/totals build for one multi-agent run row, used by
   *  both `getForPr` (latest) and `getById` (a specific historical run). */
  private async buildMultiAgentRun(
    prId: string,
    prNumber: number,
    runRow: { id: string; ranAt: Date },
  ): Promise<MultiAgentRun> {
    const agentRunRows = await this.repo.agentRunsForMultiRun(runRow.id);
    const runIds = agentRunRows.map((r) => r.runId);
    const reviewsAndFindings = await this.repo.findingsForRuns(runIds);
    const byRunId = new Map(reviewsAndFindings.map((rf) => [rf.review.runId, rf] as const));

    const columns: AgentColumn[] = agentRunRows.map((r) => {
      const rf = r.runId ? byRunId.get(r.runId) : undefined;
      const status: AgentColumn['status'] =
        r.status === 'done' ? 'done' : r.status === 'failed' || r.status === 'cancelled' ? 'failed' : 'running';

      const findings: AgentColumnFinding[] =
        status === 'done' && rf
          ? rf.findings.map((f) => ({
              id: f.id,
              severity: f.severity as AgentColumnFinding['severity'],
              category: f.category,
              title: f.title,
              file: f.file,
              start_line: f.startLine,
              kind: f.kind ?? null,
            }))
          : [];

      return {
        run_id: r.runId,
        agent_id: r.agentId ?? '',
        agent_name: r.agentName ?? 'Unknown agent',
        provider: r.provider,
        model: r.model,
        status,
        verdict: status === 'done' ? (rf?.review.verdict ?? null) : null,
        score: status === 'done' ? r.score : null,
        // Failed → no numeric score/cost, `summary` carries the failure
        // reason instead (AC-16; AgentColumn has no dedicated `error` field).
        summary:
          status === 'done'
            ? (rf?.review.summary ?? null)
            : status === 'failed'
              ? (r.error ?? 'Run failed')
              : null,
        duration_ms: status === 'done' ? r.durationMs : null,
        cost_usd: status === 'done' ? r.costUsd : null,
        findings,
      };
    });

    // Totals derived from THIS run's own agent_runs data only (AC-24/AC-28):
    // wall-clock = the slowest completed agent's duration; cost = the sum.
    const durations = columns.flatMap((c) => (c.duration_ms != null ? [c.duration_ms] : []));
    const total_duration_ms = durations.length ? Math.max(...durations) : 0;
    const costs = columns.flatMap((c) => (c.cost_usd != null ? [c.cost_usd] : []));
    const total_cost_usd = costs.length ? costs.reduce((a, b) => a + b, 0) : null;

    // Conflicts only ever consider agents whose run in THIS run has completed
    // (AC-22/AC-14 — a running or failed agent has no findings to compare).
    const participating: ParticipatingAgentFindings[] = columns
      .filter((c) => c.status === 'done')
      .map((c) => ({
        agent_id: c.agent_id,
        persona: c.agent_name,
        findings: c.findings.map((f) => ({
          file: f.file,
          line: f.start_line,
          severity: f.severity,
          title: f.title,
        })),
      }));
    const conflicts = buildConflicts(participating);

    return {
      id: runRow.id,
      pr_id: prId,
      pr_number: prNumber,
      ran_at: runRow.ranAt.toISOString(),
      agent_count: columns.length,
      total_duration_ms,
      total_cost_usd,
      columns,
      conflicts,
    };
  }

  /**
   * The PR to land on for the repo-level "Multi-Agent Review" nav item: the
   * most recently-run multi-agent run anywhere in this repo, or `null` when
   * none exists yet. Lets the client redirect to that run's results page
   * instead of always defaulting to Configure — the fix for "navigating to
   * Multi-Agent Review always starts a new run and never returns to the last
   * one" (this task's spec required returning to the latest run, AC-29's
   * intent extended from per-PR to the repo-level nav entry point).
   */
  async latestForRepo(workspaceId: string, repoId: string): Promise<{ pr_number: number } | null> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const prNumber = await this.repo.getLatestPrNumberForRepo(workspaceId, repoId);
    return prNumber != null ? { pr_number: prNumber } : null;
  }

  // ===========================================================================
  // Estimates (AC-3, AC-4, AC-5, AC-6)
  // ===========================================================================

  /** One estimate per workspace agent: avg past duration/cost (all PRs) +
   *  this agent's latest review summary on THIS PR, if any. */
  async estimatesForPr(workspaceId: string, prId: string): Promise<AgentEstimate[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const agents = await this.container.agentsRepo.list(workspaceId);
    const estimates: AgentEstimate[] = [];
    for (const agent of agents) {
      const stats = await this.repo.agentRunStatsForEstimate(workspaceId, agent.id);
      const summary = await this.repo.latestReviewSummaryForAgentOnPr(workspaceId, agent.id, prId);
      estimates.push(buildAgentEstimate(agent, stats, summary));
    }
    return estimates;
  }
}
