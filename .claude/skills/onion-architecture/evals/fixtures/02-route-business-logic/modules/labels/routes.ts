import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { LabelService } from './service.js';
import { AUTO_LABEL_PREFIX, MAX_LABELS_PER_PR } from './constants.js';

export default async function labelsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new LabelService(app.container);

  app.put('/pulls/:id/labels', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const existing = await service.listRaw(workspaceId, req.params.id);
    const requested = (req.body as { names: string[] }).names;

    const manual = existing.filter((l) => !l.name.startsWith(AUTO_LABEL_PREFIX)).map((l) => l.name);
    const merged = [...new Set([...manual, ...requested])];

    let final = merged;
    if (final.length > MAX_LABELS_PER_PR) {
      final = final.slice(0, MAX_LABELS_PER_PR);
    }

    await service.replace(workspaceId, req.params.id, final);
    return { labels: final };
  });
}
