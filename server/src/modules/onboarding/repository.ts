import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import type { Onboarding } from "@devdigest/shared";

// ---- Cache read/write -------------------------------------------------------

export async function getCachedOnboarding(
  db: Db,
  repoId: string,
): Promise<{ onboarding: Onboarding; headSha: string } | null> {
  const [row] = await db
    .select()
    .from(t.onboarding)
    .where(eq(t.onboarding.repoId, repoId));
  if (!row) return null;
  return { onboarding: row.json as Onboarding, headSha: row.headSha };
}

export async function upsertOnboarding(
  db: Db,
  repoId: string,
  onboarding: Onboarding,
  headSha: string,
): Promise<void> {
  await db
    .insert(t.onboarding)
    .values({ repoId, json: onboarding, headSha })
    .onConflictDoUpdate({
      target: t.onboarding.repoId,
      set: { json: onboarding, headSha, generatedAt: new Date() },
    });
}

// ---- Advisory lock ----------------------------------------------------------
// Copied from brief/repository.ts — cross-module repository import is an
// onion-architecture violation; the ~12-line duplication is the correct cost.
// Wraps a callback in a Postgres advisory transaction lock keyed on `repoId`.

export async function withAdvisoryLock<T>(
  db: Db,
  repoId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${repoId}::text))`,
    );
    return fn();
  });
}
