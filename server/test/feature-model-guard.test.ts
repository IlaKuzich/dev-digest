import { describe, it, expect } from 'vitest';
import { enforceOpenRouterForGeneration } from '../src/modules/settings/feature-models.js';

/**
 * Project policy: generation must never call OpenAI directly — every resolved
 * generation choice on the `openai` provider is redirected to OpenRouter, with
 * the model translated to an OpenRouter slug. Non-openai choices pass through
 * untouched. See `enforceOpenRouterForGeneration`.
 */
describe('enforceOpenRouterForGeneration', () => {
  it('redirects an openai choice to openrouter and slugifies a bare model id', () => {
    expect(enforceOpenRouterForGeneration({ provider: 'openai', model: 'gpt-4.1' })).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
    });
  });

  it('leaves an already-namespaced model slug unchanged when redirecting', () => {
    expect(
      enforceOpenRouterForGeneration({ provider: 'openai', model: 'openai/gpt-4o-mini' }),
    ).toEqual({ provider: 'openrouter', model: 'openai/gpt-4o-mini' });
  });

  it('passes an openrouter choice through untouched', () => {
    const choice = { provider: 'openrouter' as const, model: 'deepseek/deepseek-v4-flash' };
    expect(enforceOpenRouterForGeneration(choice)).toEqual(choice);
  });

  it('passes an anthropic choice through untouched (never rewritten)', () => {
    const choice = { provider: 'anthropic' as const, model: 'claude-3-5-sonnet-latest' };
    expect(enforceOpenRouterForGeneration(choice)).toEqual(choice);
  });
});
