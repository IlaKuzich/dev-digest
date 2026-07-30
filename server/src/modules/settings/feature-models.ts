import { eq } from 'drizzle-orm';
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { rowsToSettings } from './helpers.js';

/**
 * Per-feature model configuration.
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings instead of a hardcoded
 * module constant. When the workspace hasn't chosen one, we fall back to the
 * registry default in `FEATURE_MODELS` — which mirrors each module's old
 * constant, so behaviour is unchanged until a model is explicitly picked.
 */

const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

/**
 * Project policy — generation NEVER calls OpenAI directly; it always routes
 * through OpenRouter. Any resolved generation choice on the `openai` provider —
 * whether the registry default OR a workspace override — is redirected to
 * `openrouter`, translating a bare OpenAI model id to its OpenRouter slug
 * (`gpt-4.1` -> `openai/gpt-4.1`; an already-namespaced slug passes through).
 *
 * This is the generation-provider chokepoint: every feature that generates text
 * resolves its model through `resolveFeatureModel`, so guarding here catches
 * defaults AND overrides for all of them in one place. It is deliberately NOT in
 * `container.llm('openai')` — that path also builds the OpenAI *embedder*
 * (`container.embedder()`), which legitimately uses OpenAI and is out of scope,
 * and `llm()` has no model to translate. Embeddings are unaffected.
 *
 * NOTE: OpenRouter slugs (`openai/gpt-4.1`) must be confirmed against
 * openrouter.ai/models — see the caveat in `adapters/llm/pricing.ts`.
 */
export function enforceOpenRouterForGeneration(choice: FeatureModelChoice): FeatureModelChoice {
  if (choice.provider !== 'openai') return choice;
  const model = choice.model.includes('/') ? choice.model : `openai/${choice.model}`;
  return { provider: 'openrouter', model };
}

/**
 * The workspace's override for `id`, or `undefined` when unset/invalid. Callers
 * that keep their own dynamic default (e.g. conventions) use this directly so
 * that default is preserved; callers with a static default use
 * `resolveFeatureModel` instead.
 */
export async function getFeatureModelOverride(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice | undefined> {
  const rows = await container.db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));
  const fm = (rowsToSettings(rows) as { feature_models?: Record<string, unknown> }).feature_models;
  const parsed = FeatureModelChoice.safeParse(fm?.[id]);
  return parsed.success ? parsed.data : undefined;
}

/** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
export async function resolveFeatureModel(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice> {
  const choice = (await getFeatureModelOverride(container, workspaceId, id)) ?? DEFAULTS[id];
  return enforceOpenRouterForGeneration(choice);
}
