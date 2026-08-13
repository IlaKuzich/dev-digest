import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SetContextBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ContextService } from './service.js';

/** `/repos/:repoId/...` addresses a repo, not the generic `:id` — `IdParams`
 *  is keyed `id` (server/INSIGHTS.md:37), so this route needs its own params
 *  schema. */
const RepoIdParams = z.object({ repoId: z.string().uuid() });

const ContextDocContentQuery = z.object({ path: z.string().min(1) });

/**
 * T3 — context module.
 *   GET  /repos/:repoId/context-docs          → discovered docs + clone snapshot marker
 *   GET  /repos/:repoId/context-docs/content  → { path, text } for one doc (Preview)
 *   GET  /agents/:id/context                  → attached docs (ordered)
 *   POST /agents/:id/context                  → set/reorder the agent's attached set
 *   GET  /skills/:id/context                  → attached docs (ordered)
 *   POST /skills/:id/context                  → set/reorder the skill's attached set
 */
export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get(
    '/repos/:repoId/context-docs',
    { schema: { params: RepoIdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listDocs(workspaceId, req.params.repoId);
    },
  );

  app.get(
    '/repos/:repoId/context-docs/content',
    { schema: { params: RepoIdParams, querystring: ContextDocContentQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getDocContent(workspaceId, req.params.repoId, req.query.path);
    },
  );

  app.get('/agents/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await service.getAgentContext(workspaceId, req.params.id);
    if (!rows) throw new NotFoundError('Agent not found');
    return rows;
  });

  app.post(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetContextBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const rows = await service.setAgentContext(workspaceId, req.params.id, req.body);
      if (!rows) throw new NotFoundError('Agent not found');
      return rows;
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await service.getSkillContext(workspaceId, req.params.id);
    if (!rows) throw new NotFoundError('Skill not found');
    return rows;
  });

  app.post(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const rows = await service.setSkillContext(workspaceId, req.params.id, req.body);
      if (!rows) throw new NotFoundError('Skill not found');
      return rows;
    },
  );
}
