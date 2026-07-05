import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Container } from "../../platform/container.js";
import {
  getFeatureModelOverride,
  resolveFeatureModelStrict,
} from "./feature-models.js";
import { ValidationError } from "../../platform/errors.js";

// Minimal stub for the container's DB query (settings)
function makeContainer(overrideValue?: {
  provider: string;
  model: string;
}): Container {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: async () => {
            if (!overrideValue) return [];
            return [
              {
                key: "feature_models",
                value: { onboarding: overrideValue },
              },
            ];
          },
        }),
      }),
    },
  } as unknown as Container;
}

describe("getFeatureModelOverride", () => {
  it("returns undefined when no override is set", async () => {
    const container = makeContainer(undefined);
    const result = await getFeatureModelOverride(
      container,
      "ws-1",
      "onboarding",
    );
    expect(result).toBeUndefined();
  });

  it("returns the configured override when set", async () => {
    const container = makeContainer({
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
    });
    const result = await getFeatureModelOverride(
      container,
      "ws-1",
      "onboarding",
    );
    expect(result).toEqual({
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
    });
  });
});

describe("resolveFeatureModelStrict", () => {
  it("throws ValidationError (422) when no override is configured", async () => {
    const container = makeContainer(undefined);
    await expect(
      resolveFeatureModelStrict(container, "ws-1", "onboarding"),
    ).rejects.toThrow(ValidationError);
  });

  it("throws with message containing the feature label and 'Settings → Feature Models'", async () => {
    const container = makeContainer(undefined);
    try {
      await resolveFeatureModelStrict(container, "ws-1", "risk_brief");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("Risk Brief");
      expect((err as Error).message).toContain("Settings → Feature Models");
    }
  });

  it("returns the override when one is configured", async () => {
    const container = makeContainer({ provider: "openai", model: "gpt-4o" });
    const result = await resolveFeatureModelStrict(
      container,
      "ws-1",
      "onboarding",
    );
    expect(result).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("throws a ValidationError with statusCode 422", async () => {
    const container = makeContainer(undefined);
    try {
      await resolveFeatureModelStrict(container, "ws-1", "conventions");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).statusCode).toBe(422);
    }
  });
});
