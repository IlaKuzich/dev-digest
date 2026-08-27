/* hooks/multi-agent.ts — entry-point hooks for the Multi-Agent Review picker
   (PR page) and the Configure-run screen (T3): per-agent estimates + the
   trigger mutation. Kept separate from `lib/hooks/multi-agent-results.ts`
   (T4, the results page) to preserve disjoint file ownership between the two
   parallel client tasks (see docs/plans/multi-agent-review.md). */
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "../api";
import type { MultiAgentRun, MultiAgentRunRequest } from "@devdigest/shared";

/**
 * Per-agent estimate for the picker / Configure-run screen.
 *
 * `GET /pulls/:id/agent-estimates` is a T2 (server) route that may not be
 * landed yet when this hook is authored — typed defensively per client
 * INSIGHTS 2026-07-28 ("local extended type in the owned hook file, document
 * the assumption") rather than blocking on the parallel server task. Shape
 * follows the plan's T2 step 4: avg `duration_ms`/`cost_usd` over the agent's
 * OWN past runs across all PRs (AC-4); `avg_duration_ms`/`avg_cost_usd` are
 * `null` (not zero) when `runs === 0` (AC-5, "no history yet"); `summary`
 * is the agent's latest review summary for the SELECTED pr, `null` when it
 * has never reviewed this PR (AC-6). Field names confirmed against the
 * landed server shape (`server/src/modules/reviews/multi-agent.helpers.ts`
 * `AgentEstimate`) — this was `pr_summary` here until an architecture
 * review caught the mismatch (2026-08-26): the server always emits
 * `summary`, so the per-PR summary silently read as `undefined` on every
 * card. Keep this interface's field names in lockstep with the server's
 * until both are replaced by one shared Zod contract (follow-up, not done
 * here — see the plan's architecture-review notes).
 */
export interface AgentEstimate {
  agent_id: string;
  agent_name: string;
  runs: number;
  avg_duration_ms: number | null;
  avg_cost_usd: number | null;
  summary: string | null;
}

/** GET /pulls/:id/agent-estimates — every workspace agent's time/cost
   estimate + latest per-PR summary, read by both entry points. */
export function useAgentEstimates(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-estimates", prId],
    queryFn: () => api.get<AgentEstimate[]>(`/pulls/${prId}/agent-estimates`),
    enabled: !!prId,
  });
}

export interface TriggerMultiAgentRunInput {
  prId: string;
  repoId: string;
  /** The PR's number (not its uuid) — the results route is keyed on it. */
  prNumber: number;
  agentIds: string[];
}

/** POST /pulls/:id/multi-agent-run — fan out the selected agent set over one
   PR (AC-10, AC-30 for N===1), then navigate to the results page. */
export function useTriggerMultiAgentRun() {
  const router = useRouter();
  return useMutation({
    mutationFn: ({ prId, agentIds }: TriggerMultiAgentRunInput) =>
      api.post<MultiAgentRun>(`/pulls/${prId}/multi-agent-run`, {
        agent_ids: agentIds,
      } satisfies MultiAgentRunRequest),
    onSuccess: (_data, vars) => {
      router.push(`/repos/${vars.repoId}/multi-agent/${vars.prNumber}`);
    },
  });
}
