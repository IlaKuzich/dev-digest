#!/usr/bin/env node
/**
 * Entry point for the `devdigest-mcp` stdio MCP server.
 *
 * Wires the HTTP client + resolvers (`src/http/client.ts`, `src/resolve.ts`)
 * into a `ToolDeps`, registers all five tools (`src/tools/index.ts`), and
 * connects over stdio. Run with `tsx src/index.ts` (no build step) — see
 * `devdigest-mcp/README.md`.
 *
 * IMPORTANT: stdout is reserved for MCP JSON-RPC framing. All diagnostics
 * (startup, shutdown, unexpected errors) go to stderr via `console.error` —
 * NEVER `console.log`/`process.stdout.write`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { API_URL } from './config.js';
import { makeHttpClient } from './http/client.js';
import { makeResolvers } from './resolve.js';
import { registerAllTools } from './tools/index.js';
import type { ToolDeps } from './types.js';

async function main(): Promise<void> {
  const http = makeHttpClient(API_URL);
  const resolve = makeResolvers(http);
  const deps: ToolDeps = { http, resolve };

  const server = new McpServer({ name: 'devdigest', version: '0.1.0' });
  registerAllTools(server, deps);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[devdigest-mcp] connected over stdio — API_URL=${API_URL}`);
}

main().catch((err) => {
  console.error('[devdigest-mcp] fatal startup error:', err);
  process.exit(1);
});
