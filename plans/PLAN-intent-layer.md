# Plan: Intent Layer

> Status: DRAFT
> Created: 2026-06-25

## Problem

PR reviews run blind to intent — the main review agent sees a diff but not why
the PR was opened. This leads to findings scattered across all changed areas,
including code the author never meant to touch, and no way for the reviewer to
distinguish deliberate scope from accidental noise.

The Intent Layer adds a cheap pre-classification step: one structured LLM call
(flash-class model) derives `{ summary, in_scope[], out_of_scope[] }` from the
PR title, optional body, and hunk-header file list — without reading diff bodies.
The derived intent is injected into the main review prompt so agents focus their
findings, and shown as a card on the PR Overview tab.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| shared contracts | `server/src/vendor/shared/contracts/` | Modify (2 files) |
| reviewer-core prompt | `reviewer-core/src/prompt.ts` | Modify |
| reviewer-core engine | `reviewer-core/src/review/run.ts` | Modify |
| reviews: deriver | `server/src/modules/reviews/intent-deriver.ts` | Add (new file) |
| reviews: executor | `server/src/modules/reviews/run-executor.ts` | Modify |
| reviews: service | `server/src/modules/reviews/service.ts` | Modify |
| reviews: routes | `server/src/modules/reviews/routes.ts` | Modify |
| client: hooks | `client/src/lib/hooks/pulls.ts` | Modify |
| client: IntentCard | `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/` | Add (new dir) |
| client: OverviewTab | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | Modify |
| client: PR page | `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Modify |

## Already Exists — Do NOT Rebuild

| Asset | Location |
|-------|----------|
| `prIntent` table | `server/src/db/schema/reviews.ts:48` |
| `ReviewRepository.upsertIntent / getIntent` | `server/src/modules/reviews/repository.ts:130-136` |
| `Intent` Zod schema `{ intent, in_scope[], out_of_scope[] }` | `server/src/vendor/shared/contracts/brief.ts:9` |
| `FeatureModelId = 'review_intent'` | `server/src/vendor/shared/contracts/platform.ts:14` |
| `resolveFeatureModel(container, workspaceId, id)` | `server/src/modules/settings/feature-models.ts:51` |
| `wrapUntrusted(label, content)` | `reviewer-core/src/prompt.ts:30` |
| `loadDiff()` | `server/src/modules/reviews/diff-loader.ts` |
| `RunLogger` + `runLog.step(label, fn, {kind})` | `server/src/platform/run-logger.ts` |

## Tasks

### TASK-001: Shared contracts

**Scope:** both (shared — consumed by reviewer-core and server)

**Owned Paths:**
- `server/src/vendor/shared/contracts/platform.ts`
- `server/src/vendor/shared/contracts/trace.ts`

**Changes:**

`platform.ts` — change the `review_intent` entry in `FEATURE_MODELS` array:
```typescript
// before
{ id: 'review_intent', ..., defaultProvider: 'openai', defaultModel: 'gpt-4.1' }
// after
{ id: 'review_intent', ..., defaultProvider: 'openrouter', defaultModel: 'deepseek/deepseek-v4-flash' }
```

`trace.ts` — add `intent` to `PromptAssembly` Zod schema after `pr_description`:
```typescript
intent: z.string().nullish(),
```

**Acceptance Criteria:**
- [ ] AC-001: `PromptAssembly` TypeScript type includes `intent?: string | null`
- [ ] AC-002: `FEATURE_MODELS.find(f => f.id === 'review_intent').defaultModel === 'deepseek/deepseek-v4-flash'`

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `cd server && pnpm typecheck` passes |
| AC-002 | Inspect `platform.ts` directly |

---

### TASK-002: reviewer-core — prompt injection

**Scope:** backend (reviewer-core)

**Owned Paths:**
- `reviewer-core/src/prompt.ts`
- `reviewer-core/src/review/run.ts`

**Changes to `prompt.ts`:**

1. Add `intent?: string` to `PromptParts` interface (after `prDescription`):
```typescript
/** Derived PR intent + scope (pre-formatted string). Untrusted-wrapped.
 *  When present, injected after prDescription so the agent focuses findings. */
intent?: string;
```

2. In `assemblePrompt()`, after the `prDescription` push block, insert:
```typescript
if (parts.intent && parts.intent.trim().length > 0) {
  userSections.push(
    `## PR intent and scope\n${wrapUntrusted('intent', parts.intent)}\n\n` +
    `Focus findings on the in-scope areas above. ` +
    `If a serious correctness or security defect exists outside the declared scope, ` +
    `emit at most one finding for it.`
  );
}
```
**Critical:** The instruction sentence MUST be outside the `<untrusted>` block — it is a trusted instruction, injection-resistant by position.

3. Add `intent: parts.intent ?? null` to the returned `PromptAssembly` object.

**Changes to `run.ts`:**

1. Add `intent?: string` to `ReviewInput` after `prDescription`:
```typescript
/** Pre-formatted intent block from IntentDeriver. Passed to assemblePrompt. */
intent?: string;
```

2. In `promptParts` construction, add:
```typescript
...(input.intent ? { intent: input.intent } : {}),
```

**Acceptance Criteria:**
- [ ] AC-001: `assemblePrompt({ ..., intent: 'foo' })` → user message contains `## PR intent and scope`
- [ ] AC-002: The intent section contains `<untrusted source="intent">` wrapping the value
- [ ] AC-003: The "Focus findings" instruction appears AFTER the closing `</untrusted>` tag
- [ ] AC-004: `assemblePrompt({...})` without `intent` → section absent (no regression)
- [ ] AC-005: `cd reviewer-core && npm run typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001–004 | `cd reviewer-core && npm test` (extend existing `prompt.test.ts` with 2 cases) |
| AC-005 | `cd reviewer-core && npm run typecheck` |

---

### TASK-003: Intent deriver (new server file)

**Scope:** backend

**Owned Paths:**
- `server/src/modules/reviews/intent-deriver.ts` (new file)

**Implementation:**

```typescript
import type { Container } from '../../platform/container.js';
import type { ReviewRepository, PullRow } from './repository.js';
import type { UnifiedDiff, Intent, IssueMeta, Provider } from '@devdigest/shared';
import { Intent as IntentSchema } from '@devdigest/shared';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { RunLogger } from '../../platform/run-logger.js';

const MAX_BODY_CHARS = 2000;

const INTENT_SYSTEM_PROMPT =
  'You are a PR intent classifier. Given a PR title, optional description, and a list ' +
  'of changed files with their hunk positions (no code bodies), output the PR\'s intent ' +
  'summary, what changes are in scope, and what is explicitly out of scope. ' +
  'If there is no description, infer intent from the title and changed file paths — ' +
  'this is expected and sufficient. Be concise and specific.';

function formatIntent(data: Intent): string {
  return (
    `Summary: ${data.intent}\n` +
    `In scope: ${data.in_scope.join('; ')}\n` +
    `Out of scope: ${data.out_of_scope.join('; ')}`
  );
}

export async function deriveIntent(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  diff: UnifiedDiff,
  runLog: RunLogger,
  linkedIssue?: IssueMeta,          // ← optional: fetched best-effort by caller
  forceRecalculate?: boolean,       // ← true = skip cache check (Recalculate button)
): Promise<string | undefined> {
  try {
    // Step 0 — cache check: skip if headSha hasn't moved (unless forced)
    const cached = await repo.getIntent(pull.id);
    if (!forceRecalculate && cached && pull.lastReviewedSha === pull.headSha) {
      runLog.info('Intent: using cached (headSha unchanged)');
      return formatIntent(cached);
    }

    // Step 1 — resolve cheap model
    const { provider, model } = await resolveFeatureModel(container, workspaceId, 'review_intent');

    // Step 2 — get LLM provider (may throw if key not configured)
    let llm;
    try {
      llm = await container.llm(provider as Provider);
    } catch (err) {
      runLog.warn(`Intent: provider "${provider}" not configured — skipping (${(err as Error).message})`);
      return undefined;
    }

    // Step 3 — build input (hunk headers only, no patch bodies)
    const lines: string[] = [`PR #${pull.number}: ${pull.title}`];
    if (pull.body && pull.body.trim().length > 0) {
      lines.push('', pull.body.slice(0, MAX_BODY_CHARS));
    }
    // Linked issue: title + body give the classifier the original requirement/spec
    if (linkedIssue) {
      lines.push('', `Linked issue #${linkedIssue.number}: ${linkedIssue.title}`);
      if (linkedIssue.body && linkedIssue.body.trim().length > 0) {
        lines.push(linkedIssue.body.slice(0, 1000));
      }
    }
    lines.push('', 'Changed files:');
    for (const file of diff.files) {
      for (const hunk of file.hunks) {
        // UnifiedDiff hunk shape — use hunk.header string if available,
        // otherwise format from oldStart/oldLines/newStart/newLines fields.
        const header = (hunk as { header?: string }).header
          ?? `@@ -${(hunk as { oldStart: number }).oldStart},${(hunk as { oldLines: number }).oldLines} +${(hunk as { newStart: number }).newStart},${(hunk as { newLines: number }).newLines} @@`;
        lines.push(`${header} ${file.path}`);
      }
    }
    const inputText = lines.join('\n');

    // Step 4 — log token savings
    const diffRaw = (diff as { raw?: string }).raw ?? '';
    runLog.info(
      `Intent input: ~${Math.ceil(inputText.length / 4)} est. tokens ` +
      `(vs ~${Math.ceil(diffRaw.length / 4)} for full diff)`
    );

    // Step 5 — classify
    const result = await llm.completeStructured<Intent>({
      model,
      schema: IntentSchema,
      schemaName: 'Intent',
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: inputText },
      ],
      temperature: 0.2,
      maxTokens: 512,
    });

    // Step 6 — persist
    await repo.upsertIntent(pull.id, result.data);

    return formatIntent(result.data);
  } catch (err) {
    runLog.warn(`Intent derivation failed: ${(err as Error).message} — continuing without intent`);
    return undefined;
  }
}
```

**Note on `UnifiedDiff` hunk shape:** Check the actual `DiffHunk` type in `@devdigest/shared`. The implementation above handles both a `hunk.header` string and separate `oldStart/oldLines/newStart/newLines` fields. Use whichever the type provides.

**Acceptance Criteria:**
- [ ] AC-001: Returns `undefined` (does not throw) when provider is not configured
- [ ] AC-002: Returns cached formatted string when `pull.lastReviewedSha === pull.headSha` and intent exists — no LLM call made
- [ ] AC-003: On successful derivation, calls `repo.upsertIntent(pull.id, ...)` and returns formatted string
- [ ] AC-004: LLM input does NOT contain patch body lines (lines starting with `+` or `-`)
- [ ] AC-005: `cd server && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | Unit test: mock `container.llm` to throw; assert return is `undefined` |
| AC-002 | Unit test: seed `repo.getIntent` mock; set `pull.lastReviewedSha === pull.headSha`; assert LLM not called |
| AC-003 | Unit test: mock LLM to return fixture Intent; assert `upsertIntent` called with that data |
| AC-004 | Unit test: inspect `inputText` built from a fixture diff; assert no `+`/`-` lines |
| AC-005 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` |

---

### TASK-004: Wire intent into run-executor and routes

**Scope:** backend

**Owned Paths:**
- `server/src/modules/reviews/run-executor.ts`
- `server/src/modules/reviews/service.ts`
- `server/src/modules/reviews/routes.ts`

**Changes to `run-executor.ts`:**

After the diff-load block (after `runLog.info('Diff ready — ...')` at line ~124), before the agent `for` loop — insert:

```typescript
// Cancellation gate before intent LLM call
if (jobs.some((j) => this.container.runBus.isCancelled(j.runId))) {
  await failAll('Cancelled before intent derivation');
  return;
}

// Best-effort: fetch linked issue for richer intent context.
// Parse "Closes #N" / "Fixes #N" / "Resolves #N" from PR body.
let linkedIssue: IssueMeta | undefined;
if (pull.body) {
  const m = pull.body.match(/(Closes|Fixes|Resolves)\s+#(\d+)/i);
  if (m) {
    const issueNumber = parseInt(m[2], 10);
    try {
      // Check exact method name on container.github before implementing.
      // Expected shape: getIssue(owner, repoName, number) → IssueMeta
      linkedIssue = await this.container.github.getIssue(
        repo.owner, repo.name, issueNumber,
      );
      runLog.info(`Intent: linked issue #${issueNumber} fetched — "${linkedIssue?.title}"`);
    } catch {
      runLog.info(`Intent: linked issue #${issueNumber} fetch failed — skipping`);
    }
  }
}

let intentText: string | undefined;
try {
  intentText = await runLog.step(
    'Deriving PR intent',
    () => deriveIntent(this.container, this.repo, workspaceId, pull, diff, runLog, linkedIssue),
    { kind: 'tool' },
  );
} catch { /* deriveIntent swallows; this is a safety net */ }
runLog.info(intentText
  ? 'Intent derived — injecting into review prompt'
  : 'Continuing without intent (not derived or failed)',
);
```

Add `intent?: string` to `runOneAgent()` private method signature. Pass `intentText` when calling `runOneAgent()` inside the loop. Inside `runOneAgent()`, add `...(intent ? { intent } : {})` to the `reviewPullRequest()` call.

In `traceFromBuffer()` method (line ~513), add `intent: null` to the stub `prompt_assembly` object (required now that `PromptAssembly` has the field).

Import `deriveIntent` from `'./intent-deriver.js'`.

**Changes to `service.ts`:**

Add two methods to `ReviewService`:

```typescript
async getIntent(workspaceId: string, prId: string): Promise<Intent | undefined> {
  const pull = await this.repo.getPull(workspaceId, prId);
  if (!pull) return undefined;
  return this.repo.getIntent(prId);
}

async recalculateIntent(
  workspaceId: string,
  prId: string,
  logger: Logger,
): Promise<string | undefined> {
  const pull = await this.repo.getPull(workspaceId, prId);
  if (!pull) return undefined;
  const repo = await this.repo.getRepo(pull.repoId);
  if (!repo) return undefined;
  const diff = await loadDiff(this.container, this.repo, workspaceId, pull, repo);
  // Empty runIds = no SSE fan-out; pino logger still captures logs
  const runLog = new RunLogger(this.container.runBus, [], logger, { prId });
  // forceRecalculate=true bypasses the headSha cache check
  return deriveIntent(this.container, this.repo, workspaceId, pull, diff, runLog, undefined, true);
}
```

`Logger` type is already defined in `run-executor.ts` — import it from there or re-use `FastifyBaseLogger`.

**Changes to `routes.ts`:**

Append to the existing `reviewsRoutes` plugin:

```typescript
// GET /pulls/:id/intent — return stored intent (404 if not yet derived)
app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req, reply) => {
  const { workspaceId } = await getContext(container, req);
  const intent = await service.getIntent(workspaceId, req.params.id);
  if (!intent) {
    return reply.status(404).send({
      error: { code: 'intent_not_found', message: 'Intent not yet derived for this PR' },
    });
  }
  return intent;
});

// POST /pulls/:id/intent/recalculate — force re-derive (ignores headSha cache)
app.post(
  '/pulls/:id/intent/recalculate',
  { schema: { params: IdParams }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const intentText = await service.recalculateIntent(workspaceId, req.params.id, req.log);
    if (!intentText) {
      return reply.status(500).send({
        error: { code: 'intent_failed', message: 'Intent derivation failed' },
      });
    }
    return service.getIntent(workspaceId, req.params.id);
  },
);
```

**Note on recalculate ignoring cache:** The recalculate route bypasses the `lastReviewedSha` cache by passing to `deriveIntent` a pull where `lastReviewedSha` may equal `headSha`. To force re-derivation, either: (a) call `repo.getIntent` before passing pull and clear it, or (b) accept that the cache check in `deriveIntent` will return cached — and the recalculate button is therefore a no-op unless headSha changed. **Preferred:** pass a sentinel flag `forceRecalculate?: boolean` to `deriveIntent` that skips step 0. Add this optional param to the function signature.

**Acceptance Criteria:**
- [ ] AC-001: `GET /pulls/:id/intent` → 404 when `pr_intent` row absent
- [ ] AC-002: `GET /pulls/:id/intent` → `{ intent, in_scope, out_of_scope }` when row present
- [ ] AC-003: `POST /pulls/:id/intent/recalculate` → forces LLM call regardless of cache
- [ ] AC-004: Live Log shows `Deriving PR intent` step (amber) during a review run
- [ ] AC-005: `cd server && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001–002 | `curl -s localhost:3001/pulls/:id/intent` before and after a review run |
| AC-003 | Unit test: mock `deriveIntent`; assert called even when cache exists |
| AC-004 | Run a review via UI; observe Live Log |
| AC-005 | `cd server && pnpm typecheck` |

---

### TASK-005: Frontend — hooks, IntentCard, OverviewTab

**Scope:** frontend

**Owned Paths:**
- `client/src/lib/hooks/pulls.ts`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx` (new)
- `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/index.ts` (new)
- `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`

**`pulls.ts`** — append (add `useMutation`, `useQueryClient` to imports):

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Intent } from '@devdigest/shared';

export function usePullIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ['intent', prId],
    queryFn: () => api.get<Intent>(`/pulls/${prId}/intent`),
    enabled: prId != null,
    staleTime: 5 * 60 * 1000,
    retry: (count, err: unknown) =>
      (err as { status?: number })?.status === 404 ? false : count < 2,
  });
}

export function useRecalculateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Intent>(`/pulls/${prId}/intent/recalculate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intent', prId] }),
  });
}
```

Check `api.post` signature in `client/src/lib/api.ts` and match exactly.

**`IntentCard/IntentCard.tsx`** — new "use client" component:

```tsx
'use client';
import React from 'react';
import { SectionLabel } from '@devdigest/ui';
import type { Intent } from '@devdigest/shared';
// Import styles following the exact pattern used in OverviewTab/styles.ts

interface IntentCardProps {
  intent: Intent | null | undefined;
  isLoading: boolean;
  onRecalculate: () => void;
  recalculating: boolean;
}

export function IntentCard({ intent, isLoading, onRecalculate, recalculating }: IntentCardProps) {
  if (isLoading || !intent) return null; // silent — no empty state clutter

  return (
    <section>
      <SectionLabel icon="Target">Intent</SectionLabel>
      <div style={{ /* match OverviewTab descriptionBox style */ }}>
        <p style={{ fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: 12 }}>
          &ldquo;{intent.intent}&rdquo;
        </p>

        {intent.in_scope.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              In scope
            </span>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              {intent.in_scope.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        {intent.out_of_scope.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Out of scope
            </span>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              {intent.out_of_scope.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        <button
          onClick={onRecalculate}
          disabled={recalculating}
          style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {recalculating ? 'Recalculating…' : '↻ Recalculate'}
        </button>
      </div>
    </section>
  );
}
```

Look at actual style variables used in `OverviewTab/styles.ts` and neighboring `_components/` folders and apply exactly those patterns.

**`OverviewTab.tsx`** — update:
```tsx
'use client';
import { IntentCard } from '../IntentCard';
import { usePullIntent, useRecalculateIntent } from '@/lib/hooks/pulls';

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null | undefined;  // new
}

export function OverviewTab({ prBody, prId }: OverviewTabProps) {
  const { data: intent, isLoading } = usePullIntent(prId);
  const recalc = useRecalculateIntent(prId);

  return (
    <>
      <IntentCard
        intent={intent}
        isLoading={isLoading}
        onRecalculate={() => recalc.mutate()}
        recalculating={recalc.isPending}
      />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
```

**`page.tsx`** — find the existing `<OverviewTab prBody={pr.body} />` line and add `prId={prId}`. The `prId` variable is already present in this component.

**Acceptance Criteria:**
- [ ] AC-001: Intent card renders on Overview tab after a review run produces intent
- [ ] AC-002: Card is absent (no error, no empty box) when no intent derived yet
- [ ] AC-003: Recalculate button calls `POST /pulls/:id/intent/recalculate` and card refreshes
- [ ] AC-004: `cd client && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001–003 | Manual: run a review, observe Overview tab; click Recalculate |
| AC-004 | `cd client && pnpm typecheck` |

---

## Implementation Phases

### Phase 1: Shared contracts (TASK-001)
- [ ] Modify `platform.ts` — change `review_intent` default model
- [ ] Modify `trace.ts` — add `intent` to `PromptAssembly`
- [ ] `cd server && pnpm typecheck` — baseline green

### Phase 2: reviewer-core (TASK-002)
- [ ] Modify `reviewer-core/src/prompt.ts` — add `intent` to `PromptParts` + render section
- [ ] Modify `reviewer-core/src/review/run.ts` — add `intent` to `ReviewInput`
- [ ] `cd reviewer-core && npm run typecheck`

### Phase 3: Backend (TASK-003 + TASK-004)
- [ ] Create `server/src/modules/reviews/intent-deriver.ts`
- [ ] Modify `run-executor.ts` — wire derivation before agent loop
- [ ] Modify `service.ts` — add `getIntent` + `recalculateIntent`
- [ ] Modify `routes.ts` — add 2 new routes
- [ ] `cd server && pnpm typecheck`

### Phase 4: Frontend (TASK-005)
- [ ] Modify `client/src/lib/hooks/pulls.ts` — add hooks
- [ ] Create `IntentCard/IntentCard.tsx` + `index.ts`
- [ ] Modify `OverviewTab.tsx` — mount IntentCard
- [ ] Modify `page.tsx` — pass `prId`
- [ ] `cd client && pnpm typecheck`

### Phase 5: Verification
- [ ] `cd reviewer-core && npm test` — prompt injection tests pass
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — unit tests pass
- [ ] Manual: run a review → Live Log shows `Deriving PR intent` step (amber)
- [ ] Manual: Live Log shows token savings line
- [ ] Manual: Intent card visible on Overview tab
- [ ] Manual: `GET localhost:3001/pulls/:id/intent` → `{ intent, in_scope, out_of_scope }`
- [ ] Manual: Recalculate button refreshes card

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `UnifiedDiff` hunk shape differs from plan assumption | Code uses runtime duck-type check (`hunk.header ?? format from fields`); fails gracefully |
| `api.post` signature in client differs | Read `client/src/lib/api.ts` before implementing hook |
| `PromptAssembly` change breaks existing `traceFromBuffer` stub | Add `intent: null` to stub in same TASK-004 commit |
| Recalculate ignores cache unintentionally | Add `forceRecalculate?: boolean` param to `deriveIntent` |

## Out of Scope

- No DB migration needed (`prIntent` table already exists)
- No new Drizzle schema changes
- No changes to `platform/container.ts` (no new adapter or service to wire)
- Linked issue body is NOT fetched separately — PR body often contains "Closes #N" which is sufficient context
- No i18n strings (UI labels are developer-facing, consistent with existing OverviewTab)
- No changes to CI runner (`@devdigest/e2e`, `reviewer-core` CLI path)

## Architecture Notes

- `deriveIntent` is a **free function** (not a class method) — consistent with `loadDiff`, `taskLine` patterns in the reviews module.
- Intent is derived **once per PR run** (before the agent loop), not once per agent. All agents in a run share the same intent string.
- The instruction "Focus findings on in-scope areas…" is placed **outside** `<untrusted>` — it is trusted, not data. The `INJECTION_GUARD` in `reviewer-core/src/prompt.ts` already lists "derived intent/scope" as untrusted data (the value), while the reviewer instruction is authoritative.
- `RunLogger` with `runIds: []` in the recalculate route = no SSE fan-out, but pino still captures logs. This is the established pattern for standalone background ops not tied to a run bus.
- TASK-001 must land before TASK-002 (reviewer-core needs the updated `PromptAssembly` type). All other tasks can proceed in parallel if paths don't overlap — and they don't (verified above).
