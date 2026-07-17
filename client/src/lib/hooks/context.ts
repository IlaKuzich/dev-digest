/* hooks/context.ts — React Query hooks for the Project Context feature: the
   discovery page (T5 — ProjectContextView) and the agent/skill Context tab
   (T6 — ContextAttachTab). All server state for this feature flows through
   here; no component calls fetch/api.ts directly (client-project-structure).
   Types are inferred from the vendored contract, never redefined locally. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContextAttachment,
  ContextDocContent,
  ContextDocsResponse,
  SetContextBody,
} from "@devdigest/shared";

/** GET /repos/:repoId/context-docs → every discovered Markdown document under
    the repo's configured roots, plus the last-synced clone marker (AC-1, AC-2,
    AC-4, AC-26). */
export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-docs", repoId],
    queryFn: () => api.get<ContextDocsResponse>(`/repos/${repoId}/context-docs`),
    enabled: !!repoId,
  });
}

/** GET /repos/:repoId/context-docs/content?path= → read-only rendered
    content for the Preview affordance (AC-6). Disabled until a path is
    selected. */
export function useContextDocContent(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: ["context-doc-content", repoId, path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context-docs/content?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** GET /agents/:id/context → the agent's stored attachment set (path, order,
    attached), mirrors `useAgentSkills`. */
export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<ContextAttachment[]>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

/** POST /agents/:id/context → persist the full ordered attachment set for an
    agent (paths + order + attached only — never text, AC-10). */
export function useSetAgentContext(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetContextBody) =>
      api.post<ContextAttachment[]>(`/agents/${agentId}/context`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-context", agentId] });
    },
  });
}

/** GET /skills/:id/context → the skill's stored attachment set, inherited by
    every agent with that skill enabled (AC-11). */
export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<ContextAttachment[]>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/** POST /skills/:id/context → persist the full ordered attachment set for a
    skill (paths + order + attached only, AC-11). */
export function useSetSkillContext(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetContextBody) =>
      api.post<ContextAttachment[]>(`/skills/${skillId}/context`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-context", skillId] });
    },
  });
}
