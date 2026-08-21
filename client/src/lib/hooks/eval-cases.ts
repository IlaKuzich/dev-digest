/* hooks/eval-cases.ts — Agent editor "Evals" tab (T6): per-agent eval case
   CRUD/run + the tile-feeding dashboard query. `useAgentEvalDashboard` also
   exists (identically shaped) in `lib/hooks/eval.ts` for the standalone
   dashboard pages (T7) — a deliberate thin-hook duplication to keep T6/T7
   file ownership disjoint; both wrap the same `GET /agents/:id/eval-dashboard`
   endpoint (see docs/plans/eval-pipeline.md T6 step 2). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentEvalDashboard, EvalBatchResult, EvalCase, EvalCaseInput, EvalRunResult } from "@devdigest/shared";

/**
 * `GET /agents/:id/eval-cases` response shape. The base `EvalCase` contract
 * (knowledge.ts) has no last-run fields, but AC-9/AC-10/AC-17 need a
 * pass/fail/never-run state and an "expected N, got M" summary per case — so
 * the list response embeds each case's most recent run (or `null` when the
 * case has never been run). This is a **local, non-contract assumption**
 * about T4's route shape (T4 runs in parallel); if the server settles on a
 * different envelope, only this type + `helpers.ts`'s readers need to change.
 */
export interface EvalCaseLastRun {
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  duration_ms: number | null;
  cost_usd: number | null;
  actual_output: unknown;
  ran_at: string;
}

export interface EvalCaseWithLastRun extends EvalCase {
  last_run: EvalCaseLastRun | null;
}

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseWithLastRun[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useCreateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export interface UpdateEvalCaseArgs {
  id: string;
  patch: EvalCaseInput;
}

/** No `agentId` arg (matches T7's disjoint hook file) — invalidates by the
    `["eval-cases"]` key prefix, which TanStack Query matches against every
    `["eval-cases", <anyAgentId>]` query. */
export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseArgs) => api.put<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases"] }),
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases"] }),
  });
}

/** Runs a single case (per-row ▷, "Run case", "Run on save"). */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalRunResult>(`/eval-cases/${caseId}/run`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases"] });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard"] });
    },
  });
}

export function useRunAllEvals(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalBatchResult>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard", agentId] });
    },
  });
}

/** Feeds the Evals tab's four metric tiles (AC-8), plus `.running` (server-
 *  tracked "Run all evals" in-flight state — survives a page reload). Polls
 *  every 3s while a batch is in flight so the button clears itself once the
 *  run finishes, even if this tab didn't fire the mutation that started it. */
export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-eval-dashboard", agentId],
    queryFn: () => api.get<AgentEvalDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });
}
