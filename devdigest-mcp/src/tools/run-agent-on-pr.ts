/**
 * `run_agent_on_pr` — design principle 1, "Result, not operation": one call
 * creates the run, waits for it, and returns the finished `{ verdict,
 * findings[] }` (or a `{ status: 'running', run_id }` partial on timeout so
 * the model can follow up with `get_findings`).
 *
 * No `outputSchema` is declared (per the plan) — the response is a
 * `running | result` union and keeping it schema-free keeps that union
 * simple; `structuredContent` is still returned as a convenience so the
 * caller doesn't have to re-parse the text content.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { POLL_INTERVAL_MS, RUN_TIMEOUT_MS } from '../config.js';
import { ToolError, toToolResult } from '../errors.js';
import { runAgentShape } from '../schemas.js';
import { trimFinding, guardCharacterLimit, type FindingLike } from '../trim.js';
import type { HttpClient, ToolDeps, ToolModule } from '../types.js';

const RUN_AGENT_ON_PR_DESCRIPTION =
  "Run one review agent on a pull request and return the finished result in a single call — " +
  "creates the run, waits for it, and returns {verdict, findings[]}. Flat args: repo " +
  "(owner/name), pr (number), agent (id or name from list_agents). On timeout returns " +
  "{status:'running', run_id} — fetch later with get_findings.";

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

interface StartReviewResponse {
  runs: { run_id: string }[];
}

interface RunSummary {
  run_id: string;
  status: string;
}

type ReviewDtoFinding = FindingLike;

interface ReviewDto {
  run_id: string | null;
  verdict: string | null;
  findings: ReviewDtoFinding[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `GET /pulls/:prId/runs` until `runId` leaves 'running' or `timeoutMs` elapses. */
async function waitForRun(
  http: HttpClient,
  prId: string,
  runId: string,
  timeoutMs: number,
): Promise<{ timedOut: boolean }> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const runs = await http.get<RunSummary[]>(`/pulls/${prId}/runs`);
    const target = runs.find((r) => r.run_id === runId);
    if (target && TERMINAL_STATUSES.has(target.status)) {
      return { timedOut: false };
    }
    if (Date.now() >= deadline) {
      return { timedOut: true };
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export const registerRunAgentOnPr: ToolModule = (server, deps: ToolDeps) => {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run agent on PR',
      description: RUN_AGENT_ON_PR_DESCRIPTION,
      inputSchema: runAgentShape,
    },
    async (args) => {
      try {
        const { repo, pr, agent, timeout_ms } = args;

        const repoId = await deps.resolve.repoId(repo);
        const prId = await deps.resolve.prId(repoId, pr);
        const agentId = await deps.resolve.agentId(agent);

        const started = await deps.http.post<StartReviewResponse>(`/pulls/${prId}/review`, {
          agentId,
        });
        const runId = started.runs[0]?.run_id;
        if (!runId) {
          throw new ToolError(
            `Starting the review for PR #${pr} in "${repo}" did not return a run id — retry ` +
              `"run_agent_on_pr", or check the DevDigest server logs.`,
          );
        }

        const { timedOut } = await waitForRun(deps.http, prId, runId, timeout_ms ?? RUN_TIMEOUT_MS);
        if (timedOut) {
          const payload = { status: 'running' as const, run_id: runId };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
            structuredContent: payload,
          };
        }

        const reviews = await deps.http.get<ReviewDto[]>(`/pulls/${prId}/reviews`);
        const review = reviews.find((r) => r.run_id === runId);
        if (!review) {
          throw new ToolError(
            `Run "${runId}" finished but no review was found for it — call "get_findings" with ` +
              `"repo" and "pr" to list the reviews that do exist for this PR.`,
          );
        }

        const payload = guardCharacterLimit({
          verdict: review.verdict,
          findings: review.findings.map(trimFinding),
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      } catch (err) {
        return toToolResult(err) as CallToolResult;
      }
    },
  );
};
