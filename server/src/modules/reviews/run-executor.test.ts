import { describe, it, expect } from 'vitest';
import { ReviewRunExecutor } from './run-executor.js';
import { MockGitClient, MockLLMProvider } from '../../adapters/mocks.js';
import { Container, type ContainerOverrides } from '../../platform/container.js';
import type { AppConfig } from '../../platform/config.js';
import type { Db } from '../../db/client.js';
import type { AgentRow } from '../../db/rows.js';
import type { PullRow, ReviewRepository } from './repository.js';

function makeContainer(overrides: ContainerOverrides): Container {
  const config = { cloneDir: '/tmp', secretsPath: '/tmp/s.json', embeddingsEnabled: false } as unknown as AppConfig;
  return new Container(config, {} as Db, overrides);
}

function fakeRepo(): ReviewRepository {
  return {
    insertReview: async (v: unknown) => ({ id: 'review-1', ...(v as object), createdAt: new Date() }),
    insertFindings: async () => [],
    markReviewed: async () => {},
    completeAgentRun: async () => {},
    saveRunTrace: async () => {},
  } as unknown as ReviewRepository;
}

const pullRow: PullRow = {
  id: 'pr-1', workspaceId: 'ws-1', repoId: 'repo-1', number: 482,
  title: 'x', author: 'a', branch: 'b', base: 'main', headSha: 'a1b2c3d4',
  lastReviewedSha: null, additions: 0, deletions: 0, filesCount: 0,
  status: 'open', body: null, openedAt: null, updatedAt: null,
};

const repoRow = {
  id: 'repo-1', workspaceId: 'ws-1', owner: 'acme', name: 'app',
  fullName: 'acme/app', clonePath: null, createdBy: 'sys', lastPolledAt: null,
} as unknown as Parameters<ReviewRunExecutor['executeRuns']>[2];

// repoIntel: false so the executor skips all repo-intel enrichment (which would
// otherwise need a real DB-backed RepoIntelService).
const baseAgent: AgentRow = {
  id: 'agent-1', workspaceId: 'ws-1', name: 'Sec Reviewer', description: '',
  provider: 'openai', model: 'gpt-4.1', systemPrompt: 'You review code.',
  outputSchema: null, strategy: 'single-pass', ciFailOn: 'critical',
  repoIntel: false, enabled: true, version: 1, createdBy: null, createdAt: new Date(),
};

const REVIEW_FIXTURE = { verdict: 'approve', summary: 'ok', score: 90, findings: [] };

function userMessageOf(llm: MockLLMProvider): string {
  const call = llm.calls.find((c) => c.method === 'completeStructured')!;
  const messages = (call.req as { messages: { role: string; content: string }[] }).messages;
  return messages.find((m) => m.role === 'user')!.content;
}

describe('ReviewRunExecutor — skills wiring', () => {
  it('injects enabled skills into the assembled prompt', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const agentsRepo = {
      enabledSkillsForAgent: async () => [{ name: 'Security rubric', body: '- Flag hardcoded secrets' }],
    } as unknown as Container['agentsRepo'];
    const container = makeContainer({ git: new MockGitClient(), llm: { openai: llm } });
    const executor = new ReviewRunExecutor(container, fakeRepo(), agentsRepo);

    await executor.executeRuns('ws-1', pullRow, repoRow, [{ agent: baseAgent, runId: 'run-1' }]);

    const userMsg = userMessageOf(llm);
    expect(userMsg).toContain('## Skills / rules');
    expect(userMsg).toContain('Security rubric');
    expect(userMsg).toContain('Flag hardcoded secrets');
  });

  it('omits the Skills section when no skill is enabled (disabled or globally off)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const agentsRepo = {
      enabledSkillsForAgent: async () => [],
    } as unknown as Container['agentsRepo'];
    const container = makeContainer({ git: new MockGitClient(), llm: { openai: llm } });
    const executor = new ReviewRunExecutor(container, fakeRepo(), agentsRepo);

    await executor.executeRuns('ws-1', pullRow, repoRow, [{ agent: baseAgent, runId: 'run-2' }]);

    expect(userMessageOf(llm)).not.toContain('## Skills / rules');
  });
});
