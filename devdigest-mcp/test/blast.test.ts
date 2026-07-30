import { describe, expect, it, vi } from 'vitest';
import { registerGetBlastRadius } from '../src/tools/get-blast-radius.js';
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
  registerGetBlastRadius(server as never, deps);
  const tool = server.tools.find((t) => t.name === 'get_blast_radius');
  if (!tool) throw new Error('get_blast_radius was not registered');
  return tool;
}

describe('get_blast_radius', () => {
  it('resolves repo+pr, calls GET /pulls/:id/blast, and returns the exact trimmed shape', async () => {
    const http = mockHttp({
      get: vi.fn(async (path: string) => {
        if (path === '/pulls/pr-1/blast') {
          return {
            changed_symbols: [
              { name: 'getReviewsForProduct', file: 'src/api/reviews/service.ts', kind: 'function' },
            ],
            downstream: [
              {
                symbol: 'getReviewsForProduct',
                callers: [{ name: 'handler', file: 'src/api/reviews/route.ts', line: 12 }],
                endpoints_affected: ['GET /api/reviews'],
                crons_affected: [],
              },
            ],
            summary: '',
            index_state: { status: 'full', filesIndexed: 135, filesSkipped: 0 },
          };
        }
        throw new Error(`unmocked GET ${path}`);
      }) as HttpClient['get'],
    });

    const tool = registerAndGetTool({ http, resolve: mockResolvers() });

    const result = await tool.handler({ repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({
      changed_symbols: [
        { name: 'getReviewsForProduct', file: 'src/api/reviews/service.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'getReviewsForProduct',
          callers: [{ name: 'handler', file: 'src/api/reviews/route.ts', line: 12 }],
          endpoints_affected: ['GET /api/reviews'],
          crons_affected: [],
        },
      ],
      index_state: { status: 'full', filesIndexed: 135, filesSkipped: 0 },
    });
    // `summary` was empty -> dropped. Healthy full index -> no degraded_note.
    expect(payload).not.toHaveProperty('summary');
    expect(payload).not.toHaveProperty('degraded_note');
    expect(Object.keys(payload).sort()).toEqual(['changed_symbols', 'downstream', 'index_state']);
  });

  it('surfaces degradation with a degraded_note instead of presenting an incomplete map as complete', async () => {
    const http = mockHttp({
      get: vi.fn(async (path: string) => {
        if (path === '/pulls/pr-1/blast') {
          return {
            changed_symbols: [
              { name: 'getReviewsForProduct', file: 'src/api/reviews/service.ts', kind: 'function' },
            ],
            downstream: [
              {
                symbol: 'getReviewsForProduct',
                callers: [],
                endpoints_affected: [],
                crons_affected: [],
              },
            ],
            summary: '',
            index_state: {
              status: 'full',
              filesIndexed: 135,
              filesSkipped: 0,
              degraded: true,
              degradedReason: 'no_data',
            },
          };
        }
        throw new Error(`unmocked GET ${path}`);
      }) as HttpClient['get'],
    });

    const tool = registerAndGetTool({ http, resolve: mockResolvers() });

    const result = await tool.handler({ repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(payload.index_state).toEqual({
      status: 'full',
      filesIndexed: 135,
      filesSkipped: 0,
      degraded: true,
      degradedReason: 'no_data',
    });
    expect(typeof payload.degraded_note).toBe('string');
    expect(payload.degraded_note).toMatch(/no_data|degraded|full/i);
  });

  it('propagates a leads-forward error when the PR cannot be resolved', async () => {
    const { prNotFound } = await import('../src/errors.js');
    const http = mockHttp();
    const resolve = mockResolvers({
      prId: vi.fn(async () => {
        throw prNotFound(482, 'acme/payments-api');
      }),
    });

    const tool = registerAndGetTool({ http, resolve });

    const result = await tool.handler({ repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/PR #482/);
  });
});
