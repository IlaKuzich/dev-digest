import type { Container } from '../../platform/container.js';
import { ExportRepository } from './repository.js';
import { RepoRepository } from '../repos/repository.js';
import { toCsvLine } from './helpers.js';

export interface ExportRow {
  prNumber: number;
  repoFullName: string;
  verdict: string;
}

export class ExportService {
  private repo: ExportRepository;
  private reposRepo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ExportRepository(container.db);
    this.reposRepo = new RepoRepository(container.db);
  }

  async buildCsv(workspaceId: string, repoId: string): Promise<string> {
    const repo = await this.reposRepo.getById(workspaceId, repoId);
    const findings = await this.repo.listFindings(workspaceId, repoId);
    const rows: ExportRow[] = findings.map((f) => ({
      prNumber: f.prNumber,
      repoFullName: repo?.fullName ?? 'unknown',
      verdict: f.severity,
    }));
    return rows.map(toCsvLine).join('\n');
  }
}
