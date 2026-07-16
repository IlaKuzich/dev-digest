/* hooks/blast.ts — React Query hook for Blast Radius (L04): which downstream
   callers, endpoints, and crons are impacted by this PR's changed symbols,
   served entirely from the pre-built repo-intel index (zero analysis at
   review time). Mirrors hooks/smart-diff.ts and hooks/intent.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
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

/** GET /pulls/:id/blast response — BlastRadius plus the index state that
    drives the honest-degradation badge. */
export type BlastResponse = BlastRadius & { index_state: BlastIndexState };

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
