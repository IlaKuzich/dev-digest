import type { FindingActionKind } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from './repository.js';
import { findingRowToDto, type ReviewDtoFinding } from './helpers.js';

export interface ActOnFindingOptions {
  /** The optional reply text posted with a `reply` action. */
  reply?: string;
  /** The shared, container-owned MemoryRepository (A5 `learn` action reuses
   *  it rather than reaching into `modules/memory/repository.ts` directly). */
  memoryRepo?: Container['memoryRepo'];
}

/**
 * Finding actions: accept / dismiss / learn / reply (A5 wires the last two;
 * `learn` and `reply` previously fell through to `invalid_action`). These
 * decisions are the dataset later lessons build on (eval cases from
 * accept/dismiss, the `learn → memory` action, etc.).
 */
export async function actOnFinding(
  repo: ReviewRepository,
  workspaceId: string,
  findingId: string,
  action: FindingActionKind,
  opts: ActOnFindingOptions = {},
): Promise<{ finding: ReviewDtoFinding; reply?: string }> {
  const ctx = await repo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) {
    throw new NotFoundError('Finding not found');
  }

  switch (action) {
    case 'accept': {
      const row = await repo.setFindingAccepted(findingId, new Date());
      return { finding: findingRowToDto(row!) };
    }
    case 'dismiss': {
      const row = await repo.setFindingDismissed(findingId, new Date());
      return { finding: findingRowToDto(row!) };
    }
    case 'learn': {
      // Persist the finding as a repo-scoped learning signal via the shared
      // MemoryRepository (container-owned, same reuse pattern as
      // `container.agentsRepo`/`container.reviewRepo` elsewhere — not a
      // reach-in to `modules/memory`'s own files). `findings` has no
      // dedicated `learned_at` column (out of this task's schema scope, see
      // the plan's own escape hatch for this exact gap), so acceptance
      // doubles as the persisted "acted on" flag alongside the memory row.
      if (opts.memoryRepo) {
        await opts.memoryRepo.create({
          workspaceId,
          repoId: ctx.pull.repoId,
          scope: 'repo',
          kind: 'learning',
          content: `${ctx.finding.title}\n\n${ctx.finding.rationale}`,
          confidence: 0.75,
          source: 'auto',
          sources: [findingId],
        });
      }
      const row = await repo.setFindingAccepted(findingId, new Date());
      return { finding: findingRowToDto(row!) };
    }
    case 'reply': {
      // No dedicated reply-text column on `findings` (out of this task's
      // schema scope — noted in the implementer's report). The finding is
      // left unchanged; the reply is validated and echoed back.
      const finding = findingRowToDto(ctx.finding);
      return opts.reply !== undefined ? { finding, reply: opts.reply } : { finding };
    }
    default:
      throw new AppError('invalid_action', `Action '${action}' is not available in the starter`, 400);
  }
}
