# Plan: Blast Radius

> Status: DRAFT
> Created: 2026-06-29

## Problem

The server-side `getBlastRadius()` logic exists in `repo-intel/service.ts` but is not exposed via HTTP API. The MCP tool `get_blast_radius` is a stub returning hardcoded text. The client has a static `BlastRadiusPlaceholder` in OverviewTab. This plan wires the full stack: Zod contract, HTTP endpoint, MCP tool, React hook, and interactive UI with tree/graph views and prior-PR history.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| shared: contracts | `server/src/vendor/shared/contracts/brief.ts` | Modify |
| backend: `blast` | `server/src/modules/blast/` | Add |
| backend: module registry | `server/src/modules/index.ts` | Modify |
| mcp: tool | `mcp/src/tools/get-blast-radius.ts` | Modify |
| mcp: server | `mcp/src/server.ts` | Modify |
| frontend: hooks | `client/src/lib/hooks/pulls.ts` | Modify |
| frontend: BlastRadiusCard | `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/` | Add |
| frontend: OverviewTab | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | Modify |

## Tasks

### TASK-001: Shared Zod contract — BlastRadiusResult schema

**Scope:** backend (shared contract)

**Owned Paths:**
- `server/src/vendor/shared/contracts/brief.ts`

**Description:**

Add new Zod schemas to `brief.ts` for the blast radius HTTP response shape. Append **after** the existing `BlastRadius` schema (line ~65). Use `Blast`-prefixed names to avoid conflicts with existing `ChangedSymbol` / `BlastCaller` types already in the file.

**Schemas to add (at end of file, before `PrBrief`):**

```typescript
// ---- Blast Radius HTTP response (GET /pulls/:id/blast) ----
export const BlastDegradedReason = z.enum([
  'flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastChangedSymbol = z.object({
  file: z.string(), name: z.string(), kind: z.string(),
});
export type BlastChangedSymbol = z.infer<typeof BlastChangedSymbol>;

export const BlastCallerRow = z.object({
  file: z.string(), symbol: z.string(), viaSymbol: z.string(),
  line: z.number().int(), rank: z.number().int(),
});
export type BlastCallerRow = z.infer<typeof BlastCallerRow>;

export const PriorPr = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  openedAt: z.string().nullable(),
  status: z.string(),
});
export type PriorPr = z.infer<typeof PriorPr>;

export const BlastRadiusResult = z.object({
  changedSymbols: z.array(BlastChangedSymbol),
  callers: z.array(BlastCallerRow),
  impactedEndpoints: z.array(z.string()),
  factsByFile: z.record(z.object({
    endpoints: z.array(z.string()),
    crons: z.array(z.string()),
  })).optional(),
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
  priorPrs: z.array(PriorPr).optional(),
  summary: z.string().optional(),
});
export type BlastRadiusResult = z.infer<typeof BlastRadiusResult>;
```

**Key decisions:**
- Name `BlastDegradedReason` (not `DegradedReason`) to avoid future name clashes. The enum values align with `DegradedReason` in `server/src/modules/repo-intel/types.ts` (line 27-32).
- `PriorPr` and `summary` included from the start so TASK-007 and TASK-008 don't need to touch this file again.
- Do NOT modify the existing `BlastRadius` / `ChangedSymbol` / `BlastCaller` schemas (lines 38-65) -- those are the LLM-generated brief shape, not the HTTP API shape.

> ⚠️ Два параллельных типа с похожими именами:
> - `repo-intel/types.ts`: `BlastResult`, `BlastChangedSymbol`, `BlastCallerRow` — INTERNAL типы,
>   используются только внутри `server/src/modules/repo-intel/`
> - `brief.ts`: `BlastRadiusResult`, `BlastChangedSymbol`, `BlastCallerRow` — HTTP CONTRACT,
>   экспортируются через `@devdigest/shared`, используются клиентом и MCP
>
> `BlastService` маппит internal → contract в `getForPr()` перед возвратом.
> Имена намеренно совпадают, но это разные типы в разных слоях.

**Acceptance Criteria:**
- [ ] AC-001: No naming conflicts with existing types in `brief.ts`
- [ ] AC-002: All new types exported via `@devdigest/shared` alias
- [ ] AC-003: `BlastDegradedReason` enum covers all 5 values from `repo-intel/types.ts` `DegradedReason`
- [ ] AC-004: `server && pnpm typecheck` passes
- [ ] AC-005: `client && pnpm typecheck` passes (alias resolves)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | Grep `brief.ts` for duplicate export names |
| AC-004 | `cd server && pnpm typecheck` |
| AC-005 | `cd client && pnpm typecheck` |

---

### TASK-002: Server module `blast/` with GET /pulls/:id/blast

**Scope:** backend

**Owned Paths:**
- `server/src/modules/blast/repository.ts`
- `server/src/modules/blast/service.ts`
- `server/src/modules/blast/routes.ts`
- `server/src/modules/blast/index.ts`
- `server/src/modules/index.ts` (add one import + one entry)

**Description:**

Create the `blast` module following the exact pattern from `pulls/routes.ts`. The module exposes a single route `GET /pulls/:id/blast` that:
1. Resolves `pr` + `repo` via DB (same `resolvePrAndRepo` pattern as `pulls/routes.ts` line 372-389)
2. Fetches changed file paths from `t.prFiles`
3. Calls `container.repoIntel.getBlastRadius(repo.id, filePaths)`
4. Optionally fetches prior PRs (TASK-008 adds `getPriorPrs` method)
5. Returns `BlastRadiusResult`

**`blast/repository.ts`** (infrastructure layer — all Drizzle queries here):
```typescript
// blast/repository.ts — infrastructure layer, все Drizzle запросы здесь
import { eq, and, ne, inArray, desc } from 'drizzle-orm';
import type { DrizzleDb } from '../../platform/container.js';
import * as t from '../../db/schema.js';

export class BlastRepository {
  constructor(private readonly db: DrizzleDb) {}

  async resolvePrAndRepo(prId: string, workspaceId: string) {
    // SELECT pr + repo по prId и workspaceId
    // паттерн взят из pulls/routes.ts:resolvePrAndRepo
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));

    if (!pr) return { pr: null, repo: null };

    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, pr.repoId));

    return { pr, repo: repo ?? null };
  }

  async getChangedFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map(r => r.path);
  }

  async findPriorPrsTouchingSameFiles(
    repoId: string,
    excludePrId: string,
    paths: string[],
    limit = 5,
  ) {
    if (paths.length === 0) return [];
    return this.db
      .selectDistinct({ id: t.pullRequests.id, number: t.pullRequests.number,
        title: t.pullRequests.title, openedAt: t.pullRequests.openedAt, status: t.pullRequests.status })
      .from(t.pullRequests)
      .innerJoin(t.prFiles, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(
        eq(t.pullRequests.repoId, repoId),
        ne(t.pullRequests.id, excludePrId),
        inArray(t.prFiles.path, paths),
      ))
      .orderBy(desc(t.pullRequests.openedAt))
      .limit(limit);
  }
}
```

**`blast/service.ts`** (application layer — only business logic, no direct DB queries):
```typescript
// blast/service.ts — application layer, только бизнес-логика
import type { Container } from '../../platform/container.js';
import type { BlastRadiusResult } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { BlastRepository } from './repository.js';

export class BlastService {
  private readonly repo: BlastRepository;

  constructor(private readonly container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  async getForPr(prId: string, workspaceId: string): Promise<BlastRadiusResult> {
    const { pr, repo } = await this.repo.resolvePrAndRepo(prId, workspaceId);
    if (!pr) throw new NotFoundError('Pull request not found');
    if (!repo) throw new NotFoundError('Repo not found');

    const changedFiles = await this.repo.getChangedFilePaths(pr.id);

    if (changedFiles.length === 0) {
      return {
        changedSymbols: [], callers: [], impactedEndpoints: [],
        degraded: true, reason: 'no_data',
      };
    }

    const blastResult = await this.container.repoIntel.getBlastRadius(repo.id, changedFiles);

    const priorPrs = await this.repo.findPriorPrsTouchingSameFiles(repo.id, pr.id, changedFiles);
    return { ...blastResult, priorPrs };
  }
}
```

**`blast/routes.ts`:**
```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getForPr(req.params.id, workspaceId);
    },
  );
}
```

**`blast/index.ts`:**
```typescript
export { default } from './routes.js';
```

**Registration in `server/src/modules/index.ts`:**
- Add `import blast from './blast/routes.js';` after existing imports
- Add `blast,` entry in the `modules` record

**Key patterns to follow:**
- `resolvePrAndRepo` pattern from `pulls/routes.ts:372-389` -- replicated inside `BlastService` (not extracted to shared, to avoid touching `pulls/`)
- `getContext(container, req)` for workspace scoping (from `_shared/context.ts`)
- `IdParams` for `:id` validation (from `_shared/schemas.ts` -- validates UUID)
- Route export as `default` (same as `pulls/routes.ts`, `repos/routes.ts`, etc.)
- No DI changes in `platform/container.ts` needed -- uses `container.repoIntel` which already exists

**Acceptance Criteria:**
- [ ] AC-001: Directory `server/src/modules/blast/` exists with 4 files (repository.ts, service.ts, routes.ts, index.ts)
- [ ] AC-002: `BlastService` is a class (not inline function in routes)
- [ ] AC-003: Module registered in `server/src/modules/index.ts`
- [ ] AC-004: `curl localhost:3001/pulls/{valid-pr-uuid}/blast` returns 200 with `BlastRadiusResult` shape
- [ ] AC-005: `degraded: true` does not throw -- returns 200 with degraded flag
- [ ] AC-006: 404 if PR not found (NotFoundError)
- [ ] AC-007: Empty `prFiles` returns `{ degraded: true, reason: 'no_data', ... }`
- [ ] AC-008: `priorPrs` array present in response (may be empty)
- [ ] AC-009: `cd server && pnpm typecheck` passes
- [ ] AC-010: `blast/repository.ts` exists with three methods: `resolvePrAndRepo`, `getChangedFilePaths`, `findPriorPrsTouchingSameFiles`
- [ ] AC-011: `BlastService` contains no direct Drizzle queries — only calls to `this.repo.*`

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-004 | `curl http://localhost:3001/pulls/<pr-id>/blast \| jq .` |
| AC-006 | `curl http://localhost:3001/pulls/00000000-0000-0000-0000-000000000000/blast` returns 404 |
| AC-009 | `cd server && pnpm typecheck` |

---

### TASK-003: MCP tool -- implement get_blast_radius

**Scope:** mcp

**Owned Paths:**
- `mcp/src/tools/get-blast-radius.ts`
- `mcp/src/server.ts` (line ~69 only)

**Description:**

Replace the stub in `get-blast-radius.ts` with a real implementation that calls the new endpoint via `DevDigestClient`.

> ⚠️ Перед реализацией: проверить `mcp/tsconfig.json` на наличие `@devdigest/shared` alias.
> - Если alias настроен → `import type { BlastRadiusResult } from '@devdigest/shared';` и использовать этот тип вместо локального интерфейса.
> - Если alias недоступен → использовать локальный `interface BlastRadiusResult` с комментарием:
>   `// Canonical type: server/src/vendor/shared/contracts/brief.ts → BlastRadiusResult`

**`mcp/src/tools/get-blast-radius.ts` -- full replacement:**
```typescript
import type { DevDigestClient } from "../api-client.js";
import { mcpError, mcpSuccess } from "../api-client.js";

// If @devdigest/shared alias is available in mcp/tsconfig.json:
// import type { BlastRadiusResult } from '@devdigest/shared';
// Otherwise use this local interface:
// Canonical type: server/src/vendor/shared/contracts/brief.ts → BlastRadiusResult
interface BlastRadiusResult {
  changedSymbols: Array<{ file: string; name: string; kind: string }>;
  callers: Array<{ file: string; symbol: string; viaSymbol: string; line: number; rank: number }>;
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: string;
}

export async function getBlastRadius(client: DevDigestClient, args: { pr_id: string }) {
  const result = await client.request<BlastRadiusResult>("GET", `/pulls/${args.pr_id}/blast`);
  if (!result.ok) return result.result;

  const { data } = result;
  const cronSet = new Set<string>();
  if (data.factsByFile) {
    for (const facts of Object.values(data.factsByFile)) {
      facts.crons.forEach(c => cronSet.add(c));
    }
  }

  return mcpSuccess({
    pr_id: args.pr_id,
    summary: `${data.changedSymbols.length} symbols, ${data.callers.length} callers, ${data.impactedEndpoints.length} endpoints, ${cronSet.size} crons`,
    degraded: data.degraded ?? false,
    reason: data.reason ?? null,
    changedSymbols: data.changedSymbols,
    callers: data.callers,
    impactedEndpoints: data.impactedEndpoints,
    crons: [...cronSet],
  });
}
```

**`mcp/src/server.ts` line 69 fix:**
```typescript
// Current (broken):
(args) => getBlastRadius(args)
// Fix to:
(args) => getBlastRadius(client, args)
```

**Acceptance Criteria:**
- [ ] AC-001: Function signature is `async function getBlastRadius(client: DevDigestClient, args: { pr_id: string })`
- [ ] AC-002: `server.ts` passes `client` as first argument on line ~69
- [ ] AC-003: Returns `mcpSuccess` with `summary` string containing metric counts
- [ ] AC-004: When `degraded: true`, the `degraded` and `reason` fields are present in output
- [ ] AC-005: Before implementation, check `mcp/tsconfig.json` for `@devdigest/shared` alias — if present, import the type; if absent, document local interface with comment pointing to canonical type in `brief.ts`

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | Code review |
| AC-002 | `npx @modelcontextprotocol/inspector tsx --env-file=.env mcp/src/index.ts` -- call `get_blast_radius` with a valid `pr_id` |

---

### TASK-004: React hook useBlastRadius

**Scope:** frontend

**Owned Paths:**
- `client/src/lib/hooks/pulls.ts` (append only)

**Description:**

Add `useBlastRadius` hook at the end of `client/src/lib/hooks/pulls.ts`, following the exact pattern of `usePullIntent` (lines 29-37).

```typescript
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastRadiusResult>(`/pulls/${prId}/blast`),
    enabled: prId != null,
    staleTime: 5 * 60 * 1000,
    retry: (count, err: unknown) =>
      (err as { status?: number })?.status === 404 ? false : count < 2,
  });
}
```

**Required import to add at top of file:**
```typescript
import type { BlastRadiusResult } from "@devdigest/shared";
```
(Add next to existing `import type { Intent, SmartDiff } from "@devdigest/shared"` on line 7.)

**Acceptance Criteria:**
- [ ] AC-001: No request fires when `prId == null`
- [ ] AC-002: `staleTime` is 5 minutes (300000 ms)
- [ ] AC-003: 404 errors are not retried
- [ ] AC-004: `cd client && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-004 | `cd client && pnpm typecheck` |

---

### TASK-005: BlastRadiusCard component tree

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/` (entire directory -- new)

**Description:**

Create the `BlastRadiusCard` directory with these files:
- `BlastRadiusCard.tsx` -- orchestrator, < 200 lines
- `SummaryBar.tsx` -- 4 pill metrics + Tree/Graph toggle buttons
- `SymbolList.tsx` -- accordion list of symbols with callers/endpoints/crons
- `PriorPrsAccordion.tsx` -- collapsible prior-PR history block
- `helpers.ts` -- pure data transformation functions (`buildCronSet`, `buildSymbolRows`)
- `index.ts` -- barrel export

**Architecture rules:**
- Every `.tsx` file has `"use client"` directive
- NO `styles.ts` file -- all styling via Tailwind `className`
- NO `style={}` inline objects
- NO business logic in JSX -- all data transforms in `helpers.ts`
- All user-visible strings via `useTranslations("prReview.blastRadius")`
- `BlastRadiusCard.tsx` MUST be < 200 lines (only orchestrates sub-components)

**`helpers.ts` -- module-level pure functions:**

```typescript
import type { BlastRadiusResult, BlastChangedSymbol, BlastCallerRow } from "@devdigest/shared";

export interface SymbolRowData {
  sym: BlastChangedSymbol;
  callers: BlastCallerRow[];
  endpoints: Set<string>;
  crons: Set<string>;
}

export function buildCronSet(factsByFile: BlastRadiusResult['factsByFile']): Set<string> {
  const cronSet = new Set<string>();
  if (!factsByFile) return cronSet;
  for (const facts of Object.values(factsByFile)) {
    facts.crons.forEach(c => cronSet.add(c));
  }
  return cronSet;
}

export function buildSymbolRows(blastRadius: BlastRadiusResult): SymbolRowData[] {
  return blastRadius.changedSymbols.map(sym => {
    const callers = blastRadius.callers.filter(c => c.viaSymbol === sym.name);
    const callerFiles = new Set(callers.map(c => c.file));
    const endpoints = new Set<string>();
    const crons = new Set<string>();

    if (blastRadius.factsByFile) {
      for (const [file, facts] of Object.entries(blastRadius.factsByFile)) {
        if (callerFiles.has(file)) {
          facts.endpoints.forEach(e => endpoints.add(e));
          facts.crons.forEach(c => crons.add(c));
        }
      }
    } else {
      blastRadius.impactedEndpoints.forEach(e => endpoints.add(e));
    }

    return { sym, callers, endpoints, crons };
  });
}
```

**`BlastRadiusCard.tsx` -- props and three states:**

```typescript
interface BlastRadiusCardProps {
  blastRadius: BlastRadiusResult | null | undefined;
  isLoading: boolean;
}
```

Three states:
1. `isLoading` -- return `null` (or skeleton)
2. `!blastRadius` -- empty state with hint text via `useTranslations`
3. loaded -- render `<SummaryBar>`, `<SymbolList>` or `<BlastGraph>`, `<PriorPrsAccordion>`

State for view toggle: `const [activeView, setActiveView] = useState<'tree' | 'graph'>('tree');`

Root div: `className="h-80 overflow-y-auto flex flex-col"` (320px, matches IntentCard height)

**`SummaryBar.tsx`:**
- 4 pill elements: symbols, callers, endpoints, crons
- Cron pill: `{cronCount > 0 && <span>...</span>}` -- NEVER `{cronCount && ...}` (renders `0`)
- `cronCount` computed via `buildCronSet(blastRadius.factsByFile).size`
- Tree/Graph toggle buttons (right side)
- If `degraded: true` -- badge "Partial data" with `reason` below summary

**`SymbolList.tsx`:**
- Uses `buildSymbolRows(blastRadius)` from `helpers.ts`
- Accordion state: `const [openSymbol, setOpenSymbol] = useState<string | null>(null);`
- All symbols collapsed by default
- Each symbol row shows: icon + name + caller count
- Expanded: list of callers (`file:line` clickable), endpoint pills, cron pills
- Caller click: `router.push(\`/repos/\${repoId}/pulls/\${number}?tab=diff&file=\${c.file}&line=\${c.line}\`)` -- NO `window.open` fallback
- Endpoint pill colors by HTTP method (Tailwind classes, NOT inline styles):
  - GET: green (`bg-green-400/15 text-green-400`)
  - POST: blue (`bg-indigo-400/15 text-indigo-400`)
  - PUT: amber (`bg-amber-400/15 text-amber-400`)
  - DELETE: red (`bg-red-400/15 text-red-400`)
  - PATCH: purple (`bg-purple-400/15 text-purple-400`)
- Cron pills: orange (`bg-amber-500/15 text-amber-500`)

**`PriorPrsAccordion.tsx`:**
- Collapsed by default (`const [open, setOpen] = useState(false)`)
- Only renders if `priorPrs && priorPrs.length > 0`
- Each row: `#number title` + relative date
- Border-top separator

**i18n keys needed** (add to the appropriate messages file):
```
prReview.blastRadius.symbols
prReview.blastRadius.callers
prReview.blastRadius.endpoints
prReview.blastRadius.crons
prReview.blastRadius.tree
prReview.blastRadius.graph
prReview.blastRadius.partialData
prReview.blastRadius.emptyState
prReview.blastRadius.priorPrs.label
prReview.blastRadius.noGraph
```

**Acceptance Criteria:**
- [ ] AC-001: `"use client"` directive on all `.tsx` files
- [ ] AC-002: Three UI states (loading/empty/loaded) handled correctly
- [ ] AC-003: `degraded` badge visible when `degraded: true`
- [ ] AC-004: Caller `file:line` click uses `router.push` (no `window.open`)
- [ ] AC-005: Endpoint pills colored by HTTP method via Tailwind classes
- [ ] AC-006: All strings via `useTranslations("prReview.blastRadius")`
- [ ] AC-007: No `style={}` objects -- only Tailwind `className`
- [ ] AC-008: `buildCronSet` and `buildSymbolRows` in `helpers.ts`, not in components
- [ ] AC-009: `{cronCount > 0 && ...}` guard, not `{cronCount && ...}`
- [ ] AC-010: `BlastRadiusCard.tsx` < 200 lines
- [ ] AC-011: `cd client && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-010 | `wc -l BlastRadiusCard.tsx` < 200 |
| AC-011 | `cd client && pnpm typecheck` |

---

### TASK-006: Wire BlastRadiusCard into OverviewTab

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`

**Description:**

Replace the static `BlastRadiusPlaceholder` (lines 141-336) with the real `BlastRadiusCard` wrapped in an `ErrorBoundary`.

**Changes:**
1. Delete the entire `BlastRadiusPlaceholder` function (lines 141-336)
2. Add imports:
   ```typescript
   import { ErrorBoundary } from 'react-error-boundary';
   import { BlastRadiusCard } from '../BlastRadiusCard';
   import { useBlastRadius } from '@/lib/hooks/pulls';
   ```
3. Inside `OverviewTab` component body, add:
   ```typescript
   const { data: blastRadius, isLoading: blastLoading } = useBlastRadius(prId);
   ```
4. Replace `<BlastRadiusPlaceholder />` (in the grid section, line ~373) with:
   ```tsx
   <ErrorBoundary fallback={<div className="text-sm text-red-400 p-4">Failed to load blast radius</div>}>
     <BlastRadiusCard blastRadius={blastRadius} isLoading={blastLoading} />
   </ErrorBoundary>
   ```
5. Keep the `<SectionLabel icon="GitPullRequest">Blast Radius</SectionLabel>` wrapper around it

**Acceptance Criteria:**
- [ ] AC-001: `BlastRadiusPlaceholder` function entirely removed
- [ ] AC-002: Card wrapped in `<ErrorBoundary>` from `react-error-boundary`
- [ ] AC-003: Card in right column next to IntentCard (grid `1fr 1fr`)
- [ ] AC-004: `cd client && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `grep -n BlastRadiusPlaceholder OverviewTab.tsx` returns nothing |
| AC-004 | `cd client && pnpm typecheck` |

---

### TASK-007: d3.js Graph view

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastGraph.tsx` (new file)

**Prerequisites:** `pnpm add d3 && pnpm add -D @types/d3` in `client/`

**Description:**

Create `BlastGraph.tsx` with a force-directed graph visualization using d3.js.

**Module-level pure function `buildGraphData`:**
```typescript
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'symbol' | 'caller' | 'endpoint';
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
}

export function buildGraphData(blastRadius: BlastRadiusResult): { nodes: GraphNode[]; links: GraphLink[] } { ... }
```

**Component `BlastGraph`:**
- `"use client"` directive
- Uses `useRef<SVGSVGElement>` + `useEffect` for d3 rendering
- `useEffect` cleanup: `simulation.stop()`
- Node colors: symbol = `#818cf8` (purple), caller = `#94a3b8` (gray), endpoint = `#4ade80` (green)
- Typed drag: `d3.drag<SVGCircleElement, GraphNode>()` -- NO `as any`
- Typed simulation: `d3.forceSimulation<GraphNode>()` -- NO `as any`
- Typed zoom: `d3.zoom<SVGSVGElement, unknown>()`
- Zoom/pan support via `d3.zoom().scaleExtent([0.5, 3])`
- SVG element: `<svg ref={svgRef} width="100%" height="280" className="bg-elevated rounded-md" />`
- Empty state text via `useTranslations("prReview.blastRadius")`

**Integration in BlastRadiusCard.tsx** (already planned in TASK-005):
```tsx
{activeView === 'tree' ? <SymbolList ... /> : <BlastGraph blastRadius={blastRadius} />}
```

**Acceptance Criteria:**
- [ ] AC-001: `d3` and `@types/d3` installed in `client/package.json`
- [ ] AC-002: `BlastGraph.tsx` has `"use client"` directive
- [ ] AC-003: `buildGraphData` is an `export function` at module level
- [ ] AC-004: 3 node types with distinct colors
- [ ] AC-005: Typed drag `d3.drag<SVGCircleElement, GraphNode>()` -- no `as any`
- [ ] AC-006: Typed simulation `d3.forceSimulation<GraphNode>()` -- no `as any`
- [ ] AC-007: Zoom/pan via `d3.zoom()`
- [ ] AC-008: `useEffect` cleanup calls `simulation.stop()`
- [ ] AC-009: Graph renders with real data when switching Tree -> Graph
- [ ] AC-010: `cd client && pnpm typecheck` passes

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `grep d3 client/package.json` |
| AC-005 | `grep 'as any' BlastGraph.tsx` returns nothing |
| AC-010 | `cd client && pnpm typecheck` |

---

### TASK-008: Prior PRs accordion (server + client)

**Scope:** both

> NOTE: The server-side `getPriorPrs` method and the `PriorPr` Zod schema are already included in TASK-001 (contract) and TASK-002 (service). This task covers only the client-side `PriorPrsAccordion.tsx` component, which is created as part of TASK-005. This task exists as a logical grouping for AC tracking.

**Already covered by:**
- `PriorPr` schema: TASK-001
- `BlastService.getPriorPrs()`: TASK-002
- `PriorPrsAccordion.tsx`: TASK-005

**Acceptance Criteria:**
- [ ] AC-001: SQL uses `selectDistinct` + `inArray` + `ne` + `limit(5)`
- [ ] AC-002: `priorPrs` field in `BlastRadiusResult` Zod schema
- [ ] AC-003: Accordion collapsed by default
- [ ] AC-004: Only shows when `priorPrs.length > 0`
- [ ] AC-005: Each row: `#number title` + relative date

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | Code review of `blast/service.ts` |
| AC-003 | Manual UI test: accordion is closed on page load |

---

### TASK-009: LLM summary (optional)

**Scope:** backend

**Owned Paths:**
- `server/src/modules/blast/service.ts` (modify `getForPr` method)

**Description:**

Add an optional LLM call in `BlastService.getForPr()` after obtaining the blast result. Uses a cheap model (`review_intent` feature model) to generate a one-paragraph summary.

**Implementation in `BlastService.getForPr()`:**
```typescript
// After blast result, before return:
let summary: string | undefined;
try {
  const model = resolveFeatureModel(container, 'review_intent');
  summary = await model.complete({
    system: "You summarize code impact maps in one concise paragraph.",
    user: `Summarize this blast radius:\n- Changed symbols: ${blastResult.changedSymbols.map(s => s.name).join(', ')}\n- Total callers: ${blastResult.callers.length}\n- Impacted endpoints: ${blastResult.impactedEndpoints.join(', ')}\nAnswer in one paragraph, plain English.`,
    maxTokens: 150,
  });
} catch {
  // summary stays undefined -- does not block the response
}
return { ...blastResult, priorPrs, summary };
```

> ⚠️ Перед реализацией: прочитать `server/src/modules/reviews/intent-deriver.ts` и найти
> как вызывается `resolveFeatureModel`. Убедиться что функция получает LLM провайдера
> через `container` (не создаёт `new Provider()` напрямую). Если функция не существует —
> использовать `container.llm()` или аналогичный паттерн из `intent-deriver.ts`.

**Key patterns:**
- Follow `resolveFeatureModel` from `reviewer-core` / `intent-deriver.ts`
- `try/catch` -- LLM failure MUST NOT block the blast radius response
- Single call per endpoint, not per symbol
- Max 150 tokens

**Acceptance Criteria:**
- [ ] AC-001: Summary displays above tree view when LLM is available
- [ ] AC-002: If LLM unavailable, `summary` is `undefined`, rest of card works
- [ ] AC-003: Max 150 tokens per call
- [ ] AC-004: One LLM call per endpoint (not per symbol)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-002 | Disconnect LLM key, call endpoint -- response has no `summary` field, status 200 |

---

### TASK-010: Blast Graph Lightbox -- fullscreen graph via createPortal

**Scope:** frontend

**Prerequisites:** TASK-005 (BlastRadiusCard directory exists), TASK-007 (BlastGraph.tsx exists)

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastGraphLightbox.tsx` (new file)
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastRadiusCard.tsx` (modify)
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/SummaryBar.tsx` (modify)
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastGraph.tsx` (modify)

> These files are also owned by TASK-005 and TASK-007. TASK-010 MUST run sequentially AFTER both.
> No parallel execution with TASK-005 or TASK-007.

**Description:**

Replace the inline Tree/Graph toggle with a Lightbox-based fullscreen graph view. The inline `<BlastGraph>` render inside the card is removed; the graph is now only accessible via a dedicated button that opens a fullscreen overlay using `createPortal`.

**Step 1: Modify `BlastRadiusCard.tsx`**

Remove the following:
- `import { useState } from "react"` -- remove `useState` from the import (keep `React`)
- `const [activeView, setActiveView] = useState<"tree" | "graph">("tree");` -- delete this line
- The conditional `{activeView === "graph" && <BlastGraph data={blastRadius} />}` block -- delete

Add the following:
- `import { useState } from "react"` -- re-add, but now for `graphOpen` state only
- `const [graphOpen, setGraphOpen] = useState(false);` -- controls Lightbox visibility
- `import { BlastGraphLightbox } from "./BlastGraphLightbox";`

Replace `<SummaryBar>` props:
```typescript
// Before:
<SummaryBar ... activeView={activeView} onViewChange={setActiveView} />

// After:
<SummaryBar ... onOpenGraph={() => setGraphOpen(true)} />
```

Remove `activeView` conditional rendering. The main content area always shows `<SymbolList>`:
```tsx
<div className="flex-1 overflow-y-auto">
  <SymbolList rows={symbolRows} repoId={params.repoId} prNumber={params.number} />
</div>
```

Add Lightbox rendering at the bottom of the return, after the closing `</div>`:
```tsx
{graphOpen && (
  <BlastGraphLightbox data={blastRadius} onClose={() => setGraphOpen(false)} />
)}
```

> The `{graphOpen && ...}` pattern ensures `BlastGraph` mounts only when Lightbox is open (not `display:none`).
> This is important because d3 `useEffect` measures SVG dimensions on mount.

**Step 2: Modify `SummaryBar.tsx`**

Replace the Tree/Graph toggle with a single "Graph" button:

Remove from `SummaryBarProps`:
- `activeView: "tree" | "graph"`
- `onViewChange: (v: "tree" | "graph") => void`

Add to `SummaryBarProps`:
- `onOpenGraph: () => void`

Replace the toggle button pair (the `<div className="ml-auto flex gap-1.5">` block) with:
```tsx
<button
  onClick={onOpenGraph}
  className="ml-auto text-[11px] px-2 py-0.5 rounded border border-[var(--border)] cursor-pointer text-[var(--text-muted)] bg-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface,rgba(255,255,255,0.08))] transition-colors"
>
  {t("openGraph")}
</button>
```

> i18n key to add: `prReview.blastRadius.openGraph` (e.g. "Graph")

**Step 3: Modify `BlastGraph.tsx`**

Make dimensions configurable via props instead of hardcoded constants:

Replace the hardcoded constants:
```typescript
// Before:
const W = 600;
const H = 280;

// After: remove these constants entirely
```

Update the component interface:
```typescript
// Before:
interface BlastGraphProps {
  data: BlastRadiusResult;
}

// After:
interface BlastGraphProps {
  data: BlastRadiusResult;
  width: number;
  height: number;
}
```

Update the component to use `width`/`height` props:
- Replace all `W` references with `width`
- Replace all `H` references with `height`
- Update `d3.forceCenter(width / 2, height / 2)`
- Update SVG element: `<svg ref={svgRef} width={width} height={height} ...>`
- Update legend position: `<g transform={\`translate(8,${height - 46})\`}>`
- Add `width` and `height` to the `useEffect` dependency array: `[data, width, height]`

> ⚠️ **Architecture note (LOW from review):** Adding `width`/`height` to deps is mandatory. Without it, resizing the Lightbox won't re-run the simulation and the graph will render at wrong dimensions. React exhaustive-deps rule requires all props used inside `useEffect` to be listed.

**Step 4: Create `BlastGraphLightbox.tsx`** (new file)

```
client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastGraphLightbox.tsx
```

Structure:
```typescript
'use client'

import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { BlastRadiusResult } from '@devdigest/shared';
import { BlastGraph } from './BlastGraph';

interface BlastGraphLightboxProps {
  data: BlastRadiusResult;
  onClose: () => void;
}
```

**Lightbox layout (via `createPortal` into `document.body`):**
- Outer overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm`
- Backdrop click handler on the overlay div: `onClick={onClose}` with `e.target === e.currentTarget` guard to prevent close when clicking inside content
- Inner content container: `relative w-[90vw] h-[90vh] rounded-xl bg-slate-900 overflow-hidden flex flex-col`
  - **Must have** `role="dialog"` and `aria-modal="true"` — matches the existing `Modal.tsx` pattern in the project
  - **Must have** `aria-label="Blast Radius Graph"` for screen readers
- Close button (top-right corner): `absolute top-3 right-3 z-10 text-slate-400 hover:text-white text-xl cursor-pointer bg-transparent border-0 leading-none p-1`
  - **Must have** `aria-label="Close graph"` — icon-only button is invisible to screen readers without it
  - Content: `×` (multiplication sign, visually identical to "x")

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-label={t("graphTitle")}
  className="relative w-[90vw] h-[90vh] rounded-xl bg-slate-900 overflow-hidden flex flex-col"
  onClick={e => e.stopPropagation()}
>
  <button
    className="absolute top-3 right-3 z-10 text-slate-400 hover:text-white text-xl cursor-pointer bg-transparent border-0 leading-none p-1"
    onClick={onClose}
    aria-label={t("closeGraph")}
  >
    ×
  </button>
  ...
</div>
```

> ⚠️ **Architecture note (LOW from review):** `role="dialog"` + `aria-modal="true"` обязательны — это паттерн из существующего `Modal.tsx` в проекте. Без них Lightbox невидим для screen readers.

**i18n keys to add (добавить к существующему списку):**
```
prReview.blastRadius.graphTitle   (e.g. "Blast Radius Graph")
prReview.blastRadius.closeGraph   (e.g. "Close graph")
```

**ESC key handler:**
```typescript
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  if (e.key === 'Escape') onClose();
}, [onClose]);

useEffect(() => {
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [handleKeyDown]);
```

**Graph rendering inside Lightbox:**
- `<BlastGraph>` receives computed dimensions based on viewport:
  - `width`: `window.innerWidth * 0.9` (90vw), but use a state or ref to avoid SSR issues
  - `height`: `window.innerHeight * 0.9 - 48` (90vh minus padding for close button area)
- Safer approach: use a `ref` on the content container and `ResizeObserver` or read `clientWidth`/`clientHeight` in a `useEffect` to set dimensions state

**Visual enhancements in `BlastGraph.tsx` `useEffect` (d3 rendering):**

These enhancements apply when BlastGraph renders at Lightbox size. Since BlastGraph is now only rendered in Lightbox, all enhancements go directly into BlastGraph.tsx:

1. **SVG glow filter on symbol nodes:**
   Add to the d3 rendering `useEffect`, after `svg.selectAll("*").remove()`:
   ```typescript
   const defs = g.append('defs');

   // Glow filter for symbol nodes
   const filter = defs.append('filter').attr('id', 'glow');
   filter.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'blur');
   const merge = filter.append('feMerge');
   merge.append('feMergeNode').attr('in', 'blur');
   merge.append('feMergeNode').attr('in', 'SourceGraphic');
   ```
   Apply to symbol nodes only:
   ```typescript
   node.attr('filter', (d) => d.kind === 'symbol' ? 'url(#glow)' : null);
   ```

2. **Arrow markers on edges (directionality):**
   Add to defs:
   ```typescript
   defs.append('marker')
     .attr('id', 'arrow')
     .attr('viewBox', '0 0 10 10')
     .attr('refX', 20)  // offset to not overlap node circle
     .attr('refY', 5)
     .attr('markerWidth', 6)
     .attr('markerHeight', 6)
     .attr('orient', 'auto')
     .append('path')
     .attr('d', 'M0,0 L10,5 L0,10 Z')
     .attr('fill', 'var(--border, #2d3149)');
   ```
   Apply to links:
   ```typescript
   link.attr('marker-end', 'url(#arrow)');
   ```

3. **Node sizes by type:**
   Update `NODE_RADIUS` constant:
   ```typescript
   const NODE_RADIUS: Record<GraphNode["kind"], number> = {
     symbol: 14,   // was 12, + glow
     endpoint: 10, // was 8, + stroke ring
     caller: 8,    // unchanged
   };
   ```
   Add stroke ring to endpoint nodes:
   ```typescript
   node
     .attr('stroke', (d) => d.kind === 'endpoint' ? '#4ade80' : 'none')
     .attr('stroke-width', (d) => d.kind === 'endpoint' ? 2 : 0)
     .attr('stroke-opacity', 0.5);
   ```

4. **Tooltip on hover:**
   Add tooltip group (initially hidden):
   ```typescript
   const tooltip = g.append('g').attr('class', 'tooltip').style('display', 'none');
   const tooltipRect = tooltip.append('rect')
     .attr('rx', 4).attr('ry', 4)
     .attr('fill', 'rgba(0,0,0,0.8)')
     .attr('stroke', 'var(--border, #2d3149)');
   const tooltipText = tooltip.append('text')
     .attr('fill', '#e2e8f0')
     .attr('font-size', 11)
     .attr('text-anchor', 'middle');
   ```
   Attach to nodes:
   ```typescript
   node
     .on('mouseover', (event, d) => {
       const label = `${d.label} (${d.kind})`;
       tooltipText.text(label);
       const bbox = (tooltipText.node() as SVGTextElement).getBBox();
       tooltipRect
         .attr('x', bbox.x - 6).attr('y', bbox.y - 4)
         .attr('width', bbox.width + 12).attr('height', bbox.height + 8);
       tooltip
         .attr('transform', `translate(${d.x ?? 0},${(d.y ?? 0) - NODE_RADIUS[d.kind] - 16})`)
         .style('display', null);
     })
     .on('mouseout', () => {
       tooltip.style('display', 'none');
     });
   ```
   > Note: `.style()` calls are acceptable here because they are d3 imperative DOM manipulation inside `useEffect`, where Tailwind classes cannot be applied.

5. **Legend in Lightbox (HTML div over SVG):**
   The legend is rendered as an HTML `<div>` positioned absolutely in the bottom-left corner of the Lightbox content container (not inside SVG).

   In `BlastGraphLightbox.tsx`, after `<BlastGraph>`:
   ```tsx
   <div className="absolute bottom-4 left-4 flex flex-col gap-1 text-[11px] text-slate-400">
     <div className="flex items-center gap-2">
       <span className="inline-block w-3 h-3 rounded-full bg-[#818cf8]" />
       {t("changedSymbol")}
     </div>
     <div className="flex items-center gap-2">
       <span className="inline-block w-3 h-3 rounded-full bg-[#94a3b8]" />
       {t("caller")}
     </div>
     <div className="flex items-center gap-2">
       <span className="inline-block w-3 h-3 rounded-full bg-[#4ade80]" />
       {t("endpoint")}
     </div>
   </div>
   ```

   Remove the SVG-based legend from `BlastGraph.tsx`:
   - Delete the `LEGEND_KEYS` constant
   - Delete the `<g transform={...}>` legend JSX block at the bottom of the SVG element

**Styling rules:**
- All layout and appearance via Tailwind `className`
- Exception: d3 `.style()` calls inside `useEffect` are acceptable (Tailwind cannot target d3-created DOM elements)
- No `style={}` objects in JSX/TSX

**i18n keys to add:**
```
prReview.blastRadius.openGraph
```

**Acceptance Criteria:**
- [ ] AC-001: `activeView` state removed from `BlastRadiusCard.tsx`
- [ ] AC-002: Inline `<BlastGraph>` render removed from `BlastRadiusCard.tsx` -- graph only renders inside Lightbox
- [ ] AC-003: "Graph" button in `SummaryBar` opens Lightbox
- [ ] AC-004: `BlastGraphLightbox.tsx` exists with `"use client"` directive
- [ ] AC-005: Lightbox uses `createPortal(jsx, document.body)`
- [ ] AC-006: Backdrop click closes Lightbox (with `e.target === e.currentTarget` guard)
- [ ] AC-007: ESC key closes Lightbox via `useEffect` + `addEventListener('keydown', ...)`
- [ ] AC-008: Close button present in top-right corner
- [ ] AC-009: Graph mounts only when Lightbox is open (`{graphOpen && <BlastGraphLightbox/>}`) -- not `display:none`
- [ ] AC-010: `BlastGraph.tsx` accepts `width` and `height` props -- no hardcoded `W`/`H` constants
- [ ] AC-011: SVG glow filter (`feGaussianBlur stdDeviation=4` + `feMerge`) applied only to `symbol` nodes
- [ ] AC-012: Arrow markers on edges via SVG `<marker>` + `marker-end`
- [ ] AC-013: Node radii: `symbol=14`, `endpoint=10`, `caller=8`; endpoint has stroke ring
- [ ] AC-014: Tooltip shows `label (kind)` on hover, hides on mouseout
- [ ] AC-015: HTML legend in bottom-left corner of Lightbox (not in SVG)
- [ ] AC-016: SVG-based legend removed from `BlastGraph.tsx`
- [ ] AC-017: No `style={}` objects in JSX (d3 `.style()` in `useEffect` is allowed)
- [ ] AC-018: `SummaryBar.tsx` no longer has `activeView`/`onViewChange` props
- [ ] AC-019: `cd client && pnpm typecheck` passes
- [ ] AC-020: `BlastRadiusCard.tsx` still < 200 lines
- [ ] AC-021: Inner content container has `role="dialog"` + `aria-modal="true"` + `aria-label`
- [ ] AC-022: Close button has `aria-label="Close graph"` (icon-only button must have label)
- [ ] AC-023: `useEffect` in `BlastGraph.tsx` dependency array includes `[data, width, height]`

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `grep activeView BlastRadiusCard.tsx` returns nothing |
| AC-005 | `grep createPortal BlastGraphLightbox.tsx` returns a match |
| AC-009 | `grep 'graphOpen &&' BlastRadiusCard.tsx` returns a match |
| AC-010 | `grep 'const W\|const H' BlastGraph.tsx` returns nothing |
| AC-016 | `grep LEGEND_KEYS BlastGraph.tsx` returns nothing |
| AC-019 | `cd client && pnpm typecheck` |
| AC-020 | `wc -l BlastRadiusCard.tsx` < 200 |
| AC-021 | `grep 'role="dialog"' BlastGraphLightbox.tsx` returns a match |
| AC-022 | `grep 'aria-label' BlastGraphLightbox.tsx` returns 2+ matches |
| AC-023 | `grep '\[data, width, height\]' BlastGraph.tsx` returns a match |

---

## Implementation Phases

### Phase 1: Shared Contract
- [ ] TASK-001: Add Zod schemas to `server/src/vendor/shared/contracts/brief.ts`
- [ ] `cd server && pnpm typecheck` passes
- [ ] `cd client && pnpm typecheck` passes

### Phase 2: Backend
- [ ] TASK-002: Create `server/src/modules/blast/` (repository.ts, service.ts, routes.ts, index.ts)
- [ ] TASK-002: Register in `server/src/modules/index.ts`
- [ ] `cd server && pnpm typecheck` passes
- [ ] `curl localhost:3001/pulls/{id}/blast` returns valid response

### Phase 3: MCP
- [ ] TASK-003: Replace stub in `mcp/src/tools/get-blast-radius.ts`
- [ ] TASK-003: Fix `client` argument in `mcp/src/server.ts`

### Phase 4: Frontend
- [ ] TASK-004: Add `useBlastRadius` hook to `client/src/lib/hooks/pulls.ts`
- [ ] TASK-005: Create `BlastRadiusCard/` component directory
- [ ] TASK-006: Wire into OverviewTab (remove placeholder, add ErrorBoundary)
- [ ] TASK-007: Add d3 graph view (`pnpm add d3 @types/d3` first)
- [ ] `cd client && pnpm typecheck` passes

### Phase 5: Lightbox (after Phase 4)
- [ ] TASK-010: Create `BlastGraphLightbox.tsx`, modify `BlastRadiusCard.tsx`, `SummaryBar.tsx`, `BlastGraph.tsx`
- [ ] `cd client && pnpm typecheck` passes

### Phase 6: Optional Enhancements
- [ ] TASK-009: LLM summary in `BlastService.getForPr()`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `prFiles` empty if PR not yet synced from GitHub | `getForPr()` returns `degraded: true, reason: 'no_data'` -- UI shows empty state |
| `factsByFile` is `undefined` on degraded/ripgrep path | `buildSymbolRows` falls back to global `impactedEndpoints` without per-symbol attribution |
| Name collision with existing `ChangedSymbol`/`BlastCaller` in `brief.ts` | New types use `BlastChangedSymbol`, `BlastCallerRow`, `BlastDegradedReason` prefixes |
| d3 SSR crash (browser-only API) | `"use client"` directive + d3 rendering inside `useEffect` (runs only in browser) |
| `{cronCount && <Icon/>}` renders literal `0` | Explicit guard: `{cronCount > 0 && ...}` |
| Large component file | BlastRadiusCard orchestrates 4 sub-components; each < 200 lines |
| MCP stub passes wrong args | Fix line 69 to pass `client` as first argument |
| `createPortal` + SSR hydration mismatch | `BlastGraphLightbox` is `"use client"` and only mounts conditionally (`{graphOpen && ...}`), so `document.body` is always available; no SSR path reaches `createPortal` |
| Lightbox graph dimensions incorrect on resize | Use container ref + `clientWidth`/`clientHeight` in `useEffect` instead of `window.innerWidth` for robust sizing |
| ESC key listener leaks | `useEffect` cleanup removes `keydown` listener via `removeEventListener` |

## Out of Scope

- Database schema changes (no new tables/columns needed)
- Migrations
- Backend unit/integration tests (can be added as follow-up)
- Client component tests
- `react-error-boundary` installation (assumed already in `client/package.json`)
- i18n message file creation (keys listed in TASK-005 and TASK-010, file location depends on project's i18n setup)

## Architecture Notes

- **No new DI entries.** `BlastService` uses `container.repoIntel` (already wired in `platform/container.ts` line 120-124) and `container.db` directly. No changes to `Container` class.
- **Module isolation.** The `blast/` module does NOT import from `pulls/`. The `resolvePrAndRepo` logic is duplicated inside `BlastService` rather than extracted to `_shared/`, to avoid touching the existing `pulls/` module.
- **Onion architecture compliance.** `routes.ts` (presentation) calls `service.ts` (application) which calls `BlastRepository` (infrastructure) and `container.repoIntel` (infrastructure facade). `BlastService` contains no direct Drizzle queries — all DB access goes through `this.repo.*`. No layer violations.
- **d3 typing.** All d3 calls use TypeScript generics (`d3.drag<SVGCircleElement, GraphNode>()`, `d3.forceSimulation<GraphNode>()`, `d3.zoom<SVGSVGElement, unknown>()`). Zero `as any` casts.
- **Parallel task safety.** TASK-001 touches `brief.ts` exclusively. TASK-002 touches `blast/` + `modules/index.ts`. TASK-003 touches `mcp/`. TASK-004 touches `hooks/pulls.ts`. TASK-005 creates a new directory. TASK-006 touches `OverviewTab.tsx`. TASK-010 modifies files created by TASK-005 and TASK-007 -- it MUST run after both (Phase 5 depends on Phase 4). No path overlaps between tasks that can be parallelized.
- **Lightbox via createPortal.** `BlastGraphLightbox` uses `createPortal(jsx, document.body)` to render outside the React tree. This is safe because the component is `"use client"` and only conditionally mounted (`{graphOpen && ...}`), so `document.body` is guaranteed to exist. The existing `Modal.tsx` in `client/src/vendor/ui/kit/Modal.tsx` uses inline `style={}` objects and a different visual pattern (framed dialog with header/footer); the Lightbox intentionally does NOT reuse `Modal` -- it is a minimal dark overlay without chrome.
