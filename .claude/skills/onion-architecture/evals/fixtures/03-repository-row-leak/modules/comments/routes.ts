import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CommentService } from './service.js';

export default async function commentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CommentService(app.container);

  app.get('/pulls/:id/comments', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/pulls/:id/comments', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { body } = req.body as { body: string };
    return service.add(workspaceId, req.params.id, userId, body);
  });
}
