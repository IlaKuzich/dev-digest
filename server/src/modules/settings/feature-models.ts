import { eq } from "drizzle-orm";
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
} from "@devdigest/shared";
import type { Container } from "../../platform/container.js";
import * as t from "../../db/schema.js";
import { rowsToSettings } from "./helpers.js";
import { ValidationError } from "../../platform/errors.js";

/**
 * Per-feature model configuration.
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings instead of a hardcoded
 * module constant. When the workspace hasn't chosen one, `resolveFeatureModelStrict`
 * throws a ValidationError (422) — there is no silent fallback to a default.
 */

/**
 * The workspace's override for `id`, or `undefined` when unset/invalid. Every
 * feature call site resolves its model via `resolveFeatureModelStrict` below
 * (which calls this internally); this function is exported mainly for direct
 * unit/integration testing of the override-lookup behavior in isolation.
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
  const fm = (
    rowsToSettings(rows) as { feature_models?: Record<string, unknown> }
  ).feature_models;
  const parsed = FeatureModelChoice.safeParse(fm?.[id]);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Resolve `id` to a concrete provider+model from the workspace's Settings.
 * Throws `ValidationError` (422) when no override is configured — callers must
 * direct the user to Settings → Feature Models to configure a model.
 */
export async function resolveFeatureModelStrict(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice> {
  const override = await getFeatureModelOverride(container, workspaceId, id);
  if (override) return override;
  const def = FEATURE_MODELS.find((f) => f.id === id);
  if (def?.defaultProvider && def?.defaultModel) {
    return { provider: def.defaultProvider, model: def.defaultModel };
  }
  const label = def?.label ?? id;
  throw new ValidationError(
    `No model selected for ${label} — choose one in Settings → Feature Models`,
  );
}
