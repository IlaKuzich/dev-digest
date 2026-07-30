import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Brief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Server-internal cache blob shape stored in `pr_brief.json` — the `Brief`
 * output PLUS the head SHA it was generated against and a generation
 * timestamp (resolved Q6: no new column/migration; both live INSIDE the
 * existing blob). Not vendored — this shape never crosses the wire as-is
 * (the route maps it to the transport `BriefEnvelope`).
 */
export interface CachedBrief {
  brief: Brief;
  head_sha: string;
  generated_at: string;
}

/** Validates the persisted blob on read so a malformed/legacy row can't leak
 *  untyped data past this layer (mirrors `Brief.parse` in the plan). A blob
 *  that fails this shape is treated as "no cache" by `read()` below. */
const CachedBriefShape = z.object({
  brief: Brief,
  head_sha: z.string(),
  generated_at: z.string(),
});

/**
 * The ONLY place touching `pr_brief`. The table is keyed on `pr_id` alone
 * with NO `workspace_id` column (`schema/reviews.ts:57-62`) — exactly the
 * `pr_intent` IDOR trap (`server/INSIGHTS.md:43`). Tenancy is therefore
 * enforced entirely by the SERVICE via `pullsRepo.getById(workspaceId, prId)`
 * BEFORE either method here is ever called; both methods here trust `prId`
 * as already verified.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /** Cache read (AC-8/AC-9 branch) — makes ZERO LLM calls. Returns `null` when
   *  no row exists, or when the persisted blob fails validation. */
  async read(prId: string): Promise<CachedBrief | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    if (!row) return null;

    const parsed = CachedBriefShape.safeParse(row.json);
    if (!parsed.success) return null;
    return parsed.data;
  }

  /** Overwrite the PR's cache with a freshly-generated, grounded brief (AC-10). */
  async upsert(prId: string, cached: CachedBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: cached })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: cached } });
  }
}
