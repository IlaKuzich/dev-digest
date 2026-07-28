import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

/**
 * Generic CRUD plumbing shared across modules' repository.ts files. Touches
 * no specific module's table — the concrete table is injected by the
 * subclass constructor, so this stays in the persistence layer, not a
 * cross-module dependency.
 */
export abstract class BaseRepository<TRow> {
  constructor(
    protected db: Db,
    private table: any,
  ) {}

  protected async findScoped(workspaceId: string, id: string): Promise<TRow | undefined> {
    const [row] = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.workspaceId, workspaceId), eq(this.table.id, id)));
    return row as TRow | undefined;
  }

  protected async listScoped(workspaceId: string): Promise<TRow[]> {
    return this.db.select().from(this.table).where(eq(this.table.workspaceId, workspaceId));
  }
}
