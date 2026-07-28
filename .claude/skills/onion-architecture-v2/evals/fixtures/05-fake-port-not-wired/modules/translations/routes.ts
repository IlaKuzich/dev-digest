import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { TranslationService } from './service.js';

export default async function translationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new TranslationService(app.container);

  app.post('/pulls/:id/translate', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { targetLang } = req.body as { targetLang: string };
    const text = await service.translateDescription(workspaceId, req.params.id, targetLang);
    return { text };
  });
}
