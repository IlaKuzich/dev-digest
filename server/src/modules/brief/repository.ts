import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import type { Brief } from "@devdigest/shared";

// ---- Cache read/write -------------------------------------------------------

export async function getCachedBrief(
  db: Db,
  prId: string,
): Promise<{ brief: Brief; headSha: string | null } | null> {
  const [row] = await db
    .select()
    .from(t.prBrief)
    .where(eq(t.prBrief.prId, prId));
  if (!row) return null;
  return { brief: row.json as Brief, headSha: row.headSha ?? null };
}

export async function upsertBrief(
  db: Db,
  prId: string,
  brief: Brief,
  headSha: string,
): Promise<void> {
  await db
    .insert(t.prBrief)
    .values({ prId, json: brief, headSha })
    .onConflictDoUpdate({
      target: t.prBrief.prId,
      set: { json: brief, headSha },
    });
}

// ---- Advisory lock ----------------------------------------------------------
// Wraps a callback in a Postgres advisory transaction lock keyed on `prId`.
// Two concurrent calls for the same prId serialize: only one LLM call runs,
// the second re-reads the cache after lock release (fair-retry in service.ts).

export async function withAdvisoryLock<T>(
  db: Db,
  prId: string,
  fn: () => Promise<T>,
): Promise<T> {
  // pg_advisory_xact_lock takes a bigint — derive from UUID via hashtext()
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${prId}::text))`,
    );
    return fn();
  });
}
