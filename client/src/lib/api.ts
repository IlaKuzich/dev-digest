/* api.ts — typed fetch client for the F1 Fastify engine (localhost:3001).
   All hooks build on `apiFetch`. Errors are normalized to ApiError so the
   error-UX taxonomy (toast/inline/full-screen) can branch on status. */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        // Only declare a JSON body when one is actually sent — otherwise a
        // body-less POST/PUT (e.g. tour generate, refresh, reindex) trips
        // Fastify's "Body cannot be empty when content-type is application/json".
        ...(init?.body != null ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // network failure / API down → full-screen error candidate
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e,
    );
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

// ---- domain helpers -------------------------------------------------------

import type {
  SmartDiff,
  SpecFile,
  ContextSummary,
  Agent,
  Skill,
  Brief,
} from "@devdigest/shared";

export function fetchSmartDiff(prId: string): Promise<SmartDiff> {
  return api.get<SmartDiff>(`/pulls/${prId}/smart-diff`);
}

// ---- PR Why+Risk Brief -----------------------------------------------------

export function postPrBrief(
  prId: string,
  opts?: { force?: boolean },
): Promise<Brief> {
  const url = opts?.force
    ? `/pulls/${prId}/brief?force=true`
    : `/pulls/${prId}/brief`;
  return api.post<Brief>(url);
}

// ---- context / project docs -----------------------------------------------

export function fetchContextFiles(repoId: string): Promise<SpecFile[]> {
  return api.get<SpecFile[]>(`/repos/${repoId}/context`);
}

export function reindexContext(repoId: string): Promise<ContextSummary> {
  return api.post<ContextSummary>(`/repos/${repoId}/context/reindex`);
}

// ---- agent / skill context doc paths ---------------------------------------

export function updateAgentContextPaths(
  id: string,
  paths: string[],
): Promise<Agent> {
  return api.put<Agent>(`/agents/${id}`, { context_doc_paths: paths });
}

export function updateSkillContextPaths(
  id: string,
  paths: string[],
): Promise<Skill> {
  return api.put<Skill>(`/skills/${id}`, { context_doc_paths: paths });
}
