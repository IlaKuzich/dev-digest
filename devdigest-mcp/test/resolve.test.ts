import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../src/http/client.js';
import { makeResolvers } from '../src/resolve.js';

function mockHttp(routes: Record<string, unknown>): HttpClient {
  return {
    get: vi.fn(async (path: string) => {
      if (path in routes) return routes[path];
      throw new Error(`unmocked GET ${path}`);
    }) as HttpClient['get'],
    post: vi.fn(async () => {
      throw new Error('unexpected POST');
    }) as HttpClient['post'],
  };
}

describe('makeResolvers', () => {
  describe('repoId', () => {
    it('resolves the repo id by matching full_name', async () => {
      const http = mockHttp({
        '/repos': [
          { id: 'repo-1', full_name: 'acme/payments-api' },
          { id: 'repo-2', full_name: 'acme/other' },
        ],
      });
      const resolve = makeResolvers(http);

      await expect(resolve.repoId('acme/payments-api')).resolves.toBe('repo-1');
    });

    it('throws a leads-forward error naming GET /repos when no repo matches', async () => {
      const http = mockHttp({ '/repos': [{ id: 'repo-1', full_name: 'acme/payments-api' }] });
      const resolve = makeResolvers(http);

      await expect(resolve.repoId('acme/missing')).rejects.toThrow(/GET \/repos/);
    });
  });

  describe('prId', () => {
    it('resolves the PR id by matching number within the given repo', async () => {
      const http = mockHttp({
        '/repos/repo-1/pulls': [
          { id: 'pr-1', number: 482 },
          { id: 'pr-2', number: 999 },
        ],
      });
      const resolve = makeResolvers(http);

      await expect(resolve.prId('repo-1', 482)).resolves.toBe('pr-1');
    });

    it('throws a leads-forward "import it first" error when the number is not found', async () => {
      const http = mockHttp({ '/repos/repo-1/pulls': [{ id: 'pr-1', number: 482 }] });
      const resolve = makeResolvers(http);

      await expect(resolve.prId('repo-1', 1)).rejects.toThrow(/import it first/);
    });

    it('throws "import it first" when the matched PR has a nullish id (not yet imported)', async () => {
      const http = mockHttp({ '/repos/repo-1/pulls': [{ id: null, number: 482 }] });
      const resolve = makeResolvers(http);

      await expect(resolve.prId('repo-1', 482)).rejects.toThrow(/import it first/);
    });
  });

  describe('agentId', () => {
    it('resolves by exact id match', async () => {
      const http = mockHttp({
        '/agents': [{ id: 'agent-1', name: 'Reviewer' }],
      });
      const resolve = makeResolvers(http);

      await expect(resolve.agentId('agent-1')).resolves.toBe('agent-1');
    });

    it('resolves by exact name match', async () => {
      const http = mockHttp({
        '/agents': [{ id: 'agent-1', name: 'Reviewer' }],
      });
      const resolve = makeResolvers(http);

      await expect(resolve.agentId('Reviewer')).resolves.toBe('agent-1');
    });

    it('throws a leads-forward error naming list_agents when no agent matches', async () => {
      const http = mockHttp({ '/agents': [{ id: 'agent-1', name: 'Reviewer' }] });
      const resolve = makeResolvers(http);

      await expect(resolve.agentId('does-not-exist')).rejects.toThrow(/list_agents/);
    });
  });
});
