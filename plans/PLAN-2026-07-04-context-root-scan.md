# Plan: Context Root Scan

> Status: DRAFT
> Created: 2026-07-04
> Spec: specs/SPEC-2026-07-04-context-root-scan.md
> Execution Mode: single-agent

## Requirements (VRF)
> Status: Confirmed

| ID | Requirement | Source |
|----|------------|--------|
| R1 | `ContextService.listDocs()` additionally collects `.md` files sitting directly (depth 0) in the clone root and returns them as ordinary `SpecFile[]` entries (path relative to clone root, e.g. `README.md`) | SPEC-2026-07-04 AC-1 |
| R2 | For every top-level directory of the clone, `listDocs()` collects `.md` files sitting directly (depth 1, non-recursive) inside it, treating any top-level directory as a candidate "module root" — no hardcoded module list | SPEC-2026-07-04 AC-2 |
| R3 | `.md` files deeper than depth 1 inside a top-level directory (e.g. `server/sub/note.md`), and not inside a recognized context directory, are NOT picked up by the new root/module logic | SPEC-2026-07-04 AC-3 |
| R4 | Any file named `CLAUDE.md` (case-insensitive) is always excluded from the result, regardless of location (root or any top-level directory) | SPEC-2026-07-04 AC-4 |
| R5 | `.claude` is added to the directory skip-list (alongside `node_modules`, `.git`, `.next`, `dist`, `build`) and is never entered by any scan (root scan, module scan, or the existing recursive walk) | SPEC-2026-07-04 AC-5 |
| R6 | The module-root scan skips any top-level directory whose name is a recognized context directory name (`specs`, `docs`, `insights`), since the recursive walk already covers it in full; every file appears in the result exactly once (no dupes) | SPEC-2026-07-04 AC-6 |
| R7 | Client `getDocType(path)` returns `"insight"` only for paths containing an `insights` segment; any path not matching `specs`/`docs`/`insights` returns a new 4th `DocType` value `"readme"` instead of the current fallback to `"insight"` | SPEC-2026-07-04 AC-7 |
| R8 | `BADGE_COLORS` gets a distinct color entry for `DocType` `"readme"`, different from `spec`/`doc`/`insight` | SPEC-2026-07-04 AC-8 |
| R9 | `DOC_TYPE_I18N` gets a new key for the `readme` badge label (e.g. `badgeReadme`), and that key exists in the `en` messages file | SPEC-2026-07-04 AC-9 |

## Open Questions & Recommendations

| # | Question | Answer | Type |
|---|----------|--------|------|
| Q1 | Should top-level dot-directories other than `.claude` (e.g. `.github`, `.vscode`) be excluded from module-root scanning entirely, or included per the literal "any top-level directory" wording? | Exclude ALL top-level dot-directories from module-root scanning (skip condition = "starts with `.`"), not just an exact `.claude` string match. This generalization also applies to the AC-5 skip-dir handling, so the same skip check is reused consistently across the existing recursive walk and the new scans. | 🚩 red flag → resolved |
| Q2 | Does the new readme-badge i18n key need to be added to locale files beyond `en`? | `en` only (`client/messages/en/context.json`). Confirmed via research: `client/messages/` contains only an `en/` directory — no other locale exists in the repo today. | gap → resolved |
| Q3 | Is deleting `TODO-context-root-scan.md` an actual task in this plan? | Out of scope. Closing note only; not a tracked AC or task. | gap → resolved |

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| backend: `context` | `server/src/modules/context/service.ts` | Modify |
| backend: `context` (tests) | `server/src/modules/context/service.test.ts` | Modify |
| frontend: `context-utils` | `client/src/components/context/context-utils.ts` | Modify |
| frontend: `context-utils` (tests) | `client/src/components/context/context-utils.test.ts` | Add (new file — no prior test exists) |
| frontend: i18n | `client/messages/en/context.json` | Modify |

Not touched (confirmed via research, no changes needed): `server/src/modules/context/routes.ts` (same response shape), `server/src/platform/container.ts` (no new adapter/DI — `ContextService` already lazily wired, constructor takes only `Container`), `server/src/vendor/shared/contracts/platform.ts` (`SpecFile` contract unchanged), `client/src/vendor/shared/contracts/platform.ts` (same, unchanged).

## Tasks

### TASK-001: Backend — root & module-root markdown scan in `ContextService.listDocs`

**Scope:** backend

**Owned Paths:**
- `server/src/modules/context/service.ts`
- `server/src/modules/context/service.test.ts`

**Current state (from research):**
- `CONTEXT_DIR_NAMES = new Set(["specs", "docs", "insights"])` (line 120)
- `SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build"])` (line 121)
- `listDocs(clonePath)` (lines 49–59) currently only calls `walkForContextDirs(clonePath, clonePath, files)` inside a try/catch, returns `[]` on empty `clonePath` or unreadable clone.
- `walkForContextDirs` (lines 128–149): recursively walks the tree, skips directories whose `entry.name` is in `SKIP_DIRS` (literal match), and when it finds a directory named per `CONTEXT_DIR_NAMES` it delegates to `collectMdFiles` for that subtree.
- `collectMdFiles` (lines 151–183): recursively collects `.md` files inside a context dir, builds `SpecFile` via `stat()` + `readFile(utf8)`, `relativePath = absPath.slice(clonePath.length + 1)`, `estimated_tokens = Math.ceil(content.length / 4)`. Read errors are silently swallowed per file.

**Required changes:**
1. Add a private helper `shouldSkipDir(name: string): boolean` returning `this.SKIP_DIRS.has(name) || name.startsWith(".")`. This centralizes the dot-directory exclusion (Q1) and satisfies AC-5's `.claude` skip as a special case of "starts with `.`" — do not add `.claude` as a literal string to `SKIP_DIRS`, use the general check instead.
2. Update `walkForContextDirs`'s existing directory-skip check to call `shouldSkipDir(entry.name)` instead of `this.SKIP_DIRS.has(entry.name)` directly — this is the "defense in depth" part of AC-5 (never enter `.claude/` during the *existing* recursive walk either, not just the new scans).
3. Add a private helper (e.g. `collectRootMd(clonePath, files)`): `readdir(clonePath, { withFileTypes: true })`, for each entry that `isFile()`, name ends with `.md`, and `name.toLowerCase() !== "claude.md"` → build a `SpecFile` the same way `collectMdFiles` does (stat + readFile + token estimate) with `path` equal to the bare filename (e.g. `README.md`), push to `files`. Satisfies AC-1, AC-4 (root).
4. Add a private helper (e.g. `collectModuleRootMd(clonePath, files)`): `readdir(clonePath, { withFileTypes: true })`, for each entry that `isDirectory()`:
   - skip if `shouldSkipDir(entry.name)` (AC-5 / Q1)
   - skip if `this.CONTEXT_DIR_NAMES.has(entry.name)` (AC-6 — already fully handled by the recursive walk, avoids duplicates)
   - otherwise `readdir(join(clonePath, entry.name), { withFileTypes: true })`, for each nested entry that `isFile()`, name ends with `.md`, and `name.toLowerCase() !== "claude.md"` → build a `SpecFile` with `path` = `${entry.name}/${nested.name}` (e.g. `server/README.md`), push to `files`. Satisfies AC-2, AC-3 (implicitly — no recursion past this one nested `readdir`), AC-4 (module), AC-6.
5. Update `listDocs` to call all three collectors inside the existing try/catch, in this order: `collectRootMd` → `walkForContextDirs` (existing) → `collectModuleRootMd`. Keep the single try/catch wrapping all three so an unreadable/missing `clonePath` still yields `[]` (preserves existing empty-clone behavior — no new goal here, just don't break it).
6. No changes to `SpecFile` shape, `estimated_tokens` heuristic, `reindex()`, or `readDocsByPaths()` — they already compose over `listDocs()`'s output unmodified (confirmed non-goal).

**Acceptance Criteria:**
- [ ] AC-001: A clone with `README.md` at its root → `listDocs()` returns an item with `path === "README.md"` (maps to R1)
- [ ] AC-002: A clone with `server/README.md` and `client/README.md` → `listDocs()` returns both `server/README.md` and `client/README.md` (maps to R2)
- [ ] AC-003: A clone with `server/sub/note.md` (no specs/docs/insights dir involved) → `note.md` is absent from the result (maps to R3)
- [ ] AC-004: A clone with `CLAUDE.md` at root and `server/claude.md` (lowercase) → neither appears in the result (maps to R4)
- [ ] AC-005: A clone with `.claude/docs/notes.md` → `notes.md` is absent (skip-dir triggers before entering `.claude/`) (maps to R5)
- [ ] AC-006: A clone with top-level `docs/README.md` → the result contains `docs/README.md` exactly once (maps to R6)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `cd server && pnpm exec vitest run src/modules/context/service.test.ts` → new test case passes |
| AC-002 | Same test file, new case asserting both `server/README.md` and `client/README.md` present |
| AC-003 | Same test file, new case asserting `server/sub/note.md` absent |
| AC-004 | Same test file, new case asserting `CLAUDE.md` and `server/claude.md` both absent |
| AC-005 | Same test file, new case asserting `.claude/docs/notes.md` absent |
| AC-006 | Same test file, new case asserting `docs/README.md` appears exactly once (`paths.filter(p => p === "docs/README.md").length === 1`) |

Follow the existing test pattern in `service.test.ts`: `tempDir = join(tmpdir(), \`ctx-test-${Date.now()}-${Math.random()...}\`)` built in `beforeEach`/torn down in `afterEach`, `stubContainer = {} as Container`, fixtures built inline with `mkdir` + `writeFile`, assertions against `.path` / `.content` / `.estimated_tokens` / `.size` / `.updated_at`. Add new cases either as new `it()` blocks in the existing `describe`, or a new nested `describe("root and module-root scan", ...)` block in the same file.

---

### TASK-002: Frontend — new `readme` DocType, badge color, i18n label

**Scope:** frontend

**Owned Paths:**
- `client/src/components/context/context-utils.ts`
- `client/src/components/context/context-utils.test.ts` (new file)
- `client/messages/en/context.json`

**Current state (from research, full current file content):**
```ts
export type DocType = "spec" | "doc" | "insight";

export function getDocType(path: string): DocType {
  const segments = path.split("/");
  if (segments.includes("specs")) return "spec";
  if (segments.includes("docs")) return "doc";
  return "insight";
}

export const BADGE_COLORS: Record<DocType, string> = {
  spec: "var(--accent)",
  doc: "var(--ok)",
  insight: "var(--warn)",
};

export const DOC_TYPE_I18N: Record<
  DocType,
  "badgeSpec" | "badgeDoc" | "badgeInsight"
> = {
  spec: "badgeSpec",
  doc: "badgeDoc",
  insight: "badgeInsight",
};
```
`client/messages/en/context.json` currently has, inside the `attach` object: `"badgeSpec": "specs"`, `"badgeDoc": "docs"`, `"badgeInsight": "insights"`.

**Required changes:**
1. `DocType` → `"spec" | "doc" | "insight" | "readme"`.
2. `getDocType`: add an explicit `insights` segment check (so `"insight"` is returned only when the `insights` segment is actually present, per AC-7), and change the final fallback from `"insight"` to `"readme"`:
   ```
   if (segments.includes("specs")) return "spec";
   if (segments.includes("docs")) return "doc";
   if (segments.includes("insights")) return "insight";
   return "readme";
   ```
3. `BADGE_COLORS`: add a `readme` entry with a CSS variable distinct from `--accent`/`--ok`/`--warn` (exact variable name is implementer's choice per spec's own non-goal — pick one consistent with existing theme tokens, e.g. an existing neutral/info token if one exists in the theme, otherwise introduce a new CSS var following the same naming convention as the other three).
4. `DOC_TYPE_I18N`: add `readme: "badgeReadme"`, and widen the `Record` value union to include `"badgeReadme"`.
5. `client/messages/en/context.json`: add `"badgeReadme": "..."` inside the same `attach` object as the other three badge keys (exact label text is implementer's choice — short noun consistent with `"specs"`/`"docs"`/`"insights"`, e.g. `"readme"`).
6. No other locale files exist in `client/messages/` today (confirmed via research) — do not add tasks for other locales (Q2).

**Acceptance Criteria:**
- [ ] AC-007: `getDocType("README.md") === "readme"`; `getDocType("server/README.md") === "readme"`; `getDocType("insights/gotchas.md") === "insight"` (maps to R7)
- [ ] AC-008: `BADGE_COLORS.readme` is defined and not equal to `BADGE_COLORS.insight` (maps to R8)
- [ ] AC-009: `DOC_TYPE_I18N.readme` is defined; `client/messages/en/context.json` contains the corresponding badge key (maps to R9)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-007 | `cd client && pnpm test -- context-utils.test.ts` → new unit test asserting the three `getDocType` cases from the spec's own observable |
| AC-008 | Same test file, assert `BADGE_COLORS.readme !== undefined && BADGE_COLORS.readme !== BADGE_COLORS.insight` |
| AC-009 | Same test file, assert `DOC_TYPE_I18N.readme === "badgeReadme"` (or chosen key name) and that `client/messages/en/context.json`'s `attach` object has that key (read the JSON file in the test, or hardcode the expected key string per the plan's chosen name) |

`context-utils.ts` is a plain function module (no React, no DOM) — write plain `describe`/`it` unit tests in `context-utils.test.ts`, no RTL/jsdom rendering needed, unlike the sibling `SeverityChip.test.tsx`/`RunHistory.test.tsx` patterns which do render components.

---

## Implementation Phases

> ⚙️ Execution mode: **single-agent** (sequential — small, single coherent change, one backend file + one small frontend utility file, per confirmed execution mode)

### Phase 1: Backend
- [ ] `server/src/modules/context/service.ts` — add `shouldSkipDir`, `collectRootMd`, `collectModuleRootMd`; wire into `listDocs`; update `walkForContextDirs`'s skip check to use `shouldSkipDir`
- [ ] `server/src/modules/context/service.test.ts` — add test cases for AC-001..AC-006
- [ ] `cd server && pnpm typecheck`
- [ ] `cd server && pnpm exec vitest run src/modules/context/service.test.ts`

### Phase 2: Frontend
- [ ] `client/src/components/context/context-utils.ts` — extend `DocType`, `getDocType`, `BADGE_COLORS`, `DOC_TYPE_I18N`
- [ ] `client/messages/en/context.json` — add `badgeReadme` key
- [ ] `client/src/components/context/context-utils.test.ts` — new file, test cases for AC-007..AC-009
- [ ] `cd client && pnpm typecheck`
- [ ] `cd client && pnpm test -- context-utils.test.ts`

### Phase 3: Full verification
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — full hermetic backend suite still green
- [ ] `cd client && pnpm test` — full client suite still green

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Excluding ALL top-level dot-directories (Q1 default) is broader than the spec's literal wording, which only mandates skipping `.claude` | Explicitly confirmed with user as the intended scope extension (see Open Questions Q1); documented here so a future spec reader isn't surprised that `.github`, `.vscode`, etc. never surface as module roots |
| Symlinked top-level directories may behave inconsistently depending on `readdir(..., { withFileTypes: true })` semantics | Explicitly called out as accepted risk in the spec's edge cases — no mitigation implemented, matches non-goal |
| Adding two more non-recursive `readdir` passes per `listDocs()` call could add latency on repos with very many top-level entries | Both new passes are bounded to depth 0/1 only (no recursion), so cost scales with top-level entry count, not repo size |
| `getDocType`'s segment-based matching (`segments.includes("docs")`) could theoretically over-match a directory literally named `docs` anywhere in the path, not just at a recognized root | Already existing behavior, unchanged by this plan — the new `readme` fallback doesn't introduce any new ambiguity, it only replaces what used to silently fall through to `"insight"` |

## Out of Scope

- `plans/` as a recognized context directory (spec non-goal)
- Any change to the `SpecFile` Zod contract in either `server/src/vendor/shared/contracts/platform.ts` or its client copy (spec non-goal, confirmed unchanged by research)
- Any change to `readDocsByPaths()` or `reindex()` (spec non-goal — both already compose over `listDocs()`'s output unmodified)
- README-only filtering — any `.md` file is collected, not just files literally named `README.md`
- Recursive scanning of module roots deeper than depth 1
- Exact CSS variable name and copy text for the `readme` badge — implementer's discretion (spec non-goal)
- Adding the new i18n key to locale files other than `en` — none exist in the repo today (Q2)
- Deleting `TODO-context-root-scan.md` — closing note only, not a tracked task (Q3)

## Architecture Notes

- `ContextService` is a DB-less, pure-filesystem service living directly under `server/src/modules/context/` — it has no `repository.ts` and owns its own FS access directly via `node:fs/promises` (`readdir`/`readFile`/`stat`), which is the existing, already-established pattern for this module (confirmed via `server/insights/INSIGHTS.md`, 2026-07-02 entry). New helpers (`shouldSkipDir`, `collectRootMd`, `collectModuleRootMd`) should be added as additional private methods on the same class, following the same style as the existing `collectMdFiles`/`walkForContextDirs` — no new files, no DI/container changes, no new adapters.
- Centralize the directory-skip logic into one `shouldSkipDir` helper reused by both the existing recursive walk and the two new scans, rather than duplicating the dot-directory check three times — keeps AC-5's "any scanning" requirement provably true from a single code path.
- The dedup guarantee in AC-6 is achieved by construction (module-root scan explicitly skips `CONTEXT_DIR_NAMES`-matching top-level directories, so it can never produce a path the recursive walk already produced) rather than by a runtime `Set`-based dedup pass — simpler and matches the existing code's style of not over-engineering. If the implementer prefers an explicit `seenPaths` guard as defense-in-depth, that is acceptable but not required to satisfy AC-6.
- `context-utils.ts` on the client is a plain, framework-free utility module (no `"use client"` needed, no hooks) — keep it that way; only the `DocType` union, `getDocType`, `BADGE_COLORS`, and `DOC_TYPE_I18N` change.
- No route, contract, or container changes in this feature — it is entirely internal to one backend service method's private helpers and one frontend utility module.
