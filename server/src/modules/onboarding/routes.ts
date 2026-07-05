import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getContext } from "../_shared/context.js";
import { IdParams } from "../_shared/schemas.js";
import { getCachedOnboarding } from "./repository.js";
import { NotFoundError, ValidationError } from "../../platform/errors.js";

/**
 * Onboarding module.
 *   POST /repos/:id/onboarding          → generates (or serves cached) Onboarding
 *   POST /repos/:id/onboarding?force=true → regenerates regardless of headSha
 *   GET  /repos/:id/onboarding          → returns cached Onboarding, 404 if absent
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    "/repos/:id/onboarding",
    {
      schema: {
        params: IdParams,
        querystring: z.object({ force: z.coerce.boolean().default(false) }),
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const force = req.query.force ?? false;

      try {
        const result = await container.onboarding.generate(
          workspaceId,
          req.params.id,
          force,
          req.log,
        );
        return result;
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(422).send({ error: (err as Error).message });
        }
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: (err as Error).message });
        }
        req.log.error({ err }, "Onboarding generation failed");
        return reply.status(500).send({
          error: (err as Error).message ?? "Onboarding generation failed",
        });
      }
    },
  );

  app.get(
    "/repos/:id/onboarding",
    { schema: { params: IdParams } },
    async (req, reply) => {
      const cached = await getCachedOnboarding(container.db, req.params.id);
      if (!cached) {
        return reply
          .status(404)
          .send({ error: "Onboarding not yet generated for this repo" });
      }
      return cached.onboarding;
    },
  );
}
