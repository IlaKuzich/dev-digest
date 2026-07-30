/**
 * `get_conventions` — a repository's extracted house conventions. Flat arg
 * (`repo`), resolved to an internal repo id via `deps.resolve.repoId`
 * (already leads-forward on failure — see `src/errors.ts` `repoNotFound`).
 * Trims each `ConventionCandidate` row down to
 * `{rule, evidence_path, confidence, accepted}` (design principle 3), with
 * `accepted` DERIVED from the real `status: 'candidate'|'accepted'|'rejected'`
 * field — the API never returns a raw `accepted` boolean
 * (`server/src/vendor/shared/contracts/knowledge.ts:186`).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toToolResult } from '../errors.js';
import { getConventionsOutputShape, getConventionsShape } from '../schemas.js';
import type { ToolDeps, ToolModule } from '../types.js';
import { guardCharacterLimit, paginate } from '../trim.js';

/** Shape of a single item in the `GET /repos/:id/conventions` response —
 * only the fields this tool reads; the real DTO also carries `id`,
 * `scan_id`, `category`, `edited_rule`, `evidence_line_start/end`,
 * `evidence_snippet`, `skill_id`, `created_at`. */
interface ConventionListItem {
  rule: string;
  evidence_path: string;
  confidence: number;
  status: 'candidate' | 'accepted' | 'rejected';
}

interface TrimmedConvention {
  rule: string;
  evidence_path: string;
  confidence: number;
  accepted: boolean;
}

function trimConvention(c: ConventionListItem): TrimmedConvention {
  return {
    rule: c.rule,
    evidence_path: c.evidence_path,
    confidence: c.confidence,
    accepted: c.status === 'accepted',
  };
}

export const registerGetConventions: ToolModule = (server: McpServer, deps: ToolDeps) => {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repo conventions',
      description:
        "Get a repository's extracted house conventions. Flat arg: repo (owner/name). Returns each convention as {rule, evidence_path, confidence, accepted}; supports limit/offset paging.",
      inputSchema: getConventionsShape,
      outputSchema: getConventionsOutputShape,
    },
    async (args) => {
      try {
        const repoId = await deps.resolve.repoId(args.repo);
        const conventions = await deps.http.get<ConventionListItem[]>(
          `/repos/${repoId}/conventions`,
        );
        const { items, has_more } = paginate(
          conventions.map(trimConvention),
          args.limit,
          args.offset,
        );
        const structuredContent = guardCharacterLimit({ conventions: items, has_more });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
          structuredContent,
        };
      } catch (err) {
        return toToolResult(err) as CallToolResult;
      }
    },
  );
};
