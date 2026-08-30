/* hooks/multi-agent-results.ts — data hooks for the Multi-Agent Review
   RESULTS page (T4): the run itself + per-agent full findings for Tabs-mode
   detail. Kept in its own file, separate from T3's `lib/hooks/multi-agent.ts`
   (the entry-point hooks), to preserve disjoint file ownership between the
   two parallel client tasks (see docs/plans/multi-agent-review.md). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { usePrReviews } from "./reviews";
import type { FindingRecord, MultiAgentRun, MultiAgentRunSummary } from "@devdigest/shared";

/**
 * GET /pulls/:id/multi-agent — the PR's LATEST multi-agent run (columns +
 * conflicts + totals). The results route is keyed on the PR number only
 * (AC-29): there is no run-id in the URL, the server always resolves the
 * newest `multi_agent_runs` row for the PR, so a reload always shows the
 * same (latest) run. Polls while any column is still executing so a
 * running/failed transition is picked up without a manual refresh (AC-14).
 */
/**
 * GET /repos/:id/multi-agent/latest — the repo's most recently-run
 * multi-agent run's PR number, or `null` when it has never had one. Backs
 * the repo-level "Multi-Agent Review" nav landing (`/repos/:repoId/multi-
 * agent`, no PR number in the URL) so navigating there returns to the last
 * run instead of always forcing a brand-new one — see
 * `app/repos/[repoId]/multi-agent/page.tsx`.
 */
export function useLatestMultiAgentRunForRepo(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-latest", repoId],
    queryFn: () => api.get<{ pr_number: number } | null>(`/repos/${repoId}/multi-agent/latest`),
    enabled: !!repoId,
  });
}

/**
 * `runId` optionally views one specific historical run instead of the PR's
 * latest (the "Previous Runs" follow-on, 2026-08-27) — omit it for the
 * default latest-per-PR behavior (AC-29).
 */
export function useMultiAgentRun(prId: string | null | undefined, runId?: string | null) {
  return useQuery({
    queryKey: ["multi-agent-run", prId, runId ?? null],
    queryFn: () =>
      api.get<MultiAgentRun>(
        runId ? `/pulls/${prId}/multi-agent/runs/${runId}` : `/pulls/${prId}/multi-agent`,
      ),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.status === "running") ? 3000 : false,
  });
}

/**
 * Every past multi-agent run anywhere in a REPO, newest-first — backs the
 * "Previous Runs" list page (2026-08-27 follow-on; requester decision:
 * repo-wide across all the repo's PRs, not scoped to one PR — each row
 * carries its own `pr_number`/`pr_title`).
 */
export function useMultiAgentRunHistory(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-history", repoId],
    queryFn: () => api.get<MultiAgentRunSummary[]>(`/repos/${repoId}/multi-agent/history`),
    enabled: !!repoId,
  });
}

/**
 * Full `FindingRecord`s per agent run, indexed by `run_id`, for Tabs-mode
 * expandable finding cards (AC-17/AC-18). `AgentColumnFinding` (the shape
 * embedded in `MultiAgentRun.columns[].findings`) deliberately carries no
 * `confidence`/`rationale`/`suggestion` — the plan's resolved gap (R1) is to
 * fetch full `FindingRecord`s separately rather than extend that contract.
 * Reuses the PR's persisted reviews (`usePrReviews`, one row per run, already
 * used by the PR detail page) instead of a second bespoke endpoint — each
 * multi-agent column's `run_id` is exactly one `ReviewRecord.run_id`.
 */
export function useRunFindings(
  prId: string | null | undefined,
): Record<string, FindingRecord[]> {
  const { data: reviews } = usePrReviews(prId);
  const byRun: Record<string, FindingRecord[]> = {};
  for (const review of reviews ?? []) {
    if (review.run_id) byRun[review.run_id] = review.findings;
  }
  return byRun;
}
