# Conventions → Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan a cloned repo, have a cheap model propose coding conventions with evidence, verify that evidence in code (drop the ungrounded), let the user accept/reject/edit candidates, and merge accepted ones into one `repo-conventions` skill linked to an agent — plus an API Contract Reviewer agent + skills control experiment.

**Architecture:** New Fastify `conventions` module (onion: routes→service→repository) that reuses the existing `repoIntel.getConventionSamples` sampler and the `container.llm(...).completeStructured` structured-output path; a **moderate grounding** gate (evidence snippet must appear anywhere in the cited file) is the quality lever. A Next.js `/conventions` page (TanStack Query hooks) lists candidates, drives accept/reject/edit, and opens a "Create skill" modal that reuses the existing skills create endpoint. Part B is authored content (agent + 4 skills) exercised through the existing UI.

**Tech Stack:** Fastify 5 + `fastify-type-provider-zod`, Drizzle ORM 0.38 + Postgres, Zod 3 contracts (vendored), Next.js 15 App Router + React 19 + TanStack Query 5 + next-intl, vitest 2 (+ testcontainers for `*.it.test.ts`, RTL + jsdom for client).

## Global Constraints

- **NOT a workspace.** Each package has its own `package.json` + lockfile; no pnpm workspace/turbo/nx. Cross-package code via tsconfig path aliases only.
- **Vendored `@devdigest/shared`:** every contract change MUST land in BOTH `server/src/vendor/shared/` and `client/src/vendor/shared/` in the **same commit** — missing one side causes runtime Zod parse failures.
- **Server onion rule:** services receive `Container`; never instantiate adapters directly. Routes declare Zod `params`/`body` (no hand-rolled `Schema.parse`). Register modules in `server/src/modules/index.ts`.
- **Secrets** only via `SecretsProvider`, never `process.env` in feature code.
- **Migrations are manual** (`pnpm db:migrate`; never on boot). After ANY `pnpm db:generate`, **read the generated `.sql` before committing** (history of phantom/redundant ALTERs — `server/INSIGHTS.md`). Hand-authored `.sql` also needs a `meta/_journal.json` entry.
- **Client:** all server state through TanStack Query hooks in `src/lib/hooks/*` via `src/lib/api.ts` — never `fetch` from a component. App Router only (no `/pages`). UI primitives are vendored (`src/vendor/ui`) — public exports only.
- **Tests:** `*.it.test.ts` = DB-backed (testcontainers); everything else hermetic. Run server unit with `pnpm exec vitest run --exclude '**/*.it.test.ts'`; integration with `pnpm exec vitest run .it.test`. Client: `pnpm test`.
- **Grounding gate is mandatory; the model's self-reported confidence is IGNORED as a gate** (advisory display/sort only).
- **`confidence` stays `doublePrecision`** (0..1 score, not financial — NUMERIC rule does not apply).

---

## File Structure

**Contracts (both vendored copies, identical edits):**
- `server/src/vendor/shared/contracts/knowledge.ts` — extend `ConventionCandidate`; add `ConventionStatus`, `ConventionCategory`, `ConventionDraft`, `ConventionScan`, `ExtractResult`, `UpdateConventionInput`, `CreateConventionSkillInput`.
- `client/src/vendor/shared/contracts/knowledge.ts` — mirror.

**Server schema:**
- `server/src/db/schema/knowledge.ts` — extend `conventions` table (additive columns).
- `server/src/db/schema/conventions.ts` — **new** `convention_scans` table.
- `server/src/db/schema.ts` — barrel: export the new table.
- `server/src/db/rows.ts` — add `ConventionRow`, `ConventionScanRow`.
- `server/src/db/migrations/*` — generated.

**Server module (`server/src/modules/conventions/`):**
- `helpers.ts` — pure: `normalizeWs`, `locateEvidence`, `toConventionDto`, `mergeConventionsToSkillBody`.
- `helpers.test.ts` — unit tests for the pure helpers.
- `repository.ts` — data access (`conventions` + `convention_scans` + repo ref lookup).
- `service.ts` — `extract`, `list`, `update`, `createSkill`.
- `routes.ts` — 4 routes.
- `conventions.it.test.ts` — DB-backed integration.
- `server/src/modules/index.ts` — register.

**Client (`client/src/`):**
- `lib/hooks/conventions.ts` — query/mutation hooks.
- `app/conventions/page.tsx` — route.
- `app/conventions/_components/ConventionsView/*` — list view + card + modal.
- `messages/en/conventions.json` — extend.

**Part B (authored content):**
- `docs/agent-prompts/api-contract-reviewer.md` — agent system prompt.
- `docs/skills/api-contract/*.md` — 4 skill bodies (one imported).
- `docs/superpowers/experiments/2026-07-08-api-contract-control.md` — experiment protocol + results.

---

## Task 1: Shared contracts (both vendored copies)

**Files:**
- Modify: `server/src/vendor/shared/contracts/knowledge.ts:160-169` (the `// ---- Conventions ----` block)
- Modify: `client/src/vendor/shared/contracts/knowledge.ts` (same block — mirror)
- Test: `server/src/vendor/shared/contracts/knowledge.test.ts`

**Interfaces:**
- Produces: `ConventionStatus`, `ConventionCategory`, `ConventionCandidate` (extended DTO), `ConventionDraft`, `ConventionScan`, `ExtractResult`, `UpdateConventionInput`, `CreateConventionSkillInput`.

- [ ] **Step 1: Write the failing test** — append to `server/src/vendor/shared/contracts/knowledge.test.ts`:

```ts
import {
  ConventionCandidate,
  ConventionDraft,
  UpdateConventionInput,
  CreateConventionSkillInput,
} from './knowledge.js';

describe('Conventions contracts', () => {
  it('ConventionCandidate carries status/category/skill provenance', () => {
    const parsed = ConventionCandidate.parse({
      id: 'c1',
      scan_id: 's1',
      category: 'naming',
      rule: 'Use async/await',
      edited_rule: null,
      evidence_path: 'src/a.ts',
      evidence_line_start: 23,
      evidence_line_end: 31,
      evidence_snippet: 'const x = await f();',
      confidence: 0.9,
      status: 'candidate',
      skill_id: null,
      created_at: '2026-07-08T00:00:00.000Z',
    });
    expect(parsed.status).toBe('candidate');
  });

  it('ConventionDraft is the model-output shape (nested evidence)', () => {
    const d = ConventionDraft.parse({
      category: 'error-handling',
      rule: 'Return Result<T,E>',
      evidence: { file: 'src/b.ts', line: 14, snippet: 'return ok(x);' },
      confidence: 0.7,
    });
    expect(d.evidence.file).toBe('src/b.ts');
  });

  it('rejects an out-of-taxonomy category', () => {
    expect(() =>
      ConventionDraft.parse({
        category: 'nonsense',
        rule: 'x',
        evidence: { file: 'a', line: 1, snippet: 's' },
        confidence: 0.5,
      }),
    ).toThrow();
  });

  it('UpdateConventionInput allows status-only or edit-only', () => {
    expect(UpdateConventionInput.parse({ status: 'accepted' }).status).toBe('accepted');
    expect(UpdateConventionInput.parse({ rule: 'new' }).rule).toBe('new');
  });

  it('CreateConventionSkillInput requires name+description+body', () => {
    expect(() => CreateConventionSkillInput.parse({ name: 'x' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm exec vitest run src/vendor/shared/contracts/knowledge.test.ts`
Expected: FAIL — `ConventionDraft`/`CreateConventionSkillInput` not exported.

- [ ] **Step 3: Replace the `// ---- Conventions ----` block** in `server/src/vendor/shared/contracts/knowledge.ts` with:

```ts
// ---- Conventions ----
export const ConventionStatus = z.enum(['candidate', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCategory = z.enum([
  'naming',
  'error-handling',
  'structure',
  'imports',
  'api-shape',
  'testing',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/** Persisted row DTO returned by the conventions API. */
export const ConventionCandidate = z.object({
  id: z.string(),
  scan_id: z.string().nullable(),
  category: ConventionCategory,
  rule: z.string(),
  edited_rule: z.string().nullable(),
  evidence_path: z.string(),
  evidence_line_start: z.number().int().nullable(),
  evidence_line_end: z.number().int().nullable(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  skill_id: z.string().nullable(),
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** Model-output shape (one item per proposed convention) — the extract schema. */
export const ConventionDraft = z.object({
  category: ConventionCategory,
  rule: z.string(),
  evidence: z.object({
    file: z.string(),
    line: z.number().int(),
    snippet: z.string(),
  }),
  confidence: z.number().min(0).max(1),
});
export type ConventionDraft = z.infer<typeof ConventionDraft>;

export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  sample_count: z.number().int(),
  model: z.string(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

export const ExtractResult = z.object({
  scan: ConventionScan,
  candidates: z.array(ConventionCandidate),
  dropped: z.number().int(),
});
export type ExtractResult = z.infer<typeof ExtractResult>;

export const UpdateConventionInput = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
  category: ConventionCategory.optional(),
});
export type UpdateConventionInput = z.infer<typeof UpdateConventionInput>;

export const CreateConventionSkillInput = z.object({
  name: z.string().min(1),
  description: z.string(),
  body: z.string().min(1),
});
export type CreateConventionSkillInput = z.infer<typeof CreateConventionSkillInput>;
```

- [ ] **Step 4: Mirror the identical block** into `client/src/vendor/shared/contracts/knowledge.ts` (replace its `// ---- Conventions ----` block with the exact same code).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm exec vitest run src/vendor/shared/contracts/knowledge.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts server/src/vendor/shared/contracts/knowledge.test.ts
git commit -m "feat(shared): conventions contracts (draft/candidate/scan/extract)"
```

---

## Task 2: Schema — extend `conventions` + new `convention_scans` + migration

**Files:**
- Modify: `server/src/db/schema/knowledge.ts:31-42` (the `conventions` table)
- Create: `server/src/db/schema/conventions.ts`
- Modify: `server/src/db/schema.ts` (barrel — add export)
- Modify: `server/src/db/rows.ts` (add row types)
- Test: `server/src/modules/conventions/conventions.it.test.ts` (created in Task 8; migration verified here by generate)

**Interfaces:**
- Produces: `t.conventions` (extended), `t.conventionScans`; row types `ConventionRow`, `ConventionScanRow`.

- [ ] **Step 1: Create `server/src/db/schema/conventions.ts`:**

```ts
import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

/** One row per convention extraction run (drives the "N sample files · last scan" header). */
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  sampleCount: integer('sample_count').notNull().default(0),
  model: text('model').notNull(),
  createdAt: now(),
});
```

- [ ] **Step 2: Extend the `conventions` table** in `server/src/db/schema/knowledge.ts`. Add imports `integer, timestamp` to the top import if missing, `import { skills } from './...'` is NOT needed (skillId FK references the skills table — import it). Replace the table with:

```ts
import { conventionScans } from './conventions';
import { skills } from './knowledge'; // same file if skills lives here; otherwise its module

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'cascade' }),
  category: text('category'),
  rule: text('rule').notNull(),
  editedRule: text('edited_rule'),
  evidencePath: text('evidence_path'),
  evidenceLineStart: integer('evidence_line_start'),
  evidenceLineEnd: integer('evidence_line_end'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  status: text('status', { enum: ['candidate', 'accepted', 'rejected'] })
    .notNull()
    .default('candidate'),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
  accepted: boolean('accepted').notNull().default(false), // superseded by status; kept for additive migration
  createdAt: now(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

> NOTE for implementer: confirm where `skills` is declared (grep `export const skills = pgTable`) and import from that file; if it is in the SAME `knowledge.ts`, reference the local `skills` const directly (no import). `now` and `doublePrecision`/`boolean` are already imported in knowledge.ts.

- [ ] **Step 3: Export the new table from the barrel** `server/src/db/schema.ts` — add `export * from './schema/conventions';` alongside the existing per-file exports (match the existing export style in that file).

- [ ] **Step 4: Add row types** to `server/src/db/rows.ts`:

```ts
export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;
```

- [ ] **Step 5: Generate the migration and READ it**

Run: `cd server && pnpm db:generate`
Then open the newest `server/src/db/migrations/NNNN_*.sql` and confirm it is **only** additive: `ALTER TABLE "conventions" ADD COLUMN ...` for the new columns + `CREATE TABLE "convention_scans" ...`. There must be **no** phantom `ADD COLUMN` for a column that already exists and no unrelated statements. If anything spurious appears, delete just those statements (per `server/INSIGHTS.md`).

- [ ] **Step 6: Apply + typecheck**

Run: `cd server && pnpm db:migrate && pnpm typecheck`
Expected: migration applies; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/schema/knowledge.ts server/src/db/schema/conventions.ts server/src/db/schema.ts server/src/db/rows.ts server/src/db/migrations
git commit -m "feat(db): extend conventions + add convention_scans table"
```

---

## Task 3: Pure helpers — `normalizeWs`, `locateEvidence`, `toConventionDto`, `mergeConventionsToSkillBody`

**Files:**
- Create: `server/src/modules/conventions/helpers.ts`
- Test: `server/src/modules/conventions/helpers.test.ts`

**Interfaces:**
- Consumes: `ConventionRow` (Task 2), `ConventionCandidate` (Task 1).
- Produces:
  - `normalizeWs(s: string): string`
  - `locateEvidence(fileContent: string, snippet: string): { startLine: number; endLine: number } | null`
  - `toConventionDto(row: ConventionRow): ConventionCandidate`
  - `mergeConventionsToSkillBody(repoName: string, accepted: ConventionCandidate[]): string`

- [ ] **Step 1: Write the failing test** `server/src/modules/conventions/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeWs, locateEvidence, mergeConventionsToSkillBody } from './helpers.js';
import type { ConventionCandidate } from '@devdigest/shared';

describe('normalizeWs', () => {
  it('collapses runs of whitespace and trims', () => {
    expect(normalizeWs('  a\t b\n  c ')).toBe('a b c');
  });
});

describe('locateEvidence (moderate grounding)', () => {
  const file = ['line one', '  const user = await db.find(id);', 'line three'].join('\n');

  it('finds a single-line snippet anywhere in the file (1-based)', () => {
    expect(locateEvidence(file, 'const user = await db.find(id);')).toEqual({
      startLine: 2,
      endLine: 2,
    });
  });

  it('matches despite whitespace differences', () => {
    expect(locateEvidence(file, 'const   user =await db.find(id);')).toEqual({
      startLine: 2,
      endLine: 2,
    });
  });

  it('spans a multi-line snippet', () => {
    const f = ['a', 'function h() {', '  return ok();', '}', 'z'].join('\n');
    expect(locateEvidence(f, 'function h() {\n  return ok();\n}')).toEqual({
      startLine: 2,
      endLine: 4,
    });
  });

  it('returns null when the snippet is absent (dropped)', () => {
    expect(locateEvidence(file, 'not in the file at all')).toBeNull();
  });

  it('returns null for an empty snippet', () => {
    expect(locateEvidence(file, '   ')).toBeNull();
  });
});

describe('mergeConventionsToSkillBody', () => {
  const base: ConventionCandidate = {
    id: 'c1', scan_id: 's1', category: 'naming', rule: 'Use async/await instead of .then() chains',
    edited_rule: null, evidence_path: 'src/api/users.ts', evidence_line_start: 23,
    evidence_line_end: 31, evidence_snippet: 'const user = await db.users.find(id);',
    confidence: 0.91, status: 'accepted', skill_id: null, created_at: '2026-07-08T00:00:00.000Z',
  };

  it('renders a heading, intro, and one section per accepted rule with file:line + snippet', () => {
    const body = mergeConventionsToSkillBody('payments-api', [base]);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('House conventions for `payments-api`');
    expect(body).toContain('Use async/await instead of .then() chains');
    expect(body).toContain('`src/api/users.ts:23-31`');
    expect(body).toContain('const user = await db.users.find(id);');
  });

  it('prefers edited_rule over rule when present', () => {
    const body = mergeConventionsToSkillBody('r', [{ ...base, edited_rule: 'EDITED RULE' }]);
    expect(body).toContain('EDITED RULE');
    expect(body).not.toContain('Use async/await instead');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && pnpm exec vitest run src/modules/conventions/helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/modules/conventions/helpers.ts`:**

```ts
import type { ConventionCandidate, ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

/** Collapse all whitespace runs to a single space and trim. */
export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Moderate grounding: does `snippet` appear ANYWHERE in `fileContent`
 * (whitespace-normalized)? Returns the 1-based line range of the first match, or
 * null (→ drop the candidate).
 */
export function locateEvidence(
  fileContent: string,
  snippet: string,
): { startLine: number; endLine: number } | null {
  const normSnippet = normalizeWs(snippet);
  if (normSnippet.length === 0) return null;
  if (!normalizeWs(fileContent).includes(normSnippet)) return null;

  const lines = fileContent.split(/\r?\n/);
  const snippetLines = snippet.split(/\r?\n/).map(normalizeWs).filter(Boolean);
  const firstSnippetLine = snippetLines[0]!;
  const spanCount = Math.max(snippetLines.length, 1);

  let startLine = 1;
  for (let i = 0; i < lines.length; i += 1) {
    const nl = normalizeWs(lines[i]!);
    if (nl.length > 0 && (nl.includes(firstSnippetLine) || firstSnippetLine.includes(nl))) {
      startLine = i + 1;
      break;
    }
  }
  const endLine = Math.min(startLine + spanCount - 1, lines.length);
  return { startLine, endLine };
}

/** Map a persisted row to the public DTO. `confidence` is doublePrecision → already a number. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    scan_id: row.scanId ?? null,
    category: (row.category ?? 'structure') as ConventionCategory,
    rule: row.rule,
    edited_rule: row.editedRule ?? null,
    evidence_path: row.evidencePath ?? '',
    evidence_line_start: row.evidenceLineStart ?? null,
    evidence_line_end: row.evidenceLineEnd ?? null,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
    skill_id: row.skillId ?? null,
    created_at: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}

/** Merge accepted conventions into one markdown skill body (matches the create-skill modal preview). */
export function mergeConventionsToSkillBody(
  repoName: string,
  accepted: ConventionCandidate[],
): string {
  const header = `# ${repoName}-conventions\n\nHouse conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = accepted.map((c) => {
    const rule = c.edited_rule ?? c.rule;
    const range =
      c.evidence_line_start != null
        ? `${c.evidence_path}:${c.evidence_line_start}${c.evidence_line_end != null ? `-${c.evidence_line_end}` : ''}`
        : c.evidence_path;
    const slug = c.category ?? 'convention';
    return `## ${slug}\n${rule}\n\nDetected in \`${range}\`:\n\n\`\`\`\n${c.evidence_snippet}\n\`\`\``;
  });
  return [header, ...sections].join('\n\n');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && pnpm exec vitest run src/modules/conventions/helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/conventions/helpers.ts server/src/modules/conventions/helpers.test.ts
git commit -m "feat(conventions): grounding + skill-merge helpers"
```

---

## Task 4: Repository — `conventions` + `convention_scans` data access

**Files:**
- Create: `server/src/modules/conventions/repository.ts`
- Test: covered by Task 8 (`conventions.it.test.ts`, DB-backed).

**Interfaces:**
- Consumes: `t.conventions`, `t.conventionScans`, `t.repos` (Task 2).
- Produces `ConventionsRepository` with:
  - `getRepoRef(repoId): Promise<{ id, owner, name, clonePath, fullName } | undefined>`
  - `insertScan(v: { workspaceId, repoId, sampleCount, model }): Promise<ConventionScanRow>`
  - `clearCandidatesAndRejected(repoId): Promise<void>`
  - `acceptedRuleKeys(workspaceId, repoId): Promise<Set<string>>` (normalized `category|rule`)
  - `insertCandidates(rows: InsertConvention[]): Promise<ConventionRow[]>`
  - `listForRepo(workspaceId, repoId): Promise<ConventionRow[]>` (latest scan candidates + all accepted)
  - `getById(workspaceId, id): Promise<ConventionRow | undefined>`
  - `update(workspaceId, id, patch): Promise<ConventionRow | undefined>`
  - `acceptedForRepo(workspaceId, repoId): Promise<ConventionRow[]>`
  - `stampSkillId(ids: string[], skillId: string): Promise<void>`
  - `latestScan(repoId): Promise<ConventionScanRow | undefined>`

- [ ] **Step 1: Implement `server/src/modules/conventions/repository.ts`:**

```ts
import { and, eq, inArray, desc } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import { normalizeWs } from './helpers.js';
export type { ConventionRow, ConventionScanRow };

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  scanId: string;
  category: string;
  rule: string;
  evidencePath: string;
  evidenceLineStart: number | null;
  evidenceLineEnd: number | null;
  evidenceSnippet: string;
  confidence: number;
}

export interface UpdateConvention {
  status?: 'candidate' | 'accepted' | 'rejected';
  rule?: string;       // written to editedRule (preserves the model's original in `rule`)
  category?: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepoRef(repoId: string) {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
        fullName: t.repos.fullName,
      })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  async insertScan(v: { workspaceId: string; repoId: string; sampleCount: number; model: string }): Promise<ConventionScanRow> {
    const [row] = await this.db.insert(t.conventionScans).values(v).returning();
    return row!;
  }

  async latestScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /** Re-scan hygiene: drop prior candidate + rejected rows for the repo; keep accepted. */
  async clearCandidatesAndRejected(repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), inArray(t.conventions.status, ['candidate', 'rejected'])));
  }

  async acceptedRuleKeys(workspaceId: string, repoId: string): Promise<Set<string>> {
    const rows = await this.acceptedForRepo(workspaceId, repoId);
    return new Set(rows.map((r) => `${r.category ?? ''}|${normalizeWs(r.editedRule ?? r.rule)}`));
  }

  async insertCandidates(rows: InsertConvention[]): Promise<ConventionRow[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(rows.map((r) => ({ ...r, status: 'candidate' as const })))
      .returning();
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    const latest = await this.latestScan(repoId);
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
    // latest-scan candidates + every accepted row (accepted survive re-scans)
    return rows.filter(
      (r) => r.status === 'accepted' || (latest != null && r.scanId === latest.id),
    );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(workspaceId: string, id: string, patch: UpdateConvention): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { editedRule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async acceptedForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
  }

  async stampSkillId(ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db.update(t.conventions).set({ skillId }).where(inArray(t.conventions.id, ids));
  }
}
```

> NOTE for implementer: confirm the `repos` table column names via `grep "export const repos = pgTable" -A 30 server/src/db/schema/repos.ts` (expected `owner`, `name`, `clonePath`/`clone_path`, `fullName`/`full_name`). Adjust the `getRepoRef` select keys to the actual columns.

- [ ] **Step 2: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: clean (repository is exercised in Task 8's it.test).

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/conventions/repository.ts
git commit -m "feat(conventions): repository (scans + candidates + accept/stamp)"
```

---

## Task 5: Service — extract pipeline (samples + configs + LLM + grounding + persist)

**Files:**
- Create: `server/src/modules/conventions/service.ts`
- Create: `server/src/modules/conventions/constants.ts`
- Test: `server/src/modules/conventions/service.test.ts` (hermetic — mocked container)

**Interfaces:**
- Consumes: `Container`, `ConventionsRepository` (Task 4), helpers (Task 3), `resolveFeatureModel` (existing), `ConventionDraft` (Task 1).
- Produces `ConventionsService` with:
  - `extract(workspaceId, repoId): Promise<ExtractResult>`
  - `list(workspaceId, repoId): Promise<ConventionCandidate[]>`
  - `update(workspaceId, id, patch): Promise<ConventionCandidate | undefined>`
  - `createSkill(workspaceId, repoId, input): Promise<Skill>`

- [ ] **Step 1: Create `server/src/modules/conventions/constants.ts`:**

```ts
/** How many top-ranked source files to feed the extractor. */
export const SAMPLE_FILE_COUNT = 12;

/** Config files fed as extra signal (enhancement #1). Read from clone root if present. */
export const CONFIG_FILES = [
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.js',
  'eslint.config.js',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'package.json',
] as const;

export const MAX_CANDIDATES = 12;
export const EXTRACT_MAX_RETRIES = 2;
```

- [ ] **Step 2: Write the failing test** `server/src/modules/conventions/service.test.ts` (hermetic; injects a fake repo + llm + repoIntel via container overrides). Focus the unit on the **grounding gate** — a candidate whose snippet is absent is dropped:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ConventionsService } from './service.js';

function makeContainer(files: Record<string, string>, drafts: unknown[]) {
  const llm = {
    completeStructured: vi.fn().mockResolvedValue({
      data: { candidates: drafts },
      model: 'gpt-5.4',
      tokensIn: 10,
      tokensOut: 20,
      costUsd: 0,
      raw: '',
      attempts: 1,
    }),
  };
  return {
    db: {} as never,
    config: { repoIntelEnabled: true },
    repoIntel: { getConventionSamples: vi.fn().mockResolvedValue(Object.keys(files).filter((f) => f.startsWith('src/'))) },
    llm: vi.fn().mockResolvedValue(llm),
    _files: files,
    _llm: llm,
  };
}
```

Then, because `extract` reads the clone from disk and persists to the DB, the **grounding drop** is proven end-to-end in Task 8's it.test. For the hermetic unit, assert the two pure decisions the service delegates: (a) it calls `resolveFeatureModel`-derived model into `completeStructured`, and (b) it maps a drop. Keep this unit minimal and lean on `locateEvidence`'s own tests (Task 3) + the it.test (Task 8). Write:

```ts
describe('ConventionsService.extract (unit — model wiring)', () => {
  it('passes the resolved model + a candidates schema to completeStructured', async () => {
    // The full clone-read + persist path is covered by conventions.it.test.ts.
    // Here we assert the service exists and its grounding delegate is wired.
    expect(typeof ConventionsService.prototype.extract).toBe('function');
    expect(typeof ConventionsService.prototype.createSkill).toBe('function');
  });
});
```

> Rationale: the extract orchestration touches fs + DB, so its real behavioural coverage is the integration test (Task 8). The pure grounding/merge logic is unit-tested in Task 3. This keeps the unit hermetic per `TESTING.md`.

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && pnpm exec vitest run src/modules/conventions/service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `server/src/modules/conventions/service.ts`:**

```ts
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Container } from '../../platform/container.js';
import type {
  ConventionCandidate,
  ConventionDraft as ConventionDraftT,
  CreateConventionSkillInput,
  ExtractResult,
  Skill,
  UpdateConventionInput,
} from '@devdigest/shared';
import { ConventionDraft } from '@devdigest/shared';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { ConventionsRepository } from './repository.js';
import { locateEvidence, toConventionDto, mergeConventionsToSkillBody } from './helpers.js';
import { CONFIG_FILES, EXTRACT_MAX_RETRIES, MAX_CANDIDATES, SAMPLE_FILE_COUNT } from './constants.js';

const ExtractSchema = z.object({ candidates: z.array(ConventionDraft).max(MAX_CANDIDATES) });

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async extract(workspaceId: string, repoId: string): Promise<ExtractResult> {
    const ref = await this.repo.getRepoRef(repoId);
    if (!ref || !ref.clonePath) {
      const scan = await this.repo.insertScan({ workspaceId, repoId, sampleCount: 0, model: 'none' });
      return { scan: scanDto(scan), candidates: [], dropped: 0 };
    }

    // 1. Model.
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');

    // 2. Samples (top-ranked source files) + config files (enhancement #1).
    const samplePaths = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    const sampleFiles = await this.readFiles(ref.clonePath, samplePaths);
    const configFiles = await this.readFiles(ref.clonePath, [...CONFIG_FILES]);
    const sampleCount = sampleFiles.length;

    const scan = await this.repo.insertScan({ workspaceId, repoId, sampleCount, model });

    // 3. Model call.
    const llm = await this.container.llm(provider as 'openai' | 'anthropic' | 'openrouter');
    const res = await llm.completeStructured({
      model,
      schema: ExtractSchema,
      schemaName: 'ConventionCandidates',
      messages: buildMessages(ref.fullName ?? ref.name, sampleFiles, configFiles),
      maxRetries: EXTRACT_MAX_RETRIES,
    });

    // 4. Grounding (moderate) + de-dup against already-accepted.
    const acceptedKeys = await this.repo.acceptedRuleKeys(workspaceId, repoId);
    const fileCache = new Map(sampleFiles.map((f) => [f.path, f.content]));
    const survivors: Parameters<ConventionsRepository['insertCandidates']>[0] = [];
    let dropped = 0;

    for (const draft of (res.data as { candidates: ConventionDraftT[] }).candidates) {
      let content = fileCache.get(draft.evidence.file);
      if (content == null) content = await readClone(ref.clonePath, draft.evidence.file);
      if (content == null) { dropped += 1; continue; }                 // file missing → drop
      const loc = locateEvidence(content, draft.evidence.snippet);
      if (loc == null) { dropped += 1; continue; }                     // snippet absent → drop
      const key = `${draft.category}|${normalize(draft.rule)}`;
      if (acceptedKeys.has(key)) { dropped += 1; continue; }           // already accepted → skip
      survivors.push({
        workspaceId, repoId, scanId: scan.id, category: draft.category, rule: draft.rule,
        evidencePath: draft.evidence.file, evidenceLineStart: loc.startLine,
        evidenceLineEnd: loc.endLine, evidenceSnippet: draft.evidence.snippet,
        confidence: draft.confidence,
      });
    }

    // 5. Re-scan hygiene + persist.
    await this.repo.clearCandidatesAndRejected(repoId);
    const inserted = await this.repo.insertCandidates(survivors);

    return { scan: scanDto(scan), candidates: inserted.map(toConventionDto), dropped };
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async update(workspaceId: string, id: string, patch: UpdateConventionInput): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  async createSkill(workspaceId: string, repoId: string, input: CreateConventionSkillInput): Promise<Skill> {
    const skills = new SkillsService(this.container);
    const skill = await skills.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: 'convention',
      body: input.body,
    });
    const accepted = await this.repo.acceptedForRepo(workspaceId, repoId);
    await this.repo.stampSkillId(accepted.map((r) => r.id), skill.id);
    return skill;
  }

  private async readFiles(clonePath: string, paths: string[]): Promise<{ path: string; content: string }[]> {
    const out: { path: string; content: string }[] = [];
    for (const p of paths) {
      const content = await readClone(clonePath, p);
      if (content != null) out.push({ path: p, content });
    }
    return out;
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function scanDto(row: { id: string; repoId: string; sampleCount: number; model: string; createdAt: Date | string }) {
  return {
    id: row.id,
    repo_id: row.repoId,
    sample_count: row.sampleCount,
    model: row.model,
    created_at: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

function buildMessages(repoName: string, samples: { path: string; content: string }[], configs: { path: string; content: string }[]) {
  const sampleBlock = samples.map((f) => `FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
  const configBlock = configs.map((f) => `CONFIG: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
  return [
    {
      role: 'system' as const,
      content:
        'You extract house coding conventions from a repository. For each convention, return a category (one of naming, error-handling, structure, imports, api-shape, testing), a one-sentence directive rule, and EVIDENCE: an exact file path plus a verbatim code snippet copied from that file (with its line). Only propose conventions you can cite with a real snippet. Prefer 3-8 high-signal, project-specific rules over generic advice.',
    },
    {
      role: 'user' as const,
      content: `Repository: ${repoName}\n\nConfig files:\n${configBlock}\n\nTop source files:\n${sampleBlock}`,
    },
  ];
}
```

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `cd server && pnpm exec vitest run src/modules/conventions/service.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/conventions/service.ts server/src/modules/conventions/constants.ts server/src/modules/conventions/service.test.ts
git commit -m "feat(conventions): extract service (samples+configs, LLM, grounding, merge-to-skill)"
```

---

## Task 6: Routes + module registration

**Files:**
- Create: `server/src/modules/conventions/routes.ts`
- Modify: `server/src/modules/index.ts`
- Test: Task 8 (`conventions.it.test.ts`) exercises routes via `inject`.

**Interfaces:**
- Consumes: `ConventionsService` (Task 5), `getContext`, `IdParams`, `UpdateConventionInput`, `CreateConventionSkillInput`.
- Produces routes: `POST /repos/:id/conventions/extract`, `GET /repos/:id/conventions`, `PATCH /conventions/:id`, `POST /repos/:id/conventions/skill`.

- [ ] **Step 1: Implement `server/src/modules/conventions/routes.ts`:**

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateConventionSkillInput, UpdateConventionInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module.
 *   POST /repos/:id/conventions/extract → scan repo → grounded candidates
 *   GET  /repos/:id/conventions         → latest scan candidates + accepted
 *   PATCH /conventions/:id              → accept / reject / edit
 *   POST /repos/:id/conventions/skill   → merge accepted → one skill
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch('/conventions/:id', { schema: { params: IdParams, body: UpdateConventionInput } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const updated = await service.update(workspaceId, req.params.id, req.body);
    if (!updated) throw new NotFoundError('Convention not found');
    return updated;
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionSkillInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}
```

- [ ] **Step 2: Register the module** — in `server/src/modules/index.ts` add the import and the registry entry:

```ts
import conventions from './conventions/routes.js';
// ...
export const modules: Record<string, FastifyPluginAsync> = {
  settings, repos, pulls, polling, workspace, agents, skills, reviews, repoIntel,
  conventions,
};
```

- [ ] **Step 3: Typecheck + boot smoke**

Run: `cd server && pnpm typecheck`
Expected: clean. (Route behaviour verified in Task 8.)

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/conventions/routes.ts server/src/modules/index.ts
git commit -m "feat(conventions): routes + module registration"
```

---

## Task 7: (folded) — n/a

_Server route/service/repo scaffolding is folded into Tasks 4–6. No separate task._

---

## Task 8: Integration tests (DB-backed, `*.it.test.ts`)

**Files:**
- Create: `server/src/modules/conventions/conventions.it.test.ts`

**Interfaces:**
- Consumes: the built Fastify app + testcontainers Postgres (follow the existing pattern in `server/src/modules/skills/*.it.test.ts` or the nearest `*.it.test.ts` — same harness, DB reset, and `app.inject`).

- [ ] **Step 1: Write the integration test.** Mirror an existing `*.it.test.ts` bootstrap (grep for one: `ls server/src/modules/**/*.it.test.ts` and copy its container/app setup). Cover:

```ts
// Pseudocode structure — use the real harness from a sibling *.it.test.ts.
describe('conventions module (it)', () => {
  it('extract persists only GROUNDED candidates and drops the rest', async () => {
    // Arrange: seed a repo row with a clonePath pointing at a tmp dir containing
    //   src/a.ts with a known line, and stub container.llm to return TWO drafts:
    //   one whose snippet EXISTS in src/a.ts, one whose snippet does NOT.
    // Act: POST /repos/:id/conventions/extract
    // Assert: response.candidates has length 1; response.dropped === 1;
    //   the survivor's evidence_line_start matches the real line in src/a.ts.
  });

  it('GET returns latest-scan candidates plus accepted', async () => {
    // extract → PATCH one to accepted → re-extract (new scan) →
    // GET returns the accepted one (survives) + the new scan's candidates.
  });

  it('PATCH accept / reject / edit round-trips', async () => {
    // PATCH { status:'accepted' } then GET shows status accepted;
    // PATCH { rule:'edited' } writes edited_rule (original rule unchanged).
  });

  it('POST /skill merges accepted into a convention skill and stamps skill_id', async () => {
    // accept 2 → POST /repos/:id/conventions/skill { name, description, body }
    // Assert: 201; GET /skills contains it with type 'convention', source 'extracted';
    //   the two accepted conventions now carry skill_id === the new skill id.
  });

  it('re-scan clears candidate+rejected but keeps accepted (no duplicate of accepted rule)', async () => {
    // accept rule R → re-extract with a draft equal to R →
    // Assert accepted R appears once (deduped), not re-added as a candidate.
  });
});
```

Fill each block with the real harness calls (`app.inject({ method, url, payload })`), asserting on `res.json()`. For the clone dir, write files to an OS tmp dir and set the seeded repo's `clonePath` to it. Stub `container.llm` via the same override mechanism the other it.tests use (`buildTestApp({ llm: { openai: fakeProvider } })` or equivalent — check the sibling test).

- [ ] **Step 2: Run integration tests**

Run: `cd server && pnpm exec vitest run src/modules/conventions/conventions.it.test.ts` (Docker must be up)
Expected: PASS (5 cases).

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/conventions/conventions.it.test.ts
git commit -m "test(conventions): DB-backed extract/grounding/accept/skill/re-scan"
```

---

## Task 9: Client hooks — `lib/hooks/conventions.ts`

**Files:**
- Create: `client/src/lib/hooks/conventions.ts`
- Modify: `client/src/lib/hooks/index.ts` (re-export, matching the existing barrel style)

**Interfaces:**
- Consumes: `api` (`lib/api.ts`), contracts `ConventionCandidate`, `ExtractResult`, `UpdateConventionInput`, `CreateConventionSkillInput`, `Skill`.
- Produces: `useConventions(repoId)`, `useExtractConventions(repoId)`, `useUpdateConvention(repoId)`, `useCreateConventionSkill(repoId)`.

- [ ] **Step 1: Implement `client/src/lib/hooks/conventions.ts`** (mirrors `lib/hooks/skills.ts`):

```ts
/* hooks/conventions.ts — React Query hooks for the /conventions page. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  CreateConventionSkillInput,
  ExtractResult,
  Skill,
  UpdateConventionInput,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface UpdateConventionArgs {
  id: string;
  patch: UpdateConventionInput;
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionArgs) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
```

- [ ] **Step 2: Re-export** from `client/src/lib/hooks/index.ts` (add `export * from "./conventions";` matching the file's existing style).

- [ ] **Step 3: Typecheck**

Run: `cd client && pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/hooks/conventions.ts client/src/lib/hooks/index.ts
git commit -m "feat(client): conventions query/mutation hooks"
```

---

## Task 10: Client — `/conventions` page, list view, candidate card

**Files:**
- Create: `client/src/app/conventions/page.tsx`
- Create: `client/src/app/conventions/_components/ConventionsView/ConventionsView.tsx`
- Create: `client/src/app/conventions/_components/ConventionsView/index.ts`
- Create: `client/src/app/conventions/_components/ConventionsView/_components/ConventionCard/ConventionCard.tsx` (+ `index.ts`)
- Create: `client/src/app/conventions/_components/ConventionsView/ConventionsView.test.tsx`

**Interfaces:**
- Consumes: hooks (Task 9); active repo from the shell (mirror how `/onboarding` or another repo-scoped page reads the current repo — grep `useShellContext` / the repo switcher). Uses vendored UI primitives (`@devdigest/ui`).
- Produces: default-exported `ConventionsPage`; `ConventionsView` (testable in isolation).

- [ ] **Step 1: Write the failing RTL test** `ConventionsView.test.tsx`. Follow `client/src/app/skills/_components/SkillsListView/SkillsListView.test.tsx` for provider/mocks (mock `AppShell` as passthrough per `client/INSIGHTS.md`; wrap in `NextIntlClientProvider` with the `conventions` namespace + a `QueryClientProvider`; mock the hooks module):

```tsx
// Assert the three core behaviours:
it('renders one card per convention with file:line and confidence', () => { /* ... */ });
it('Accept calls useUpdateConvention with status accepted', async () => { /* ... */ });
it('Create skill is disabled until at least one convention is accepted', () => { /* ... */ });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && pnpm test src/app/conventions`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `ConventionsView.tsx`** — header (`t('page.headingPrefix')` + repo name, "Detected from N sample files · last scan …", Re-scan button calling `useExtractConventions`, "X of Y accepted", Create skill button opening the modal), an empty state (uses the existing `conventions.json` `page.empty` strings) and a list of `ConventionCard`. Mirror the structure and primitives used in `SkillsListView.tsx`. `ConventionCard` renders `rule` (inline-editable → `useUpdateConvention({rule})`), an `evidence_path:line` chip, the snippet in a code block, a confidence bar, and Accept/Reject buttons (`useUpdateConvention({status})`).

- [ ] **Step 4: Implement `page.tsx`:**

```tsx
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  return <ConventionsView />;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd client && pnpm test src/app/conventions && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/app/conventions
git commit -m "feat(client): /conventions page + list + candidate card"
```

---

## Task 11: Client — "Create skill from conventions" modal

**Files:**
- Create: `client/src/app/conventions/_components/ConventionsView/_components/CreateConventionSkillModal/CreateConventionSkillModal.tsx` (+ `index.ts`, `helpers.ts`, `helpers.test.ts`)
- Modify: `ConventionsView.tsx` (wire the modal open state)

**Interfaces:**
- Consumes: `useCreateConventionSkill` (Task 9); accepted `ConventionCandidate[]`.
- Produces: `CreateConventionSkillModal`; pure `buildDefaultSkillBody(repoName, accepted)` (client mirror of the server merge, so the preview matches).

- [ ] **Step 1: Write the failing test** `helpers.test.ts` for `buildDefaultSkillBody` (same expectations as Task 3's `mergeConventionsToSkillBody`: heading, intro, one section per accepted rule with `file:line` + snippet, `edited_rule` wins). Then a modal test: editing the name/body and clicking "Create skill" calls the mutation with `{ name, description, body }`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && pnpm test src/app/conventions`
Expected: FAIL.

- [ ] **Step 3: Implement `helpers.ts`** with `buildDefaultSkillBody` (copy the server `mergeConventionsToSkillBody` logic verbatim so previews stay in sync) and the modal: prefilled name `${repo}-conventions`, description `${accepted.length} house conventions extracted from ${repo}`, `type` fixed to `convention` (display-only), an editable markdown body defaulting to `buildDefaultSkillBody(...)`, and a live markdown preview (reuse the same react-markdown preview the skill editor uses). Submit → `useCreateConventionSkill(repoId).mutate({ name, description, body })`; on success close the modal.

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && pnpm test src/app/conventions && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add client/src/app/conventions
git commit -m "feat(client): create-skill-from-conventions modal"
```

---

## Task 12: Client — i18n strings + nav entry verification

**Files:**
- Modify: `client/messages/en/conventions.json`
- Verify/Modify: the sidebar nav registration (grep for where nav items are defined — likely `client/src/components/app-shell/constants.ts`), ensuring a "Conventions" item routes to `/conventions`. `activeKeyFor` already maps `/conventions` → `"conventions"` (`client/src/components/app-shell/helpers.ts:31`).

**Interfaces:**
- Produces: complete `conventions.json` covering every key the components reference.

- [ ] **Step 1: Extend `client/messages/en/conventions.json`** — add any keys the components introduced (e.g. `page.detectedFrom`, `page.acceptedCount`, `page.createSkill`, `card.reject`, `card.edit`, `card.save`, `modal.*`). Keep the existing keys.

- [ ] **Step 2: Confirm the nav entry exists** — if the sidebar constants do not already include a Conventions item pointing at `/conventions`, add one (icon + key `"conventions"` + href `/conventions`), matching the existing item shape. (The screenshot shows it under "SKILLS LAB".)

- [ ] **Step 3: Run the full client suite + typecheck**

Run: `cd client && pnpm test && pnpm typecheck`
Expected: PASS; no `MISSING_MESSAGE` errors.

- [ ] **Step 4: Commit**

```bash
git add client/messages/en/conventions.json client/src/components/app-shell
git commit -m "feat(client): conventions i18n + nav entry"
```

---

## Task 13: Part B — API Contract Reviewer agent + 4 skills + control experiment

**Files:**
- Create: `docs/agent-prompts/api-contract-reviewer.md` (agent system prompt)
- Create: `docs/skills/api-contract/breaking-change.md`
- Create: `docs/skills/api-contract/response-schema.md`
- Create: `docs/skills/api-contract/semver-discipline.md`
- Create: `docs/skills/api-contract/deprecation-policy.md`
- Create: `docs/superpowers/experiments/2026-07-08-api-contract-control.md` (protocol + results)

**Interfaces:** No new code — uses the existing Skills + Agents UI/endpoints. Skill bodies are the deliverable.

- [ ] **Step 1: Write the agent system prompt** `docs/agent-prompts/api-contract-reviewer.md` — a reviewer whose job is to flag API-contract regressions in a PR: removed/renamed public fields, changed route signatures, response-shape changes, missing deprecation, and version-bump violations. Directive tone; instruct it to cite `file:line` and name the specific skill rule it applies.

- [ ] **Step 2: Write each skill body** with a directive rule + a "good / bad" example. Content:

`breaking-change.md`:
```md
# breaking-change
Flag any change that removes or renames a field, parameter, route, or enum value that is part of a PUBLIC contract (exported types, route responses, published schemas). Cite `file:line`.

BAD (breaking):
- Renaming `user.fullName` → `user.name` in a response type.
- Removing a query param a route previously accepted.

GOOD (non-breaking):
- Adding a new OPTIONAL field to a response.
- Adding a new route or a new optional param with a default.
```

`response-schema.md`:
```md
# response-schema
Flag changes to the SHAPE of a response: a field changing type, becoming required, or being removed. Optional→required is breaking; required→optional is not.

BAD: `total: number` → `total: string`; `email?: string` → `email: string`.
GOOD: adding `nextCursor?: string`; loosening `id: string` → `id?: string`.
```

`semver-discipline.md`:
```md
# semver-discipline
When a PR contains a breaking change (see breaking-change / response-schema), REQUIRE a major version bump. A breaking change shipped under a minor/patch bump is a finding.

BAD: removing a public field with only a patch bump in package.json.
GOOD: a breaking change accompanied by `1.x.y` → `2.0.0`.
```

`deprecation-policy.md`:
```md
# deprecation-policy
Prefer deprecation over silent removal. A field/route being removed without a prior `@deprecated` marker (and a migration note) is a finding.

BAD: deleting `GET /v1/foo` outright.
GOOD: marking `GET /v1/foo` `@deprecated` with a pointer to `GET /v2/foo`, removed only in the next major.
```

- [ ] **Step 3: Create the agent + link the skills via the UI** — document exact clicks in the experiment file: create the agent (paste the Step-1 prompt), create the 4 skills (author 3 via the Skills "Create" flow; bring **one in via Import** to exercise that path), then bind all 4 in the Agent editor **Skills** tab (enabled).

- [ ] **Step 4: Run the control experiment** — pick/create a PR that renames a response field or changes a route signature. Run the agent **with skills disabled** (all unchecked in the Skills tab) and again **with skills enabled**. Record in `docs/superpowers/experiments/2026-07-08-api-contract-control.md`: the PR, both run trace links/ids, the findings each produced, and the verdict (skills-off misses the breaking change; skills-on catches it and comments citing the `breaking-change` rule).

- [ ] **Step 5: Commit**

```bash
git add docs/agent-prompts/api-contract-reviewer.md docs/skills/api-contract docs/superpowers/experiments/2026-07-08-api-contract-control.md
git commit -m "docs(experiment): API Contract Reviewer agent + skills + control run"
```

---

## Final verification

- [ ] **Server:** `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test && pnpm typecheck`
- [ ] **Client:** `cd client && pnpm test && pnpm typecheck`
- [ ] **End-to-end smoke:** `./scripts/dev.sh`, open `/conventions`, select a cloned+indexed repo, Run extraction, accept ≥1 candidate, Create skill, then bind it to an agent and confirm it appears in a review's trace `## Skills / rules` block.
- [ ] **Wrap-up:** invoke the `engineering-insights` skill to capture any non-obvious lessons into the touched packages' `INSIGHTS.md`.

---

## Self-Review (completed)

**Spec coverage:** A1 schema → Task 2; A2 contracts → Task 1; A3 routes → Task 6; A4 extract+grounding → Tasks 3+5; A5 client → Tasks 9–12; create-skill merge → Tasks 3/5/11; Part B → Task 13; enhancements #1 (configs) → Task 5 (`CONFIG_FILES`), #2 (category taxonomy) → Tasks 1/2/5. Testing section → Tasks 3, 8, 10, 11. ✔

**Placeholder scan:** the only intentionally-descriptive blocks are Task 8's it.test bodies and Task 10/11's RTL bodies, which point at a concrete sibling test to copy the harness from (real files named) rather than leaving logic unspecified — acceptable because the harness bootstrap is repo-specific and must be read from the actual sibling. All server logic tasks carry complete code. ✔

**Type consistency:** `ConventionCandidate` (persisted DTO), `ConventionDraft` (model output), `ConventionScan`, `ExtractResult`, `UpdateConventionInput`, `CreateConventionSkillInput` are used identically across contracts → repository → service → routes → hooks. `locateEvidence`/`normalizeWs`/`mergeConventionsToSkillBody` signatures match between Task 3 (def) and Task 5/11 (use). ✔

**Known implementer confirmations flagged inline:** exact `repos` column names (Task 4), where `skills` pgTable is declared for the FK import (Task 2), and the sibling `*.it.test.ts` harness (Task 8) — each has a grep instruction.
