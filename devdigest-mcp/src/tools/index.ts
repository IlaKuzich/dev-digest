/**
 * Assembles the MCP server's tool surface — the single place that knows about
 * all five `src/tools/*.ts` modules, so `src/index.ts` (the entry point) never
 * has to import them individually.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetBlastRadius } from './get-blast-radius.js';
import { registerGetConventions } from './get-conventions.js';
import { registerGetFindings } from './get-findings.js';
import { registerListAgents } from './list-agents.js';
import { registerRunAgentOnPr } from './run-agent-on-pr.js';
import type { ToolDeps } from '../types.js';

/** Register all five DevDigest MCP tools on `server`. */
export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);
}
