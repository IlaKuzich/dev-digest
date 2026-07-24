import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { TeamRepository } from './repository.js';
import { toTeamDto } from './helpers.js';

export class TeamService {
  private repo: TeamRepository;

  constructor(private container: Container) {
    this.repo = new TeamRepository(container.db);
  }

  async list(workspaceId: string) {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toTeamDto);
  }

  async get(workspaceId: string, id: string) {
    const row = await this.repo.getById(id);
    if (!row) throw new NotFoundError('Team not found');
    return toTeamDto(row);
  }

  async rename(workspaceId: string, id: string, name: string): Promise<void> {
    await this.repo.rename(workspaceId, id, name);
  }
}
