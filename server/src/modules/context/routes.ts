import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getContext } from "../_shared/context.js";

/**
 * Context module routes.
 *   GET  /repos/:repoId/context         → SpecFile[] (all .md files in clone)
 *   POST /repos/:repoId/context/reindex → ContextSummary (re-reads FS)
 */

const RepoIdParams = z.object({ repoId: z.string().uuid() });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    "/repos/:repoId/context",
    { schema: { params: RepoIdParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.contextService.listDocsForRepo(workspaceId, req.params.repoId);
    },
  );

  app.post(
    "/repos/:repoId/context/reindex",
    { schema: { params: RepoIdParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.contextService.reindexForRepo(workspaceId, req.params.repoId);
    },
  );
}
