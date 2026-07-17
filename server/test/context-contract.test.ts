import { describe, it, expect } from 'vitest';
import { ContextDoc, ContextDocsResponse, SetContextBody, AgentVersionConfig } from '@devdigest/shared';

/**
 * Contract tests for T1 — Project Context shared shapes + the AgentVersionConfig
 * extension. Hermetic: pure Zod parse, no I/O.
 */
describe('Project Context contracts', () => {
  it('ContextDoc parses a discovered spec doc', () => {
    const doc = ContextDoc.parse({
      path: 'specs/2026-07-17-project-context.md',
      root: 'specs',
      bytes: 4096,
      token_estimate: 1024,
      used_by_agents: 2,
    });
    expect(doc.root).toBe('specs');
    expect(doc.used_by_agents).toBe(2);
  });

  it('ContextDocsResponse parses a full docs listing with clone status', () => {
    expect(() =>
      ContextDocsResponse.parse({
        docs: [
          {
            path: 'docs/architecture.md',
            root: 'docs',
            bytes: 2048,
            token_estimate: 512,
            used_by_agents: 0,
          },
        ],
        clone: { synced_at: '2026-07-17T00:00:00.000Z', present: true },
      }),
    ).not.toThrow();

    // Empty-clone shape (AC-2): no docs, clone absent.
    expect(() =>
      ContextDocsResponse.parse({ docs: [], clone: { synced_at: null, present: false } }),
    ).not.toThrow();
  });

  it('SetContextBody parses the full ordered attach set posted on save', () => {
    const body = SetContextBody.parse({
      docs: [
        { path: 'specs/a.md', attached: true },
        { path: 'docs/b.md', attached: false },
      ],
    });
    expect(body.docs).toHaveLength(2);
    expect(body.docs[0]!.attached).toBe(true);
  });

  it('AgentVersionConfig defaults context to [] so pre-existing snapshot rows without the field still parse (AC-20 / replay)', () => {
    const config = AgentVersionConfig.parse({
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'Review this PR.',
      strategy: 'single-pass',
      ci_fail_on: 'critical',
      repo_intel: true,
      skills: ['skill-1'],
      // no `context` field — mirrors a row written before AC-27
    });
    expect(config.context).toEqual([]);
  });

  it('AgentVersionConfig accepts an explicit context path list', () => {
    const config = AgentVersionConfig.parse({
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'Review this PR.',
      strategy: 'single-pass',
      ci_fail_on: 'critical',
      repo_intel: true,
      skills: [],
      context: ['specs/security-baseline.md'],
    });
    expect(config.context).toEqual(['specs/security-baseline.md']);
  });
});
