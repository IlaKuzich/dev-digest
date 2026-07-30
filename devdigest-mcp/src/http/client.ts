/**
 * Thin fetch wrapper over the DevDigest Fastify API (`API_URL`).
 *
 * Never writes to stdout — stdout is reserved for MCP JSON-RPC framing.
 * Any diagnostics go to stderr via `console.error`.
 */
import { API_URL } from '../config.js';
import { ToolError, serverUnreachable } from '../errors.js';

export interface HttpClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

async function toErrorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.length > 0 ? text : res.statusText;
  } catch {
    return res.statusText;
  }
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const url = `${baseUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    console.error(`[devdigest-mcp] network error calling ${url}:`, err);
    throw serverUnreachable(baseUrl);
  }

  if (!res.ok) {
    const detail = await toErrorText(res);
    throw new ToolError(
      `DevDigest API request failed: ${init.method} ${path} → ${res.status} ${res.statusText}. ` +
        `${detail ? `Response: ${detail}. ` : ''}` +
        `Check that the DevDigest server is running and reachable at ${baseUrl}.`,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Build an `HttpClient` bound to `baseUrl` (defaults to `API_URL`). */
export function makeHttpClient(baseUrl: string = API_URL): HttpClient {
  return {
    get<T>(path: string): Promise<T> {
      return request<T>(baseUrl, path, { method: 'GET' });
    },
    post<T>(path: string, body?: unknown): Promise<T> {
      return request<T>(baseUrl, path, { method: 'POST', body });
    },
  };
}
