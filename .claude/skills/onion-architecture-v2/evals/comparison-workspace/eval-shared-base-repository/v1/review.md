# Onion Architecture Review: bookmarks module

**Fixture path**: `/Users/kyrylo.bogdanov/course_materials/dev-digest/.claude/skills/onion-architecture-v2/evals/fixtures/07-shared-base-repository/modules/bookmarks/`

**Review date**: 2026-07-25

---

## Summary
The bookmarks module demonstrates good layering and tenancy guardrails, but **contains one dependency-rule violation**: the service instantiates its repository directly instead of resolving it from the container.

---

## Violations Found

### VIOLATION: Service instantiates adapter directly (repository.ts)

**Severity**: Medium (violates dependency rule / breaks testability)

**Location**: `service.ts`, lines 8–10

**Code**:
```ts
constructor(private container: Container) {
  this.repo = new BookmarkRepository(container.db);
}
```

**Issue**:
The service directly instantiates `BookmarkRepository` (a secondary adapter for persistence) instead of resolving it from the container. This violates the onion dependency rule as stated in the skill:

> "Services receive `Container`; never instantiate adapters directly."  
> — SKILL.md, line 36

And in the common mistakes section:

> "**Service `new`s an adapter** (`new OctokitGitHubClient(...)` inside `service.ts`).  
> → Resolve it off the container; the container owns construction + secrets."  
> — SKILL.md, lines 89–90

While the example in the skill uses an external adapter (OctokitGitHubClient), the principle applies equally to secondary adapters like repositories: adapters should be wired in the composition root (`platform/container.ts`) and resolved through the container, not constructed in the service.

**Why this matters**:
1. **Testability**: Tests cannot inject a mock repository without modifying the service constructor.
2. **Composition control**: The container loses the ability to override or customize the repository for different scenarios.
3. **Dependency rule**: The dependency graph should flow `routes → service → container → adapters`, not `routes → service → (new adapters)`.

**Fix**:
- Wire `BookmarkRepository` as a lazy getter in the container (e.g., `get bookmarkRepo(): BookmarkRepository { ... }`).
- Change the service to receive the repository from the container:
  ```ts
  constructor(private container: Container) {
    this.repo = container.bookmarkRepo;
  }
  ```
  Or better, inline it:
  ```ts
  async list(workspaceId: string) {
    const rows = await this.container.bookmarkRepo.list(workspaceId);
    return rows.map(toBookmarkDto);
  }
  ```

---

## Observations: What Works Well

### BaseRepository provides clean generic CRUD plumbing
**Location**: `_shared/base-repository.ts`, lines 10–26

The abstract base class correctly:
- Stays in the persistence layer (no cross-module export).
- Injects the table schema at construction time (via subclass), avoiding hardcoded table references.
- Enforces tenancy guardrails on all queries: `eq(this.table.workspaceId, workspaceId)` in both `findScoped` and `listScoped`.
- Uses Drizzle `where` clauses correctly (`and(eq(...), eq(...))`).

This is a sound pattern for reducing boilerplate across repository implementations.

### Repository follows canonical pattern
**Location**: `repository.ts`, lines 7–18

The `BookmarkRepository` correctly:
- Extends `BaseRepository<BookmarkRow>` with the inferred row type.
- Passes `db` and `t.bookmarks` to the parent constructor.
- Delegates scoped operations to protected methods (`listScoped`, `findScoped`).
- Includes a workspace-tenancy guard in all queries (inherited from base).

This matches the skill's reference recipe.

### Routes delegate cleanly to service
**Location**: `routes.ts`, lines 6–14

The routes correctly:
- Parse request context via `getContext(app.container, req)` (extracting workspaceId).
- Instantiate the service with the container (`new BookmarkService(app.container)`).
- Delegate to service methods and return their result directly.
- Do not contain business logic (only parse, delegate, and return).

This matches the transport layer expectations.

### Service maps rows to DTOs before returning
**Location**: `service.ts`, lines 12–14

The service correctly:
- Calls `repo.list(workspaceId)` to fetch rows.
- Pipes rows through `toBookmarkDto()` before returning.
- Never exposes raw Drizzle `BookmarkRow` types to the caller.

This prevents Drizzle schema leakage and maintains the DTO boundary expected in the transport layer.

### Helpers provide pure transforms
**Location**: `helpers.ts`, lines 3–5

The `toBookmarkDto()` function:
- Takes a `BookmarkRow` and returns a clean DTO shape.
- Contains no I/O or side effects.
- Is reusable and testable.

This follows the canonical recipe.

### Constants are isolated
**Location**: `constants.ts`

A single constant (`MAX_BOOKMARKS`) is correctly isolated, making it easy to reuse and change without touching business logic.

---

## Dependency Graph

**Expected (onion rule)**:
```
routes → service → (container → repository)
repository → (db/client, db/schema)
```

**Actual**:
```
routes → service (newed!) ↘
         service → repository
         repository → (db/client, db/schema)
```

The service violates the rule by directly instantiating the repository instead of resolving it through the container.

---

## Checklist

| Rule | Status | Evidence |
|---|---|---|
| Domain core imports nothing from `server/src` | ✓ PASS | No domain core in this fixture; base-repository is infra (persistence layer). |
| Service depends on **port interfaces**, not concrete adapters | ✗ **FAIL** | Service instantiates `BookmarkRepository` (concrete adapter) on line 9. |
| Service receives `Container`, never `new`s adapters | ✗ **FAIL** | `new BookmarkRepository(container.db)` on line 9. |
| Repository is the ONLY place touching its table | ✓ PASS | All Drizzle queries confined to `repository.ts`. |
| Drizzle rows stay inside repository/service; routes return DTOs | ✓ PASS | `toBookmarkDto()` maps rows to DTOs before returning to routes. |
| Workspace-scoped queries (tenancy guard) | ✓ PASS | All repository queries include `workspaceId` check via `BaseRepository`. |
| Routes only parse, delegate, return (no business logic) | ✓ PASS | Routes extract context and call `service.list()`; no conditionals or loops. |
| No cross-module reach-in | ✓ PASS | No imports of other modules' repositories or internals. |
| No `process.env` reads in feature code | ✓ PASS | No environment variable access in bookmarks module. |

---

## Conclusion

The bookmarks module demonstrates solid onion architecture fundamentals: clean layering, correct DTO boundaries, tenancy guardrails, and proper use of the `BaseRepository` generic. However, it **violates the dependency rule** by having the service instantiate its repository adapter instead of resolving it from the container. This breaks the composition-root pattern and makes unit testing harder.

**Action required**: Move repository instantiation from `BookmarkService` constructor to the container, and inject it via dependency injection.
