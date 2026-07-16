import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../src/http/client.js';
import type { Resolvers } from '../src/resolve.js';
import { registerAllTools } from '../src/tools/index.js';
import type { ToolDeps } from '../src/types.js';

interface CapturedTool {
  name: string;
  handler: (args: Record<string, unknown>, extra?: unknown) => Promise<{
    content: { type: string; text: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  }>;
}

function fakeServer() {
  const tools: CapturedTool[] = [];
  const registerTool = vi.fn((name: string, _config: unknown, handler: CapturedTool['handler']) => {
    tools.push({ name, handler });
  });
  return { registerTool, tools };
}

function mockHttp(): HttpClient {
  return {
    get: vi.fn(async (path: string) => {
      throw new Error(`unmocked GET ${path}`);
    }) as HttpClient['get'],
    post: vi.fn(async (path: string) => {
      throw new Error(`unmocked POST ${path}`);
    }) as HttpClient['post'],
  };
}

function mockResolvers(): Resolvers {
  return {
    repoId: vi.fn(async () => 'repo-1'),
    prId: vi.fn(async () => 'pr-1'),
    agentId: vi.fn(async () => 'agent-1'),
  } as Resolvers;
}

const EXPECTED_TOOL_NAMES = [
  'list_agents',
  'run_agent_on_pr',
  'get_findings',
  'get_conventions',
  'get_blast_radius',
];

describe('registerAllTools', () => {
  it('registers exactly the five DevDigest tools', () => {
    const server = fakeServer();
    const deps: ToolDeps = { http: mockHttp(), resolve: mockResolvers() };

    registerAllTools(server as never, deps);

    expect(server.registerTool).toHaveBeenCalledTimes(5);
    expect(server.tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it('registers a get_blast_radius handler that returns a not_implemented stub without erroring', async () => {
    const server = fakeServer();
    const deps: ToolDeps = { http: mockHttp(), resolve: mockResolvers() };

    registerAllTools(server as never, deps);

    const blastRadius = server.tools.find((t) => t.name === 'get_blast_radius');
    if (!blastRadius) throw new Error('get_blast_radius was not registered');

    const result = await blastRadius.handler({ repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ status: 'not_implemented' });
  });
});
