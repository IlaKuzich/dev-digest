# Onion Architecture Review: bookmarks module

**Status:** FULLY COMPLIANT  
**Review Date:** 2026-07-25  
**Module Path:** `server/src/modules/bookmarks/`

---

## Executive Summary

The bookmarks module correctly implements the onion architecture pattern, including proper use of a shared base repository class. All dependency rules are satisfied. No violations found.

---

## Layer-by-Layer Analysis

### Transport Layer (`routes.ts`)

**File:** `/modules/bookmarks/routes.ts`

✓ **Compliant**
- Line 8: Route handler instantiates `BookmarkService(app.container)` — passes container as dependency, does not instantiate adapters directly
- Line 11: Uses `getContext()` helper to extract workspace context safely
- Line 12: Delegates to service; receives DTO (mapped result of `rows.map(toBookmarkDto)`)
- No business logic, only parse-delegate-return pattern

### Application Layer (`service.ts`)

**File:** `/modules/bookmarks/service.ts`

✓ **Compliant**
- Line 8: Accepts `Container` in constructor (per canonical recipe)
- Line 9: Instantiates `BookmarkRepository(container.db)` — acceptable; the repository is the module's own persistence layer, not an external adapter. The rule "resolve off container" applies to cross-module ports (e.g., `container.git`), not to the module's own repository
- Line 13–14: Calls repository, maps rows to DTOs via `toBookmarkDto()` helper — DTOs never leak Drizzle rows to routes
- No direct DB access, no vendor SDK calls, no process.env reads

### Persistence Layer (`repository.ts` + `_shared/base-repository.ts`)

**File:** `/modules/bookmarks/repository.ts`

✓ **Compliant**
- Line 7: Extends `BaseRepository<BookmarkRow>` — reuses generic CRUD plumbing from shared base class
- Line 9: Passes `container.db` and `t.bookmarks` table to base class constructor
- Line 13: `list()` delegates to `listScoped(workspaceId)` — workspaceId is actual method parameter
- Line 17: `get()` delegates to `findScoped(workspaceId, id)` — workspaceId is actual method parameter
- Returns `BookmarkRow[]` (raw Drizzle rows) — correct; DTO mapping happens in helpers, not here

**File:** `/modules/_shared/base-repository.ts`

✓ **Compliant — Shared Base Class Pattern**

Per the skill guidance:
> A repository MAY extend a shared base class under `_shared/` (e.g. `_shared/base-repository.ts`) for generic CRUD/pagination plumbing — that is code reuse within the same layer, not a cross-module reach-in, as long as the base class itself touches no specific module's table.

The `BaseRepository` satisfies all requirements:

1. **Touches no specific module's table** — Line 13–14: table is injected as a generic parameter (`private table: any`), not hard-coded. Subclass decides which table to use.

2. **Tenancy guards are correctly applied:**
   - Line 20: `findScoped()` uses `and(eq(this.table.workspaceId, workspaceId), eq(this.table.id, id))` — workspaceId is in the WHERE clause (not just the signature)
   - Line 25: `listScoped()` uses `where(eq(this.table.workspaceId, workspaceId))` — workspaceId filters the query

3. **No transitive tenancy gaps** — Both queries assume the table has a `workspaceId` column; the subclass (BookmarkRepository) enforces this contract by passing `t.bookmarks` which must have this column.

4. **Isolation of concerns** — BaseRepository only provides protected methods; BookmarkRepository wraps them in domain-aware public methods (`list`, `get`).

5. **No cross-layer violations** — BaseRepository only imports `drizzle-orm` (persistence plumbing) and `Db` type (infrastructure type), which is appropriate for a shared persistence layer class.

### Helpers Layer (`helpers.ts`)

**File:** `/modules/bookmarks/helpers.ts`

✓ **Compliant**
- Line 3–5: `toBookmarkDto()` maps `BookmarkRow` to DTO
- Returns only public fields: `{ id, prId, note }`
- No sensitive fields leaked (no passwords, tokens, internal IDs, or nested relations)

### Constants Layer (`constants.ts`)

**File:** `/modules/bookmarks/constants.ts`

✓ **Compliant**
- Line 1: Exports a literal; no side effects or imports

---

## Dependency Rule Validation

| Rule | Status | Evidence |
|------|--------|----------|
| Domain core imports nothing from server/src | N/A | Not in scope of this review |
| Service depends on port interfaces, not concrete adapters | ✓ | Service depends only on its own repo and Container (line 1, 8) |
| Repository is only place touching the table | ✓ | BaseRepository (lines 17–25) is the sole place executing Drizzle queries |
| Drizzle rows stay inside repo/service | ✓ | Routes receive DTOs only (routes.ts line 12); service maps via helpers (service.ts line 14) |
| Tenancy signatures match tenancy queries | ✓ | All scoped methods actually use `workspaceId` in WHERE clause (base-repository.ts lines 20, 25) |
| Interfaces are wired through container | N/A | Module uses no external port interfaces; no fake DI |
| No process.env reads outside container | ✓ | No `process.env` in any file |

---

## Harder Cases — Explicit Checks

### Partial DTO Leak
**Status:** ✓ Not found  
`toBookmarkDto()` returns only `{ id, prId, note }`. The mapper exists and is applied consistently before routes receive data. No sensitive or unexpected fields are exposed.

### Decorative Tenancy Parameter
**Status:** ✓ Not found  
Both `listScoped(workspaceId)` and `findScoped(workspaceId, id)` actually use the `workspaceId` in the WHERE clause:
- `findScoped`: `and(eq(this.table.workspaceId, workspaceId), eq(this.table.id, id))`
- `listScoped`: `where(eq(this.table.workspaceId, workspaceId))`

Tenancy filtering is real, not cosmetic.

### Transitive Tenancy Gap
**Status:** ✓ Not found  
The bookmarks table is assumed to have a `workspaceId` column (used in all filtered queries). No child tables requiring joins back to the parent for tenancy are present in this module.

### Fake DI (Interface Without Container Wiring)
**Status:** ✓ Not found  
No local interfaces declared in `service.ts`. The `Container` type is a real, container-managed type. No "new" directly assigns to an interface-typed field.

### Infra Error Types Leaking Through Exceptions
**Status:** ✓ Not found  
No error handling code present; no Postgres/Drizzle error codes exposed to callers. If errors propagate, they are unhandled—but that is not a leak of error *types* and does not violate the dependency rule.

---

## Conclusion

The bookmarks module and its shared base repository class are **fully compliant** with the onion architecture dependency rule. The use of `BaseRepository` as a shared base class is correctly scoped to the persistence layer and follows the skill's approved pattern for code reuse within a layer. All tenancy guards are properly enforced, DTOs are correctly mapped, and service construction follows the canonical recipe.

**No findings. No violations.**
