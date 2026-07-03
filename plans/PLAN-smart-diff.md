# Plan: Smart Diff — Reviewer-Ordered File Layout

> Status: DRAFT
> Created: 2026-06-25

## Problem

Стандартный diff показывает файлы в алфавитном порядке. Ревьюер видит
`package-lock.json` (+92/-24) раньше `middleware/rateLimit.ts` (+84/-6).
Smart Diff перекладывает файлы по смысловому весу: core (бизнес-логика) →
wiring (конфиги, роуты) → boilerplate (локфайлы, dist). Boilerplate свёрнут
по умолчанию. Бейджи findings накладываются на заголовки файлов после запуска
ревью.

**Ключевой принцип:** ноль новых LLM-вызовов на шаге Smart Diff. Дорогой
LLM-вызов уже произошёл раньше — на шаге Run Review, который сохранил findings
в DB. Smart Diff только читает DB и детерминированно компонует результат.

```
Run Review (LLM)  → findings { title, severity, file, start_line } → DB
                              ↓
GET /pulls/:id/smart-diff  →  читает DB, строит группы, 0 новых токенов
```

## Целевой UI (по скриншотам)

```
┌─ REVIEWER-ORDERED DIFF ─────────────────── [Smart order] [Original order] ─┐
│ ● Core logic  "The substance of the change — review closely"  · 2 files      │
│   src/middleware/rateLimit.ts  ● summary  +84 -6  ⚠ warning  ○ blocker ...  │
│   src/api/webhooks.ts          ● summary  +31 -6  ○ blocker ○ blocker        │
│                                                                               │
│ ● Wiring  "Hooks the core into the app"  · 3 files                           │
│   src/api/index.ts                        +12 -2                              │
│   src/server.ts                           +8 -1                               │
│   src/config.ts                           +4 -6  ○ blocker                   │
│                                                                               │
│ ● Boilerplate  "Generated / mechanical — skim"  · 4 files  [collapsed ▸]     │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| shared/contracts (server) | `server/src/vendor/shared/contracts/brief.ts` | Extend `SmartDiffFile` + `SmartDiff` |
| shared/contracts (client) | `client/src/vendor/shared/contracts/brief.ts` | Mirror above |
| server: classifier | `server/src/modules/pulls/classifier.ts` | New file (pure functions) |
| server: classifier patterns | `server/src/modules/pulls/classifier-patterns.ts` | New file (constants) |
| server: classifier test | `server/src/modules/pulls/classifier.test.ts` | New file |
| server: reviews repository class | `server/src/modules/reviews/repository.ts` | Add `getLatestReviewData()` method |
| server: reviews repository impl | `server/src/modules/reviews/repository/review.repo.ts` | Add `getLatestReviewData()` free function (unexported outside module) |
| server: pulls repository | `server/src/modules/pulls/pull.repo.ts` | New file — `getPr()` + `getPrFiles()` |
| server: pulls service | `server/src/modules/pulls/service.ts` | New file — orchestration, no direct DB |
| server: pulls routes | `server/src/modules/pulls/routes.ts` | Add route (3-step only) |
| server: package.json | `server/package.json` | Add `verify:l03` script |
| client: api | `client/src/lib/api.ts` | Add `fetchSmartDiff` |
| client: hooks | `client/src/lib/hooks/pulls.ts` | Add `useSmartDiff` |
| client: FileCard | `client/src/components/diff-viewer/FileCard/FileCard.tsx` | Add `initialOpen` prop |
| client: CodeLine | `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | Add `data-line` + `data-path` |
| client: SmartDiffViewer | `client/src/components/smart-diff/SmartDiffViewer.tsx` | New component |
| client: translations | `client/messages/en/prReview.json` | Add missing `smartDiff` keys |
| client: DiffTab | `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | Add toggle + mount |

---

## Tasks

### TASK-001: Extend `SmartDiffFile` contract (server + client)

**Owned Paths:**
- `server/src/vendor/shared/contracts/brief.ts`
- `client/src/vendor/shared/contracts/brief.ts`

**Why:** `SmartDiffFile` exists but lacks `severity_counts` needed for file-level
finding badges (N blocker / N warning / N suggestion). `pseudocode_summary` уже
есть в схеме как `nullish()` — заполняется из finding titles (уже в DB), без
нового LLM-вызова.

**Change:** two extensions to both copies of `brief.ts`.

**1. Extend `SmartDiffFile`** (currently lines 84–91 in both copies):

```typescript
export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),  // null in this impl — no LLM
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
  // Severity breakdown for file header badges. null = no review has run yet.
  severity_counts: z.object({
    critical: z.number().int(),
    warning: z.number().int(),
    suggestion: z.number().int(),
  }).nullish(),
});
```

**2. Extend `SmartDiff`** — add `review_tokens` directly (tokens from the last review run; null = no review yet):

```typescript
export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: SplitSuggestion,
  /** Tokens used by the last Run Review. null = no review has run yet. */
  review_tokens: z.number().int().nullable(),
});
```

Placing `review_tokens` in `SmartDiff` (not a server-only extension) means:
- Client `fetchSmartDiff(): Promise<SmartDiff>` types correctly without any wrapper
- Server route returns `SmartDiff` directly — no `SmartDiffResponse = SmartDiff.extend(...)` needed

Apply identical changes to **both** copies.

**Acceptance Criteria:**
- [ ] AC-001: `severity_counts` and `review_tokens` exported correctly from both `brief.ts` files
- [ ] AC-002: `cd server && pnpm typecheck` + `cd client && pnpm typecheck` pass

---

### TASK-002: Classifier — pure functions + constants

**Owned Paths (new files):**
- `server/src/modules/pulls/classifier-patterns.ts` — all patterns and thresholds
- `server/src/modules/pulls/classifier.ts` — classification logic
- `server/src/modules/pulls/classifier.test.ts` — unit tests

#### `classifier-patterns.ts`

```typescript
/** Glob-style patterns evaluated top-down. First match wins. */

export const BOILERPLATE_PATTERNS: RegExp[] = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.lock$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.next\//,
  /(^|\/)coverage\//,
  /(^|\/)__generated__\//,
  /(^|\/)generated\//,
  /\.snap$/,
  /\.min\.(js|css)$/,
  /CHANGELOG\.md$/i,
  /CHANGES\.md$/i,
];

export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)index\.(ts|tsx|js|jsx)$/,
  /\.(config|conf)\.(ts|js|mjs|cjs)$/,
  /tsconfig.*\.json$/,
  /jest\.config\./,
  /vitest\.config\./,
  /\.eslintrc/,
  /\.prettierrc/,
  /(^|\/)Dockerfile/,
  /docker-compose/,
  /(^|\/)scripts\//,
  /(^|\/)migrations\//,
  /schema\.(ts|js)$/,
  /\.routes\.(ts|js)$/,
  /(^|\/)routes\.(ts|js)$/,
  /(^|\/)\.github\//,
  /\.(env|env\.\w+)$/,
];

/** Lines-changed threshold above which a PR is flagged as "too big". */
export const TOO_BIG_THRESHOLD = 400;
```

#### `classifier.ts`

```typescript
import type { SmartDiff, SmartDiffFile } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS, TOO_BIG_THRESHOLD } from './classifier-patterns.js';

export type FileRole = 'core' | 'wiring' | 'boilerplate';

export function classifyFile(path: string): FileRole {
  if (BOILERPLATE_PATTERNS.some(re => re.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some(re => re.test(path))) return 'wiring';
  return 'core';
}

interface RawFile {
  path: string;
  additions: number;
  deletions: number;
  // null = no review has run yet; populated from finding.title (no new LLM call)
  pseudocode_summary: string | null;
  finding_lines: number[];
  severity_counts: { critical: number; warning: number; suggestion: number } | null;
}

// SmartDiffBase = Omit<SmartDiff, 'review_tokens'> — review_tokens добавляет сервис
export type SmartDiffBase = Omit<SmartDiff, 'review_tokens'>;

export function buildSmartDiff(files: RawFile[]): SmartDiffBase {
  const groups: Record<FileRole, SmartDiffFile[]> = { core: [], wiring: [], boilerplate: [] };

  for (const f of files) {
    groups[classifyFile(f.path)].push({
      path: f.path,
      pseudocode_summary: f.pseudocode_summary,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: f.finding_lines,
      severity_counts: f.severity_counts,
    });
  }

  const totalLines = files.reduce((s, f) => s + f.additions + f.deletions, 0);

  return {
    groups: (
      [
        { role: 'core' as const,        files: groups.core },
        { role: 'wiring' as const,      files: groups.wiring },
        { role: 'boilerplate' as const, files: groups.boilerplate },
      ] as const
    ).filter(g => g.files.length > 0),
    split_suggestion: {
      too_big: totalLines > TOO_BIG_THRESHOLD,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}
```

#### `classifier.test.ts`

Cover at minimum:

| Input path | Expected role |
|-----------|--------------|
| `src/middleware/rateLimit.ts` | `core` |
| `src/api/webhooks.ts` | `core` |
| `package-lock.json` | `boilerplate` |
| `pnpm-lock.yaml` | `boilerplate` |
| `src/foo.snap` | `boilerplate` |
| `dist/bundle.js` | `boilerplate` |
| `src/api/index.ts` | `wiring` |
| `jest.config.ts` | `wiring` |
| `src/modules/auth/routes.ts` | `wiring` |
| `server/src/db/migrations/0001.sql` | `wiring` |

**Acceptance Criteria:**
- [ ] AC-003: `pnpm verify:l03` exits 0 (all classifier tests green)
- [ ] AC-004: `package-lock.json` always → `boilerplate`
- [ ] AC-005: patterns in constants file, none hardcoded in `classifier.ts`

#### Add `verify:l03` to `server/package.json`

```json
"verify:l03": "vitest run src/modules/pulls/classifier.test.ts"
```

---

### TASK-003: Repository + Service + Route `GET /pulls/:id/smart-diff`

> **Архитектурное решение (из architecture-reviewer, rev 2):**
> - `PullsService` (Application) не импортирует drizzle-orm напрямую — все DB-запросы через репозитории.
> - `getLatestReviewData` доступна снаружи только через метод `ReviewRepository` (класс-фасад).
> - `PullsService` конструируется один раз в начале `pullsRoutes()` plugin scope (до любых `app.get()`).

#### 3a — `pull.repo.ts` (новый файл в pulls модуле)

**Owned Path:** `server/src/modules/pulls/pull.repo.ts`

```typescript
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';

export async function getPr(db: Db, workspaceId: string, prId: string) {
  const [pr] = await db
    .select({ id: t.pullRequests.id })
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.id, prId), eq(t.pullRequests.workspaceId, workspaceId)));
  return pr ?? null;
}

export async function getPrFiles(db: Db, prId: string) {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}
```

#### 3b — `getLatestReviewData` — через фасад `ReviewRepository`

**Owned Paths:**
- `server/src/modules/reviews/repository/review.repo.ts` — добавить free function (приватная для модуля)
- `server/src/modules/reviews/repository.ts` — добавить публичный метод на класс

**`review.repo.ts`** — добавить (не экспортировать наружу через `index`):

```typescript
export interface LatestReviewData {
  findings: Array<{ file: string; title: string; severity: string; startLine: number }>;
  reviewTokens: number | null;
}

export async function getLatestReviewData(db: Db, prId: string): Promise<LatestReviewData> {
  const [review] = await db
    .select({ id: t.reviews.id, runId: t.reviews.runId })
    .from(t.reviews)
    .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt))
    .limit(1);

  if (!review) return { findings: [], reviewTokens: null };

  const findingRows = await db
    .select({ file: t.findings.file, title: t.findings.title, severity: t.findings.severity, startLine: t.findings.startLine })
    .from(t.findings)
    .where(eq(t.findings.reviewId, review.id));

  let reviewTokens: number | null = null;
  if (review.runId) {
    const [run] = await db
      .select({ tokensIn: t.agentRuns.tokensIn, tokensOut: t.agentRuns.tokensOut })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, review.runId));
    if (run) reviewTokens = (run.tokensIn ?? 0) + (run.tokensOut ?? 0);
  }
  return { findings: findingRows, reviewTokens };
}
```

**`repository.ts`** — добавить метод на класс `ReviewRepository`:

```typescript
// В классе ReviewRepository (server/src/modules/reviews/repository.ts):
getLatestReviewData(prId: string): Promise<LatestReviewData> {
  return reviewRepo.getLatestReviewData(this.db, prId);
}
```

> `t.agentRuns` подтверждён — именно такое имя в `server/src/db/schema.ts`.

#### 3c — `PullsService` (новый файл, без drizzle-orm)

**Owned Path:** `server/src/modules/pulls/service.ts`

```typescript
import type { SmartDiff } from '@devdigest/shared';
import type { ReviewRepository } from '../reviews/repository.js';
import { getPr, getPrFiles } from './pull.repo.js';
import { buildSmartDiff, type SmartDiffBase } from './classifier.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Db } from '../../db/client.js';

export class PullsService {
  constructor(
    private db: Db,
    private reviewRepo: ReviewRepository,
  ) {}

  async buildSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    // 1. Verify PR belongs to workspace (via pulls repo — no drizzle-orm here)
    const pr = await getPr(this.db, workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');

    // 2. Fetch files + review data in parallel (reviews data via ReviewRepository facade)
    const [files, reviewData] = await Promise.all([
      getPrFiles(this.db, prId),
      this.reviewRepo.getLatestReviewData(prId),
    ]);

    // 3. Index findings by file
    const findingsByFile = new Map<string, typeof reviewData.findings>();
    for (const f of reviewData.findings) {
      if (!findingsByFile.has(f.file)) findingsByFile.set(f.file, []);
      findingsByFile.get(f.file)!.push(f);
    }

    // 4. Build classifier input
    const rawFiles = files.map(f => {
      const ff = findingsByFile.get(f.path) ?? [];
      return {
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        pseudocode_summary: ff.length > 0 ? ff.slice(0, 2).map(x => x.title).join(' · ') : null,
        finding_lines: ff.map(x => x.startLine),
        severity_counts: ff.length > 0
          ? {
              critical:   ff.filter(x => x.severity === 'CRITICAL').length,
              warning:    ff.filter(x => x.severity === 'WARNING').length,
              suggestion: ff.filter(x => x.severity === 'SUGGESTION').length,
            }
          : null,
      };
    });

    const base: SmartDiffBase = buildSmartDiff(rawFiles);
    return { ...base, review_tokens: reviewData.reviewTokens };
  }
}
```

> **Ключевые архитектурные решения:**
> - `PullsService` не импортирует drizzle-orm — только `Db` тип и вызовы через репо-функции
> - `ReviewRepository` инжектируется, не инстанциируется внутри сервиса
> - `SmartDiffBase = Omit<SmartDiff, 'review_tokens'>` — объявляется в `classifier.ts`

#### 3d — `classifier.ts` — добавить тип `SmartDiffBase`

В `classifier.ts` изменить return type функции:

```typescript
import type { SmartDiff } from '@devdigest/shared';

export type SmartDiffBase = Omit<SmartDiff, 'review_tokens'>;

export function buildSmartDiff(files: RawFile[]): SmartDiffBase {
  // ...тело без изменений, но теперь TypeScript не требует review_tokens
}
```

#### 3e — Route (3 строки логики)

**Owned Path:** `server/src/modules/pulls/routes.ts`

```typescript
import { SmartDiff } from '@devdigest/shared';
import { PullsService } from './service.js';

export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Конструируется один раз в plugin scope (до любых app.get/post)
  const service = new PullsService(container.db, container.reviewRepo);

  // ... существующие роуты ...

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiff } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.buildSmartDiff(workspaceId, req.params.id);
    },
  );
}
```

> `container.reviewRepo` — проверить имя поля при реализации по `platform/container.ts`.

**Acceptance Criteria:**
- [ ] AC-006: `GET /pulls/:id/smart-diff` returns 200 с корректной `SmartDiff` формой + `review_tokens`
- [ ] AC-007: Returns 404 если PR не в воркспейсе
- [ ] AC-008: `severity_counts` = null пока ревью не запускалось; заполнен после первого Run Review
- [ ] AC-009: UI бейдж `⚡ 0 new tokens · built on X from last review` виден в SmartDiffViewer
- [ ] AC-010: Route handler содержит не более 3 строк логики (validate → service → respond)

---

### TASK-004: Client — API fetch + hook

**Owned Paths:**
- `client/src/lib/api.ts`
- `client/src/lib/hooks/pulls.ts`

#### `api.ts` — add fetch function

```typescript
export async function fetchSmartDiff(prId: string): Promise<SmartDiff> {
  return apiFetch<SmartDiff>(`/pulls/${prId}/smart-diff`);
}
```

Import `SmartDiff` from `@devdigest/shared`.

#### `pulls.ts` — add hook

```typescript
export function useSmartDiff(prId: string | null) {
  return useQuery({
    queryKey: ['smart-diff', prId],
    queryFn: () => fetchSmartDiff(prId!),
    enabled: !!prId,
    staleTime: 30_000,
  });
}
```

**Acceptance Criteria:**
- [ ] AC-011: `useSmartDiff` fetches and returns `SmartDiff` typed correctly

---

### TASK-005: `SmartDiffViewer` component

**Owned Paths:**
- `client/src/components/smart-diff/SmartDiffViewer.tsx` (new)
- `client/src/components/diff-viewer/FileCard/FileCard.tsx` (minimal change — add `initialOpen` prop)

#### 5a — Minimal change to `FileCard`

`FileCard` вычисляет `open` только по размеру файла. Нужно добавить один проп
чтобы `SmartDiffViewer` мог принудительно свернуть boilerplate:

```typescript
// FileCard.tsx — изменить только строку useState (строка ~36):
export function FileCard({
  file,
  commenting,
  initialOpen,          // ← добавить проп
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  initialOpen?: boolean; // ← если передан — переопределяет авто-расчёт
}) {
  const [open, setOpen] = React.useState(
    initialOpen ?? ((file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES)
  );
  // остальной код без изменений
```

#### 5b — Translations: добавить ключи в `client/messages/en/prReview.json`

`smartDiff` namespace уже существует (строки 56–65). Добавить недостающие ключи:

```json
"smartDiff": {
  "coreLabel": "Core logic",         // обновить (было "Core")
  "coreDesc": "The substance of the change — review closely",
  "wiringLabel": "Wiring",
  "wiringDesc": "Hooks the core into the app",
  "boilerplateLabel": "Boilerplate",
  "boilerplateDesc": "Generated / mechanical — skim",
  "zeroTokens": "⚡ 0 new tokens",
  "builtOn": "· built on {count} from last review",
  "whatDoes": "What does:",
  "smartOrder": "Smart order",
  "originalOrder": "Original order",
  "largeTitle": "This PR is large ({lines} changed lines)",
  "largeBody": "Consider splitting it into smaller, focused PRs for easier review:",
  "filesCount": "{count} files",
  "findingLines": "{count} finding-lines",
  "groupedByRole": "Smart Diff · grouped by role"
}
```

> Ключи `coreLabel/wiringLabel/boilerplateLabel/largeTitle/largeBody/filesCount/findingLines/groupedByRole`
> уже есть в файле — **не дублировать**, только добавить отсутствующие.

#### 5c — Полный скелет `SmartDiffViewer.tsx`

```tsx
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { SmartDiff, SmartDiffFile, PrFile } from "@devdigest/shared";
import { FileCard } from "@/components/diff-viewer/FileCard/FileCard";
import type { DiffCommentApi } from "@/components/diff-viewer";

// ── Константы (только цвета — строки через useTranslations) ──────────────────

const GROUP_COLORS: Record<string, string> = {
  core:        '#3b82f6',
  wiring:      '#f97316',
  boilerplate: '#6b7280',
};

const SEVERITY_META = {
  critical:   { color: '#ef4444', label: 'blocker' },
  warning:    { color: '#f97316', label: 'warning' },
  suggestion: { color: '#3b82f6', label: 'suggestion' },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function scrollToFinding(smartFile: SmartDiffFile) {
  const line = smartFile.finding_lines[0];
  if (line == null) return;
  // CodeLine должен рендерить data-line + data-path (проверить при реализации;
  // если атрибутов нет — добавить в CodeLine, это 1 строка)
  document
    .querySelector(`[data-line="${line}"][data-path="${smartFile.path}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FindingBadge({
  count, label, color, onClick,
}: { count: number; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...s.badge, color }}>
      {count} {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SmartDiffViewerProps {
  smartDiff: SmartDiff;
  reviewTokens: number | null;  // токены последнего ревью; null = ревью не запускалось
  files: PrFile[];               // PrFile[] из PR detail — нужны для patch-текста
  commenting?: DiffCommentApi;
}

export function SmartDiffViewer({ smartDiff, reviewTokens, files, commenting }: SmartDiffViewerProps) {
  const t = useTranslations('prReview.smartDiff');

  // path → PrFile (для patch-текста)
  const fileMap = React.useMemo(
    () => new Map(files.map(f => [f.path, f])),
    [files],
  );

  return (
    <div style={s.root}>

      {/* ── Token badge ── */}
      <div style={s.tokenBadge}>
        <span>{t('zeroTokens')}</span>
        {reviewTokens != null && (
          <span style={s.tokenMuted}>
            {t('builtOn', { count: reviewTokens.toLocaleString() })}
          </span>
        )}
      </div>

      {/* ── "Too big" banner ── */}
      {smartDiff.split_suggestion.too_big && (
        <div style={s.tooBigBanner}>
          {t('largeTitle', { lines: smartDiff.split_suggestion.total_lines.toLocaleString() })}
        </div>
      )}

      {smartDiff.groups.map((group) => {
        const color = GROUP_COLORS[group.role] ?? GROUP_COLORS.core;
        const label = t(`${group.role}Label` as Parameters<typeof t>[0]);
        const desc  = t(`${group.role}Desc`  as Parameters<typeof t>[0]);
        const isBoilerplate = group.role === 'boilerplate';

        return (
          <div key={group.role} style={s.group}>

            {/* ── Group header ── */}
            <div style={s.groupHeader}>
              <span style={{ ...s.dot, background: color }} />
              <span style={s.groupLabel}>{label}</span>
              <span style={s.groupDesc}>{desc}</span>
              <span style={s.groupCount}>
                · {t('filesCount', { count: group.files.length })}
              </span>
            </div>

            {/* ── Files ── */}
            {group.files.map((smartFile) => {
              const prFile = fileMap.get(smartFile.path);
              if (!prFile) return null;
              const sc = smartFile.severity_counts;

              return (
                <div key={smartFile.path} style={s.fileWrapper}>

                  {/* "What does:" — только если есть findings (LLM уже отработал) */}
                  {smartFile.pseudocode_summary && (
                    <div style={s.whatDoes}>
                      <span style={s.whatDoesLabel}>{t('whatDoes')}</span>{' '}
                      {smartFile.pseudocode_summary}
                    </div>
                  )}

                  {/* Finding badges */}
                  {sc && (sc.critical > 0 || sc.warning > 0 || sc.suggestion > 0) && (
                    <div style={s.badges}>
                      {sc.critical > 0 && (
                        <FindingBadge count={sc.critical}   label={SEVERITY_META.critical.label}   color={SEVERITY_META.critical.color}   onClick={() => scrollToFinding(smartFile)} />
                      )}
                      {sc.warning > 0 && (
                        <FindingBadge count={sc.warning}    label={SEVERITY_META.warning.label}    color={SEVERITY_META.warning.color}    onClick={() => scrollToFinding(smartFile)} />
                      )}
                      {sc.suggestion > 0 && (
                        <FindingBadge count={sc.suggestion} label={SEVERITY_META.suggestion.label} color={SEVERITY_META.suggestion.color} onClick={() => scrollToFinding(smartFile)} />
                      )}
                    </div>
                  )}

                  {/* FileCard — boilerplate принудительно свёрнут */}
                  <FileCard
                    file={prFile}
                    commenting={commenting}
                    initialOpen={!isBoilerplate}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', gap: 24 },
  group:       { display: 'flex', flexDirection: 'column', gap: 8 },
  groupHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  dot:         { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  groupLabel:  { fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' },
  groupDesc:   { fontSize: 12, color: 'var(--text-muted)' },
  groupCount:  { fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' },
  fileWrapper: { display: 'flex', flexDirection: 'column', gap: 4 },
  whatDoes:    { fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 4 },
  whatDoesLabel: { fontWeight: 600, color: 'var(--text-muted)' },
  badges:      { display: 'flex', gap: 8, paddingLeft: 4 },
  badge: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, padding: '2px 0',
  },
  tokenBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, color: '#4ade80',
    padding: '4px 0',
  },
  tokenMuted: { fontWeight: 400, color: 'var(--text-muted)' },
  tooBigBanner: {
    fontSize: 12,
    color: '#f97316',
    background: 'rgba(249, 115, 22, 0.08)',
    border: '1px solid rgba(249, 115, 22, 0.25)',
    borderRadius: 6,
    padding: '6px 12px',
  },
};
```

> **Обязательный sub-task:** проверить что `CodeLine` рендерит
> `data-line={line.newNo ?? line.oldNo}` и `data-path={file.path}` на корневом
> элементе строки. Если атрибутов нет — добавить в
> `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` (1 строка).
> Без этого клик по бейджу не найдёт строку — это блокер для AC-016.

**Acceptance Criteria:**
- [ ] AC-012: Core group файлы первые, boilerplate последний
- [ ] AC-013: Boilerplate свёрнут по умолчанию (`initialOpen={false}`)
- [ ] AC-014: Finding badges показывают правильные счётчики и цвета
- [ ] AC-015: "What does:" строка появляется только после Run Review
- [ ] AC-016: `CodeLine` рендерит `data-line` + `data-path` на корневом элементе строки (блокер для скролла)
- [ ] AC-017: Клик по бейджу скроллит к нужной строке в diff
- [ ] AC-018: Баннер "This PR is large" появляется когда `total_lines > TOO_BIG_THRESHOLD` (400)
- [ ] AC-019: `cd client && pnpm typecheck` passes

---

### TASK-006: Wire into `DiffTab`

**Owned Path:**
`client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`

**Changes:**
1. Add `prId` is already a prop ✓
2. Call `useSmartDiff(prId)` inside DiffTab
3. Add local state: `const [smartOrder, setSmartOrder] = React.useState(false)`
4. Add toggle buttons to `SectionLabel` `right` slot (alongside existing comments toggle):
   ```tsx
   const t = useTranslations('prReview.smartDiff');
   // ...
   <Button kind={smartOrder ? 'primary' : 'ghost'} size="sm" onClick={() => setSmartOrder(true)}>{t('smartOrder')}</Button>
   <Button kind={!smartOrder ? 'primary' : 'ghost'} size="sm" onClick={() => setSmartOrder(false)}>{t('originalOrder')}</Button>
   ```
5. Conditional render:
   ```tsx
   {smartOrder && smartDiff.data ? (
     <SmartDiffViewer
       smartDiff={smartDiff.data}
       reviewTokens={smartDiff.data.review_tokens}
       files={files}
       commenting={commenting}
     />
   ) : (
     <DiffViewer files={files} commenting={commenting} />
   )}
   ```

> Smart order toggle only shown when `smartDiff.data` is available.
> Falls back to original order while loading or on error.

**Acceptance Criteria:**
- [ ] AC-020: Toggle buttons appear in Files Changed header
- [ ] AC-021: Switching to "Smart order" re-renders with groups
- [ ] AC-022: "Original order" restores the standard flat diff
- [ ] AC-023: `cd client && pnpm typecheck` passes

---

## Implementation Order

1. **TASK-001** — contract extension (both `brief.ts`) — schema first
2. **TASK-002** — classifier pure functions + `SmartDiffBase` type + tests + `verify:l03` script
3. **TASK-003a** — `pull.repo.ts` (новый файл: `getPr` + `getPrFiles`)
4. **TASK-003b** — `getLatestReviewData` в `review.repo.ts` + метод на `ReviewRepository`
5. **TASK-003c** — `PullsService` (инжектирует `Db` + `ReviewRepository`, без drizzle-orm)
6. **TASK-003d** — обновить `SmartDiffBase` return type в `classifier.ts`
7. **TASK-003e** — route `GET /pulls/:id/smart-diff` (конструирует `PullsService` один раз в plugin scope)
8. **TASK-004** — client api fetch + `useSmartDiff` hook
9. **TASK-005** — translations + `SmartDiffViewer` + `FileCard.initialOpen` + `CodeLine` data attributes
10. **TASK-006** — DiffTab wiring (toggle state + conditional render)

---

## Verification

| AC | How to measure |
|----|----------------|
| AC-001–002 | `pnpm typecheck` in server + client |
| AC-003–005 | `cd server && pnpm verify:l03` → all green |
| AC-006–010 | `curl localhost:3001/pulls/:id/smart-diff` → valid JSON; UI badge visible; server logs = 0 LLM calls |
| AC-011 | React DevTools: `useSmartDiff` returns `SmartDiff` shape |
| AC-012–015 | Visual check + typecheck |
| AC-016 | DOM inspector: `data-line` + `data-path` on CodeLine root element |
| AC-017 | Click badge → scroll to correct diff line |
| AC-018 | Open large PR (>400 lines) → orange banner visible |
| AC-019 | `cd client && pnpm typecheck` passes |
| AC-020–023 | Visual check on any PR — toggle buttons, Smart/Original modes, typecheck |

**Full acceptance demo:**
1. Open a large PR (9+ files including a lock file)
2. Files Changed → toggle "Smart order" → lock file в Boilerplate свёрнут, core-файлы сверху
3. Run Review → после завершения появляются бейджи findings
4. Клик по бейджу → скролл к строке в diff
5. Логи: нет новых LLM-вызовов
6. `cd server && pnpm verify:l03` — зелёный

---

## Out of Scope

- `pseudocode_summary` берётся из существующих findings — LLM уже отработал ранее.
  Если ревью ещё не запускалось → `null` → "What does:" не отображается в UI.
  Это норма: Smart Diff работает и без ревью (группировка есть всегда), summaries появляются после первого Run Review автоматически.
- `proposed_splits` — поле возвращается пустым `[]`, логика split-suggestion в будущем плане
- Inline commenting в SmartDiffViewer — передаётся через `FileCard`, работает из коробки
- Новые DB-миграции — не нужны, только читаем существующие таблицы
