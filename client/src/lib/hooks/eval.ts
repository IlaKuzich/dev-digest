/* hooks/eval.ts — React Query hooks for Surfaces C & D: the standalone Eval
   Dashboard home (/eval) and the per-agent Eval detail page (/eval/:agentId).

   NOTE: a same-named thin `useAgentEvalDashboard` also lives in T6's
   `eval-cases.ts` (the Agent editor's Evals tab) — that is a DELIBERATE
   duplication in a distinct file (this task owns only this file), not a bug;
   both hooks call the same `GET /agents/:id/eval-dashboard` endpoint. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  AgentEvalDashboard,
  EvalBatchResult,
  EvalBatchRun,
  EvalCompare,
  EvalDashboardHome,
  EvalPromoteInput,
} from "@devdigest/shared";

/** `GET /eval-dashboard` — cross-agent dashboard home (AC-18/19). */
export function useEvalDashboardHome() {
  return useQuery({
    queryKey: ["eval-dashboard-home"],
    queryFn: () => api.get<EvalDashboardHome>("/eval-dashboard"),
  });
}

/** `POST /eval/run-all` — Run all agents (AC-20). */
export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/eval/run-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-dashboard-home"] });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["eval-batches"] });
    },
  });
}

/**
 * `GET /agents/:id/eval-dashboard` — per-agent detail; feeds the Eval detail
 * page (Surface D, AC-23/24/25).
 */
export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-eval-dashboard", agentId],
    queryFn: () => api.get<AgentEvalDashboard>(`/agents/${encodeURIComponent(agentId!)}/eval-dashboard`),
    enabled: !!agentId,
  });
}

/** `GET /agents/:id/eval-runs` — batch-run rows for the Recent runs table (AC-24). */
export function useEvalBatches(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batches", agentId],
    queryFn: () => api.get<EvalBatchRun[]>(`/agents/${encodeURIComponent(agentId!)}/eval-runs`),
    enabled: !!agentId,
  });
}

/**
 * `GET /agents/:id/eval-runs/compare?a=&b=` — Compare modal (AC-27/28).
 * Enabled only once both batch ids are set, alongside the agent id.
 */
export function useEvalCompare(
  agentId: string | null | undefined,
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return useQuery({
    queryKey: ["eval-compare", agentId, a, b],
    queryFn: () =>
      api.get<EvalCompare>(
        `/agents/${encodeURIComponent(agentId!)}/eval-runs/compare?a=${encodeURIComponent(a!)}&b=${encodeURIComponent(b!)}`,
      ),
    enabled: !!agentId && !!a && !!b,
  });
}

/**
 * `POST /agents/:id/promote` — forward-only re-apply of a past version's
 * config as the new highest version (AC-29). On success, invalidate every
 * place the active version is shown (AC-30).
 */
export function usePromoteVersion(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalPromoteInput) =>
      api.post<Agent>(`/agents/${encodeURIComponent(agentId!)}/promote`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard-home"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
  });
}

/** `POST /agents/:id/eval-runs` — Run eval for one agent (detail page action). */
export function useRunAgentEval(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalBatchResult>(`/agents/${encodeURIComponent(agentId!)}/eval-runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard-home"] });
    },
  });
}
