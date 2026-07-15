/* hooks/smart-diff.ts — React Query hook for the Smart Diff (reviewer-ordered
   diff layout): PR files grouped by role (core/wiring/boilerplate) with each
   file's active-finding line numbers. No LLM call on this path — the server
   only composes already-fetched PR files + already-persisted findings. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

/** Reviewer-ordered diff layout for a PR. Mirrors usePrReviews (reviews.ts:51). */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
