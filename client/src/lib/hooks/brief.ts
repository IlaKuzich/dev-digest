/* hooks/brief.ts — React Query hooks for the Why+Risk Brief: a single
   assembled what/why/risk_level/risks/review_focus summary at the top of the
   PR Overview tab. Mirrors hooks/intent.ts.

   GET returns a `BriefEnvelope | null` — `null` means no cache exists yet, in
   which case the caller (PrBriefCard) auto-generates once via
   useRegenerateBrief. The SAME POST endpoint serves both that first-open
   auto-generation and the user-triggered Regenerate action; the server
   coalesces concurrent calls per PR (AC-25), so this hook does not need its
   own dedupe beyond the card's own "fired once" guard. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { BriefEnvelope } from "@devdigest/shared";

/** GET /pulls/:id/brief → cached brief envelope, or `null` if none has been
    generated yet. Pure cache read — never triggers generation itself. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["brief", prId],
    queryFn: () => api.get<BriefEnvelope | null>(`/pulls/${prId}/brief`),
    enabled: prId != null,
  });
}

/** POST /pulls/:id/brief → generates (or regenerates) the brief and writes it
    straight into the `["brief", prId]` cache entry, so the card re-renders
    with the fresh envelope without a second GET round-trip. */
export function useRegenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BriefEnvelope>(`/pulls/${prId}/brief`),
    onSuccess: (env) => qc.setQueryData(["brief", prId], env),
  });
}
