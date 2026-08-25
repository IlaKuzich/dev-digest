/* hooks/eval-capture.ts — "Turn into eval case" finding action (Surface A).
   Fetches a PREVIEW of what capturing a decided finding would produce
   (server derives must_find/must_not_flag from accept/dismiss state) without
   persisting anything — the caller opens `EvalCaseEditorModal` pre-filled
   with the result, and the actual eval_cases row is only written when the
   user hits Save inside that modal (via the normal create-case path). Does
   NOT touch the finding's own accept/dismiss timestamps (AC-5). */
"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCaseDraft } from "@devdigest/shared";

export function useEvalCaseDraft() {
  return useMutation({
    mutationFn: (findingId: string) =>
      api.get<EvalCaseDraft>(`/findings/${findingId}/eval-case-draft`),
  });
}
