import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getContext } from "../_shared/context.js";
import { IdParams } from "../_shared/schemas.js";
import { BriefService } from "./service.js";
import { getCachedBrief } from "./repository.js";
import { NotFoundError } from "../../platform/errors.js";

/**
 * Brief module.
 *   POST /pulls/:id/brief          → generates (or serves cached) Brief
 *   POST /pulls/:id/brief?force=true → regenerates regardless of headSha
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    "/pulls/:id/brief",
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
      const service = new BriefService(container);

      try {
        const brief = await service.generate(
          workspaceId,
          req.params.id,
          force,
          req.log,
        );
        return brief;
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: (err as Error).message });
        }
        req.log.error({ err }, "Brief generation failed");
        return reply.status(500).send({
          error: (err as Error).message ?? "Brief generation failed",
        });
      }
    },
  );

  app.get(
    "/pulls/:id/brief",
    { schema: { params: IdParams } },
    async (req, reply) => {
      const cached = await getCachedBrief(container.db, req.params.id);
      if (!cached) {
        return reply
          .status(404)
          .send({ error: "Brief not yet generated for this PR" });
      }
      return cached.brief;
    },
  );
}
