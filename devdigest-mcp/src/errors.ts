/**
 * Leads-forward tool errors (design principle 4 — "Error leads forward").
 * Every message names the next tool/step the model should take, not just
 * what went wrong.
 */

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** MCP tool result shape for a caught error — `isError: true`, text content. */
export interface ToolErrorResult {
  content: { type: 'text'; text: string }[];
  isError: true;
}

export function toToolResult(err: unknown): ToolErrorResult {
  const text = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

export function repoNotFound(slug: string): ToolError {
  return new ToolError(
    `Repo "${slug}" not found — call the API "GET /repos" (or add it via the web UI) first, ` +
      `then retry with the exact "owner/name" from the result.`,
  );
}

export function prNotFound(number: number, repo: string): ToolError {
  return new ToolError(
    `PR #${number} not found in repo "${repo}" — import it first (open the repo in the ` +
      `DevDigest web UI, or sync it via the API), then retry.`,
  );
}

export function agentNotFound(nameOrId: string): ToolError {
  return new ToolError(
    `Agent "${nameOrId}" not found — call "list_agents" to get valid agent ids/names, then retry.`,
  );
}

export function runNotFound(runId: string): ToolError {
  return new ToolError(
    `Run "${runId}" not found — call "run_agent_on_pr" to start a new run, or "get_findings" ` +
      `with "repo" and "pr" to list existing reviews for the PR.`,
  );
}

export function serverUnreachable(baseUrl: string): ToolError {
  return new ToolError(
    `Could not reach the DevDigest API at "${baseUrl}" — is the DevDigest server running ` +
      `("./scripts/dev.sh" or "cd server && pnpm dev")? If it runs on a different port, set ` +
      `the "DEVDIGEST_API_URL" environment variable and retry.`,
  );
}
