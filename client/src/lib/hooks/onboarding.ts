"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Onboarding } from "@devdigest/shared";
import { postOnboarding, getOnboarding } from "../api";

/**
 * Fetches (and, server-side, generates-or-caches) the Onboarding Tour.
 * A POST that behaves like a query — the server owns cache invalidation by
 * headSha, so a plain (non-force) call is cheap once cached.
 * 404-aware retry: no onboarding yet is a valid, non-retryable state.
 */
export function useOnboarding(repoId: string | null | undefined) {
  return useQuery<Onboarding>({
    queryKey: ["onboarding", repoId],
    queryFn: () => postOnboarding(repoId!),
    enabled: repoId != null,
    staleTime: 10 * 60 * 1000,
    retry: (count, err: unknown) =>
      (err as { status?: number })?.status === 404 ? false : count < 2,
  });
}

/** Force-regenerates the Onboarding Tour regardless of cache state (Regenerate button). */
export function useRegenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postOnboarding(repoId!, { force: true }),
    onSuccess: (onboarding) => {
      qc.setQueryData(["onboarding", repoId], onboarding);
      qc.invalidateQueries({ queryKey: ["onboarding", repoId] });
    },
  });
}
