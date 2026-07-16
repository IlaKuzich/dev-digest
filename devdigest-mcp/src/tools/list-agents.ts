/**
 * `list_agents` — lists the configured review agents so the model can pick a
 * valid `agent` value for `run_agent_on_pr`. Read-only: `GET /agents`,
 * trimmed to `{id, name, provider, model}` (design principle 3 — "Concise
 * structured response") and paginated. No `outputSchema` per the plan —
 * structural output validation is only worth it for `get_findings` /
 * `get_conventions` (`docs/plans/2026-07-16-devdigest-mcp-server.md` T2).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toToolResult } from '../errors.js';
import { listAgentsShape } from '../schemas.js';
import type { ToolDeps, ToolModule } from '../types.js';
import { guardCharacterLimit, paginate } from '../trim.js';

/** Shape of a single item in the `GET /agents` response — only the fields
 * this tool reads; the real DTO also carries `description`, `enabled`,
 * `version` (see `docs/plans/2026-07-16-devdigest-mcp-server.md` "Verified
 * backing API surface"). */
interface AgentListItem {
  id: string;
  name: string;
  provider: string;
  model: string;
}

interface TrimmedAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
}

function trimAgent(agent: AgentListItem): TrimmedAgent {
  return { id: agent.id, name: agent.name, provider: agent.provider, model: agent.model };
}

export const registerListAgents: ToolModule = (server: McpServer, deps: ToolDeps) => {
  server.registerTool(
    'list_agents',
    {
      title: 'List agents',
      description:
        'List the configured review agents with their ids. Call this to get a valid `agent` value for `run_agent_on_pr`. Returns {id, name, provider, model}; supports limit/offset paging.',
      inputSchema: listAgentsShape,
    },
    async (args) => {
      try {
        const agents = await deps.http.get<AgentListItem[]>('/agents');
        const { items, has_more } = paginate(agents.map(trimAgent), args.limit, args.offset);
        const payload = guardCharacterLimit({ agents: items, has_more });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        };
      } catch (err) {
        return toToolResult(err) as CallToolResult;
      }
    },
  );
};
