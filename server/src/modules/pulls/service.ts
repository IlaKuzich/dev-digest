import type { PrMeta, PrDetail, PrReviewComment, PrCommentInput, GitHubClient } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RepoRepository } from '../repos/repository.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { PullsRepository } from './repository.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { BACKFILL_LIMIT } from './constants.js';
import {
  buildFindingsBuckets,
  toPrMetaDto,
  prDetailFromGitHub,
  prDetailFromPersisted,
  type PrListRollups,
} from './helpers.js';
import { rollupRunsByPr } from '../reviews/rollup.js';

type PrListReadModel = Pick<ReviewRepository, 'doneRunsForRollup' | 'activeFindingsForPrs'>;

/**
 * F1 — pulls use case. GitHub PR import (list + per-PR detail) and inline
 * review comments. Local-first: sync from GitHub when a token is configured,
 * but never fail the read — persisted/seeded PRs stay viewable offline.
 *
 * No HTTP and no raw SQL live here — persistence goes through PullsRepository /
 * ReviewRepository, pure transforms through helpers.ts.
 */
export class PullsService {
  private readonly repos: Pick<RepoRepository, 'getById'>;
  private readonly pulls: PullsRepository;
  private readonly reviews: PrListReadModel;

  constructor(
    private container: Container,
    repos: Pick<RepoRepository, 'getById'> = container.reposRepo,
    pulls: PullsRepository = container.pullsRepo,
    reviews: PrListReadModel = container.reviewRepo,
  ) {
    this.repos = repos;
    this.pulls = pulls;
    this.reviews = reviews;
  }

  /** Best-effort GitHub client — null when no token / offline. */
  private async githubOrNull(): Promise<GitHubClient | null> {
    try { return await this.container.github(); } catch { return null; }
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.githubOrNull();
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        await this.pulls.upsertFromGitHub(workspaceId, repo.id, pulls);
      } catch {
        // offline / error → serve persisted PRs
      }
    }

    const rows = await this.pulls.listByRepo(repo.id);

    // Backfill diff stats for freshly-imported PRs (zeroed size/diff), capped.
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await this.pulls.updateStats(r.id, {
            additions: detail.additions,
            deletions: detail.deletions,
            filesCount: detail.files_count,
          });
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch {
          // per-PR backfill is best-effort
        }
      }
    }

    const prIds = rows.map((r) => r.id);
    const [runRows, findings] = await Promise.all([
      this.reviews.doneRunsForRollup(prIds),
      this.reviews.activeFindingsForPrs(prIds),
    ]);
    const rollups: PrListRollups = {
      metrics: rollupRunsByPr(runRows),
      findings: buildFindingsBuckets(findings),
    };

    const now = Date.now();
    return rows.map((r) => toPrMetaDto(r, rollups, now));
  }

  async getDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const pr = await this.pulls.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repos.getById(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.pulls.replaceFiles(pr.id, detail.files);
      await this.pulls.replaceCommits(pr.id, detail.commits);
      await this.pulls.updateDetail(pr.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return prDetailFromGitHub(pr, detail);
    } catch {
      const files = await this.pulls.getFiles(pr.id);
      const commits = await this.pulls.getCommits(pr.id);
      return prDetailFromPersisted(pr, files, commits);
    }
  }

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const pr = await this.pulls.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repos.getById(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    const gh = await this.githubOrNull();
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch {
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
