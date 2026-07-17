/* hooks/intent.ts — React Query hooks for PR Intent (L03: derived motivation +
   scope), mirrors hooks/conventions.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Intent } from "@devdigest/shared";

export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: () => api.get<Intent | null>(`/pulls/${prId}/intent`),
    enabled: prId != null,
  });
}

export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Intent>(`/pulls/${prId}/intent/derive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intent", prId] }),
  });
}
