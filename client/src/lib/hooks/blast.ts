/* hooks/blast.ts — React Query hook for Blast Radius (L04): which downstream
   callers, endpoints, and crons are impacted by this PR's changed symbols,
   served entirely from the pre-built repo-intel index (zero analysis at
   review time). Mirrors hooks/smart-diff.ts and hooks/intent.ts. */
"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

/** Subset of the server's repo-intel IndexState the degradation badge needs
    (kept local — not in @devdigest/shared, since repo-intel types live
    server-side). Mirrors the RepoIntelState precedent, hooks/repo-intel.ts:12-24. */
export interface BlastIndexState {
  status: "full" | "partial" | "degraded" | "failed";
  filesIndexed: number;
  filesSkipped: number;
  degraded?: boolean;
  degradedReason?: string;
}

/** One prior PR that touched a file this PR also changes — the history half
    of "what can this break". Server-side this comes from `pr_files`, already
    workspace-scoped. Kept local for the same reason as BlastIndexState. */
export interface PriorPr {
  id: string;
  number: number;
  title: string;
  author: string | null;
  merged_at: string | null;
}

/** GET /pulls/:id/blast response — BlastRadius plus the index state that
    drives the honest-degradation badge, plus prior PRs on the same files.
    Outer keys stay snake_case to match the contract. */
/** How much of the PR the map can speak about. The index snapshots the default
    branch, so files this PR creates yield no symbols — not a degraded index,
    but a caveat the reader needs so a big PR with a small map isn't misread as
    "nothing is affected". */
export interface BlastCoverage {
  changed_code_files: number;
  analyzed_files: number;
  unanalyzed_files: string[];
}

export type BlastResponse = BlastRadius & {
  index_state: BlastIndexState;
  prior_prs: PriorPr[];
  coverage: BlastCoverage;
};

/** GET /pulls/:id/blast → blast radius map (changed symbols → downstream
    callers/endpoints/crons) + the index state behind it. No analysis runs on
    this path — the server only reads the pre-built repo-intel index. */
export function useBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastResponse>(`/pulls/${prId}/blast`),
    enabled: prId != null,
  });
}

/** POST /pulls/:id/blast/explain → optional, user-triggered one-paragraph
    summary of the map above. Never fires automatically; the GET /blast read
    path stays LLM-free regardless of this mutation. Mirrors useDeriveIntent
    (hooks/intent.ts:17-23). */
export function useExplainBlast(prId: string | null | undefined) {
  return useMutation({
    mutationFn: () => api.post<{ summary: string }>(`/pulls/${prId}/blast/explain`),
  });
}
