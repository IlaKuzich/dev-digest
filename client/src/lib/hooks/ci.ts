/* hooks/ci.ts — Export-to-CI (Section B/C) + CI Runs (Section D) hooks.
   One hook per concern (client-project-structure: TanStack Query for all
   server state). `useExportCiZip` is a deliberate exception to `api.post` —
   `action:"files"` returns `application/zip`, and `api.ts`'s `apiFetch` always
   calls `res.json()` on success, so a bespoke `fetch` reads a Blob instead. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE, ApiError } from "../api";
import type {
  CiExport,
  CiExportInputBody,
  CiFile,
  CiInstallationsResponse,
  CiRefreshResult,
  CiRunsQuery,
  CiRunsResponse,
} from "@devdigest/shared";

/** `GET /agents/:id/ci-installations` — CI tab installation rows + count. */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallationsResponse>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}

/** Response of `POST /agents/:id/export-ci` with `action:"preview"`. */
export interface CiExportPreview {
  files: CiFile[];
}

export interface ExportCiPreviewArgs {
  agentId: string;
  input: Omit<CiExportInputBody, "action">;
}

/** Preview step (AC-10/46) — fetches the live generated bundle, no side effects. */
export function useExportCiPreview() {
  return useMutation({
    mutationFn: ({ agentId, input }: ExportCiPreviewArgs) =>
      api.post<CiExportPreview>(`/agents/${agentId}/export-ci`, { ...input, action: "preview" }),
  });
}

export interface ExportCiInstallArgs {
  agentId: string;
  input: Omit<CiExportInputBody, "action">;
}

/** Install step, "Open a PR" option (AC-14/16) — creates/updates the CI
 *  installation and opens a PR carrying `workflow_yml` when the user edited it. */
export function useExportCiInstall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, input }: ExportCiInstallArgs) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, { ...input, action: "open_pr" }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["ci-installations", vars.agentId] });
    },
  });
}

export interface ExportCiZipArgs {
  agentId: string;
  input: Omit<CiExportInputBody, "action">;
}

/** Install step, "Copy files as a zip" option — `action:"files"` returns
 *  `application/zip`, which `api.ts` cannot parse (it always calls
 *  `res.json()`), so this reads the response as a Blob and triggers a
 *  browser download directly. No installation is created (AC-16). */
export function useExportCiZip() {
  return useMutation({
    mutationFn: async ({ agentId, input }: ExportCiZipArgs) => {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/agents/${agentId}/export-ci`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...input, action: "files" }),
        });
      } catch (e) {
        throw new ApiError(`Cannot reach the DevDigest engine at ${API_BASE}.`, 0, "network_error", e);
      }
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try {
          const body = await res.json();
          if (body?.error?.message) message = body.error.message;
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(message, res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "devdigest-ci.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { ok: true as const };
    },
  });
}

export interface UpdateCiConfigArgs {
  agentId: string;
  patch: Record<string, unknown>;
}

/** "Update CI config" (AC-17/43) — re-exports config to already-installed repos. */
export function useUpdateCiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, patch }: UpdateCiConfigArgs) =>
      api.post<CiInstallationsResponse>(`/agents/${agentId}/ci-config`, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["ci-installations", vars.agentId] });
    },
  });
}

/** `GET /ci-runs` with server-applied filters (AC-21). No `refetchInterval` —
 *  zero background polling is a hard requirement (AC-27); `refetchOnMount`
 *  re-syncs whenever the page is (re)visited instead. */
export function useCiRuns(filters: CiRunsQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ["ci-runs", filters],
    queryFn: () => api.get<CiRunsResponse>(`/ci-runs${qs ? `?${qs}` : ""}`),
    refetchOnMount: "always",
  });
}

/** Manual "Refresh" button (AC-27/34) — ingests new CI Actions artifacts. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci-runs/refresh"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci-runs"] }),
  });
}
