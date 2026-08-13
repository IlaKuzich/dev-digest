/* hooks/brief.ts — React Query hooks for the PR Brief (L07: risk-level
   headline + summary + review focus), mirrors hooks/intent.ts. The cached
   read is a bodyless POST (server route: single POST serves both read and
   recompute, per spec Contracts) — `api.get` cannot POST, so both the read
   and the mutation go through `api.post`. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Brief } from "@devdigest/shared";

/** Cached read — no `regenerate` flag, so the server returns the persisted
   Brief (or null if none has been generated yet) with NO new LLM call. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["brief", prId],
    queryFn: () => api.post<Brief | null>(`/pulls/${prId}/brief`),
    enabled: prId != null,
  });
}

/** Forces one structured LLM call and overwrites the cache. Serves both the
   empty-state "Generate" action and the populated "Regenerate" control. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Brief>(`/pulls/${prId}/brief`, { regenerate: true }),
    onSuccess: (data) => {
      qc.setQueryData(["brief", prId], data);
      qc.invalidateQueries({ queryKey: ["brief", prId] });
    },
  });
}
