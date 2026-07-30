/* hooks/eval-capture.ts — "Turn into eval case" finding action (Surface A).
   Freezes a decided finding into a reusable eval case (server derives
   must_find/must_not_flag from accept/dismiss state). Does NOT touch the
   finding's own accept/dismiss timestamps (AC-5) — no query invalidation
   of the reviews cache here. Errors surface via the global mutation-error
   toast (lib/providers.tsx); only the success toast is bespoke. */
"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "../api";
import { notify } from "../toast";
import type { EvalCase } from "@devdigest/shared";

export function useCaptureEvalCase() {
  const t = useTranslations("eval");
  return useMutation({
    mutationFn: (findingId: string) =>
      api.post<EvalCase>(`/findings/${findingId}/eval-case`),
    onSuccess: () => notify.success(t("capture.success")),
  });
}
