import type { Container } from '../../platform/container.js';
import type {
  CreateSkillInput,
  Skill,
  SkillSource,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto, versionHistory } from './helpers.js';

/** A1 — skills service. CRUD backing the Skills page + Agent editor Skills tab. */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(
    workspaceId: string,
    input: CreateSkillInput,
    source: SkillSource = 'manual',
  ): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  // ---- versions ------------------------------------------------------------
  // The workspace guard lives here, not in the repository: `repo.listVersions`
  // /`repo.getVersion` key off skillId alone, so skipping the `getById` check
  // would leak snapshots across workspaces.

  /** Version history, newest first. `undefined` when the skill is out of scope. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return versionHistory(skill, await this.repo.listVersions(id));
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(id, version);
    if (row) return toSkillVersionDto(row);
    // Legacy skills have no row for their live version — synthesize it.
    return versionHistory(skill, []).find((v) => v.version === version);
  }

  /**
   * Restore a past version's body. Forward-only: the body is re-applied as a
   * NEW version rather than rewinding, so history is never rewritten and eval
   * runs stay reproducible against the versions they scored.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
    note?: string,
  ): Promise<Skill | undefined> {
    const target = await this.getVersion(workspaceId, id, version);
    if (!target) return undefined;
    return this.update(workspaceId, id, { body: target.body, note: note ?? `Restored v${version}` });
  }
}
