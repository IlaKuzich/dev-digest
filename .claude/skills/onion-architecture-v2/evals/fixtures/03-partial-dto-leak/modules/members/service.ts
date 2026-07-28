import type { Container } from '../../platform/container.js';
import { MemberRepository } from './repository.js';
import { toMemberDto } from './helpers.js';

export class MemberService {
  private repo: MemberRepository;

  constructor(private container: Container) {
    this.repo = new MemberRepository(container.db);
  }

  async list(workspaceId: string) {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toMemberDto);
  }
}
