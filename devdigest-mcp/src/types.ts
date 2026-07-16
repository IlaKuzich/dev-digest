/**
 * Tool registration contract shared by every `src/tools/*.ts` module — this
 * lets T5's `src/tools/index.ts` assemble the server without touching any
 * individual tool file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HttpClient } from './http/client.js';
import type { Resolvers } from './resolve.js';

export type { HttpClient } from './http/client.js';
export type { Resolvers } from './resolve.js';

export interface ToolDeps {
  http: HttpClient;
  resolve: Resolvers;
}

/** Every tool file exports a function of this shape (e.g. `registerListAgents`). */
export type ToolModule = (server: McpServer, deps: ToolDeps) => void;
