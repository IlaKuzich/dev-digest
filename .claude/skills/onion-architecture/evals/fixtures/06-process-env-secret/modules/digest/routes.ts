import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { DigestService } from './service.js';

export default async function digestRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new DigestService(app.container);

  app.post('/internal/digest/send', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { entries } = req.body as { entries: { repoFullName: string; openPrs: number }[] };
    await service.send(workspaceId, entries);
    return { ok: true };
  });
}
