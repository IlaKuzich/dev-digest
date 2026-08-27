import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { FindingRow } from '../../../db/rows.js';

/**
 * A5 — multi-agent run data-access. The ONLY file querying the
 * `multi_agent_run_agents` link column and the per-agent estimate
 * aggregates (T1's join table + AC-4's `agent_runs` averages). Workspace
 * scoping mirrors the rest of `reviews/repository/*`: the parent
 * `multi_agent_runs` row carries its own `workspace_id`, so callers (the
 * service) validate the PR against the workspace first via
 * `ReviewRepository.getPull`, then every query here is additionally scoped
 * by `workspace_id`.
 */

type ReviewRow = typeof t.reviews.$inferSelect;

export interface MultiAgentRunRow {
  id: string;
  workspaceId: string;
  prId: string;
  ranAt: Date;
}

/** One child `agent_runs` row fanned out by a multi-agent trigger, joined with
 *  its agent's name (nullable — an agent can be deleted after the run ran). */
export interface MultiRunAgentRow {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  durationMs: number | null;
  /** `NUMERIC` → cast to `number` here (server INSIGHTS 2026-06-25). */
  costUsd: number | null;
  score: number | null;
  error: string | null;
  ranAt: Date;
}

export interface AgentRunEstimateStats {
  avgDurationMs: number | null;
  avgCostUsd: number | null;
  runs: number;
}

// ---- create + link (AC-12) -------------------------------------------------

/** Create the ONE `multi_agent_runs` parent row for a fan-out trigger. */
export async function createMultiAgentRun(db: Db, workspaceId: string, prId: string): Promise<string> {
  const [row] = await db
    .insert(t.multiAgentRuns)
    .values({ workspaceId, prId })
    .returning({ id: t.multiAgentRuns.id });
  return row!.id;
}

/** Attribute every `agent_runs` row a trigger fanned out to the ONE parent. */
export async function linkAgentRunsToParent(
  db: Db,
  runIds: string[],
  multiAgentRunId: string,
): Promise<void> {
  if (runIds.length === 0) return;
  await db
    .insert(t.multiAgentRunAgents)
    .values(runIds.map((agentRunId) => ({ multiAgentRunId, agentRunId })));
}

// ---- reads ------------------------------------------------------------------

/**
 * The newest `multi_agent_runs` row for a PR (AC-29 — latest-per-PR, not a
 * browsable history). Callers validate the PR belongs to the workspace via
 * `getPull` first; this additionally filters by `workspace_id` on the parent
 * row itself (it carries its own, per `schema/runs.ts`).
 */
export async function getLatestMultiAgentRunForPr(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<MultiAgentRunRow | undefined> {
  const [row] = await db
    .select({
      id: t.multiAgentRuns.id,
      workspaceId: t.multiAgentRuns.workspaceId,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
    })
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  return row;
}

/** One `multi_agent_runs` row plus the PR it belongs to — repo-wide "Previous
 *  Runs" list rows need to show which PR each run was against. */
export interface MultiAgentRunWithPrRow extends MultiAgentRunRow {
  prNumber: number;
  prTitle: string;
}

/**
 * Every `multi_agent_runs` row anywhere in a REPO, newest-first — the
 * "Previous Runs" follow-on (2026-08-27; requester decision: repo-wide, not
 * per-PR, so the list can show which PR each run belongs to). Caller
 * validates the repo against the workspace via `reposRepo.getById` first,
 * same pattern as `getLatestPrNumberForRepo`.
 */
export async function listMultiAgentRunsForRepo(
  db: Db,
  workspaceId: string,
  repoId: string,
): Promise<MultiAgentRunWithPrRow[]> {
  return db
    .select({
      id: t.multiAgentRuns.id,
      workspaceId: t.multiAgentRuns.workspaceId,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
    .orderBy(desc(t.multiAgentRuns.ranAt));
}

/**
 * One `multi_agent_runs` row by its own id, workspace-scoped — backs viewing
 * a specific historical run from "Previous Runs" (2026-08-27 follow-on). The
 * caller (service) additionally checks `row.prId` matches the PR in the URL,
 * so a run id for a different PR 404s the same as a cross-workspace one.
 */
export async function getMultiAgentRunById(
  db: Db,
  workspaceId: string,
  multiAgentRunId: string,
): Promise<MultiAgentRunRow | undefined> {
  const [row] = await db
    .select({
      id: t.multiAgentRuns.id,
      workspaceId: t.multiAgentRuns.workspaceId,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
    })
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, multiAgentRunId)))
    .limit(1);
  return row;
}

/**
 * The PR number of the most recently-run `multi_agent_runs` row anywhere in
 * this repo (across all PRs), for the repo-level nav landing to jump back to
 * "the last run" instead of always defaulting to Configure. `null` when the
 * repo has never had a multi-agent run. Joins through `pull_requests` for
 * both the repo scope and the PR number (the parent row only carries `pr_id`).
 */
export async function getLatestPrNumberForRepo(
  db: Db,
  workspaceId: string,
  repoId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ number: t.pullRequests.number })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(
      and(
        eq(t.multiAgentRuns.workspaceId, workspaceId),
        eq(t.pullRequests.repoId, repoId),
      ),
    )
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  return row?.number ?? null;
}

/** The child `agent_runs` for one multi-agent run, via the join table, joined
 *  with the agent's name for column/tab labels. Oldest-first (trigger order). */
export async function agentRunsForMultiRun(
  db: Db,
  multiAgentRunId: string,
): Promise<MultiRunAgentRow[]> {
  const rows = await db
    .select({
      runId: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      agentName: t.agents.name,
      provider: t.agentRuns.provider,
      model: t.agentRuns.model,
      status: t.agentRuns.status,
      durationMs: t.agentRuns.durationMs,
      costUsd: t.agentRuns.costUsd,
      score: t.agentRuns.score,
      error: t.agentRuns.error,
      ranAt: t.agentRuns.ranAt,
    })
    .from(t.multiAgentRunAgents)
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.multiAgentRunAgents.agentRunId))
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(eq(t.multiAgentRunAgents.multiAgentRunId, multiAgentRunId))
    .orderBy(asc(t.agentRuns.ranAt));
  return rows.map((r) => ({ ...r, costUsd: r.costUsd != null ? Number(r.costUsd) : null }));
}

/**
 * Full review + finding rows for a set of runs (via `reviews.run_id`), for
 * `FindingRecord` mapping (AC-18/AC-21) and conflict grouping. A run with no
 * persisted review (still running / failed before producing one) is simply
 * absent from the result.
 */
export async function findingsForRuns(
  db: Db,
  runIds: string[],
): Promise<{ review: ReviewRow; findings: FindingRow[] }[]> {
  if (runIds.length === 0) return [];
  const reviews = await db.select().from(t.reviews).where(inArray(t.reviews.runId, runIds));
  if (reviews.length === 0) return [];
  const reviewIds = reviews.map((r) => r.id);
  const findings = await db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds));
  return reviews.map((review) => ({
    review,
    findings: findings.filter((f) => f.reviewId === review.id),
  }));
}

/**
 * Average `duration_ms`/`cost_usd` over an agent's own `status='done'` runs,
 * across ALL pull requests (AC-4 — not scoped to the selected PR). `runs===0`
 * signals "no history yet" (AC-5) to the caller.
 */
export async function agentRunStatsForEstimate(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<AgentRunEstimateStats> {
  const rows = await db
    .select({ durationMs: t.agentRuns.durationMs, costUsd: t.agentRuns.costUsd })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.agentId, agentId),
        eq(t.agentRuns.status, 'done'),
      ),
    );
  const runs = rows.length;
  if (runs === 0) return { avgDurationMs: null, avgCostUsd: null, runs: 0 };

  const durations = rows.flatMap((r) => (r.durationMs != null ? [r.durationMs] : []));
  const costs = rows.flatMap((r) => (r.costUsd != null ? [Number(r.costUsd)] : []));
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const avgCostUsd = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  return { avgDurationMs, avgCostUsd, runs };
}

/** The agent's most recent `kind='review'` summary for this specific PR, or
 *  `null` when it has never reviewed this PR (AC-6 — neutral placeholder). */
export async function latestReviewSummaryForAgentOnPr(
  db: Db,
  workspaceId: string,
  agentId: string,
  prId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ summary: t.reviews.summary })
    .from(t.reviews)
    .where(
      and(
        eq(t.reviews.workspaceId, workspaceId),
        eq(t.reviews.agentId, agentId),
        eq(t.reviews.prId, prId),
        eq(t.reviews.kind, 'review'),
      ),
    )
    .orderBy(desc(t.reviews.createdAt))
    .limit(1);
  return row?.summary ?? null;
}
