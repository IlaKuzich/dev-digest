import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ExportService } from './service.js';

export default async function exportsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ExportService(app.container);

  app.get('/repos/:id/findings/export', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const csv = await service.buildCsv(workspaceId, req.params.id);
    reply.header('content-type', 'text/csv');
    return csv;
  });
}
