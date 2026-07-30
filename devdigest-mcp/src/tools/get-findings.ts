/**
 * `get_findings` — fetch the concise verdict/findings for an already-completed
 * review run. The backing API reads findings per-PR (`GET /pulls/:id/reviews`),
 * not per-run globally, so this tool requires `repo`+`pr` (optionally narrowed
 * by `run_id`); a lone `run_id` is rejected with a leads-forward error.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolError, runNotFound, toToolResult } from '../errors.js';
import { getFindingsOutputShape, getFindingsShape } from '../schemas.js';
import { guardCharacterLimit, paginate, trimFinding, type FindingLike } from '../trim.js';
import type { ToolDeps, ToolModule } from '../types.js';

const GET_FINDINGS_DESCRIPTION =
  'Get the concise verdict and findings for an already-completed review run. Pass run_id, or ' +
  'repo+pr to take the latest run for that PR. Returns {verdict, findings[]} trimmed to ' +
  '{id, severity, title, file, line}.';

type ReviewDtoFinding = FindingLike;

interface ReviewDto {
  run_id: string | null;
  verdict: string | null;
  score: number | null;
  findings: ReviewDtoFinding[];
}

export const registerGetFindings: ToolModule = (server, deps: ToolDeps) => {
  server.registerTool(
    'get_findings',
    {
      title: 'Get findings',
      description: GET_FINDINGS_DESCRIPTION,
      inputSchema: getFindingsShape,
      outputSchema: getFindingsOutputShape,
    },
    async (args) => {
      try {
        const { run_id, repo, pr, limit, offset } = args;

        if (repo == null || pr == null) {
          throw new ToolError(
            '"get_findings" needs "repo" and "pr" together — the API reads findings per pull ' +
              'request, not per run id globally. Call get_findings({ repo: "owner/name", pr: ' +
              '<number> }), optionally adding "run_id" to pick one run\'s review. If no review ' +
              'exists yet, call "run_agent_on_pr" first.',
          );
        }

        const repoId = await deps.resolve.repoId(repo);
        const prId = await deps.resolve.prId(repoId, pr);
        const reviews = await deps.http.get<ReviewDto[]>(`/pulls/${prId}/reviews`);

        const review = run_id ? reviews.find((r) => r.run_id === run_id) : reviews[0];
        if (!review) {
          if (run_id) throw runNotFound(run_id);
          throw new ToolError(
            `No reviews found for PR #${pr} in "${repo}" yet — call "run_agent_on_pr" to start one.`,
          );
        }

        const trimmedFindings = review.findings.map(trimFinding);
        const { items, has_more } = paginate(trimmedFindings, limit, offset);

        const payload = guardCharacterLimit({
          verdict: review.verdict,
          score: review.score,
          findings: items,
          has_more,
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
