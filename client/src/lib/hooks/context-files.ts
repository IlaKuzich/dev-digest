/* hooks/context-files.ts — React Query hooks for project context (spec) files. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchContextFiles,
  reindexContext,
  updateAgentContextPaths,
  updateSkillContextPaths,
} from "../api";
import type { SpecFile, ContextSummary, Agent, Skill } from "@devdigest/shared";

export type { SpecFile, ContextSummary };

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery<SpecFile[]>({
    queryKey: ["context", repoId],
    queryFn: () => fetchContextFiles(repoId!),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation<ContextSummary, Error, string>({
    mutationFn: (repoId: string) => reindexContext(repoId),
    onSuccess: (_data, repoId) =>
      qc.invalidateQueries({ queryKey: ["context", repoId] }),
  });
}

export function useUpdateAgentContextPaths() {
  const qc = useQueryClient();
  return useMutation<Agent, Error, { id: string; paths: string[] }>({
    mutationFn: ({ id, paths }) => updateAgentContextPaths(id, paths),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useUpdateSkillContextPaths() {
  const qc = useQueryClient();
  return useMutation<Skill, Error, { id: string; paths: string[] }>({
    mutationFn: ({ id, paths }) => updateSkillContextPaths(id, paths),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}
