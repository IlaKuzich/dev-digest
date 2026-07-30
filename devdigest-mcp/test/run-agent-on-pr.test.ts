import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLL_INTERVAL_MS } from '../src/config.js';
import { agentNotFound } from '../src/errors.js';
import { registerRunAgentOnPr } from '../src/tools/run-agent-on-pr.js';
import type { HttpClient } from '../src/http/client.js';
import type { Resolvers } from '../src/resolve.js';

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

function mockHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(async (path: string) => {
      throw new Error(`unmocked GET ${path}`);
    }),
    post: vi.fn(async (path: string) => {
      throw new Error(`unmocked POST ${path}`);
    }),
    ...overrides,
  } as HttpClient;
}

function mockResolvers(overrides: Partial<Resolvers> = {}): Resolvers {
  return {
    repoId: vi.fn(async () => 'repo-1'),
    prId: vi.fn(async () => 'pr-1'),
    agentId: vi.fn(async () => 'agent-1'),
    ...overrides,
  } as Resolvers;
}

function registerAndGetTool(deps: { http: HttpClient; resolve: Resolvers }) {
  const server = fakeServer();
  registerRunAgentOnPr(server as never, deps);
  const tool = server.tools.find((t) => t.name === 'run_agent_on_pr');
  if (!tool) throw new Error('run_agent_on_pr was not registered');
  return tool;
}

describe('run_agent_on_pr', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls running -> done and returns the trimmed verdict/findings', async () => {
    vi.useFakeTimers();
    let runsCallCount = 0;

    const http = mockHttp({
      post: vi.fn(async () => ({
        runs: [{ run_id: 'run-1', agent_id: 'agent-1' }],
      })) as HttpClient['post'],
      get: vi.fn(async (path: string) => {
        if (path === '/pulls/pr-1/runs') {
          runsCallCount += 1;
          return runsCallCount === 1
            ? [{ run_id: 'run-1', status: 'running' }]
            : [{ run_id: 'run-1', status: 'done' }];
        }
        if (path === '/pulls/pr-1/reviews') {
          return [
            {
              run_id: 'run-1',
              verdict: 'approve',
              score: 0.9,
              findings: [
                {
                  id: 'f-1',
                  severity: 'CRITICAL',
                  title: 'SQL injection',
                  file: 'src/db.ts',
                  start_line: 42,
                  rationale: 'because ...',
                },
              ],
            },
          ];
        }
        throw new Error(`unmocked GET ${path}`);
      }) as HttpClient['get'],
    });

    const tool = registerAndGetTool({ http, resolve: mockResolvers() });

    const resultPromise = tool.handler({ repo: 'acme/payments-api', pr: 482, agent: 'agent-1' });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    const result = await resultPromise;

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({
      verdict: 'approve',
      findings: [
        { id: 'f-1', severity: 'CRITICAL', title: 'SQL injection', file: 'src/db.ts', line: 42 },
      ],
    });
    expect(runsCallCount).toBe(2);
  });

  it('returns {status: "running", run_id} when the run has not finished before timeout_ms', async () => {
    vi.useFakeTimers();

    const http = mockHttp({
      post: vi.fn(async () => ({
        runs: [{ run_id: 'run-1', agent_id: 'agent-1' }],
      })) as HttpClient['post'],
      get: vi.fn(async (path: string) => {
        if (path === '/pulls/pr-1/runs') return [{ run_id: 'run-1', status: 'running' }];
        throw new Error(`unmocked GET ${path}`);
      }) as HttpClient['get'],
    });

    const tool = registerAndGetTool({ http, resolve: mockResolvers() });

    const resultPromise = tool.handler({
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'agent-1',
      timeout_ms: 3000,
    });
    // Advance well past timeout_ms without ever resolving 'running' -> no real waiting.
    await vi.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({ status: 'running', run_id: 'run-1' });
  });

  it('surfaces a leads-forward error naming list_agents when the agent cannot be resolved', async () => {
    const http = mockHttp();
    const resolve = mockResolvers({
      agentId: vi.fn(async () => {
        throw agentNotFound('does-not-exist');
      }),
    });

    const tool = registerAndGetTool({ http, resolve });

    const result = await tool.handler({
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'does-not-exist',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/list_agents/);
  });
});
