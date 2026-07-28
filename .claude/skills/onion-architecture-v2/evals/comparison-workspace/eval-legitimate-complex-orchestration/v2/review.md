# Onion-Architecture Review: sync-orchestrator Module

**Module path:** `modules/sync-orchestrator/`  
**Review date:** 2026-07-25  
**Compliance status:** ✓ FULLY COMPLIANT

---

## Summary

The `sync-orchestrator` module is **fully compliant** with the DevDigest onion-architecture dependency rule. All layers are correctly separated, dependencies flow inward only, tenancy guards are properly enforced, DTOs are correctly mapped, and all port access is mediated through the container.

---

## Detailed Findings

### 1. Layer Separation & File Organization ✓

All files are in their correct layers per the canonical recipe:

| File | Layer | Role | Status |
|------|-------|------|--------|
| `routes.ts` | Transport | Parse request, delegate to service | ✓ Clean |
| `service.ts` | Application | Business logic, orchestration, container access | ✓ Clean |
| `repository.ts` | Persistence | SQL queries, workspace-scoped access | ✓ Clean |
| `helpers.ts` | Pure transforms | Row → DTO mapping | ✓ Clean |
| `constants.ts` | Literals | Job kind constants | ✓ Clean |

### 2. The Dependency Rule ✓

**Rule: routes → service → (ports + repository); adapters implement ports; container wires them.**

**Finding:** All dependencies flow correctly inward.

- **Routes layer** (`routes.ts:1-21`)
  - Imports only: Fastify types, Zod provider, shared context/schemas, own service
  - No database access, no adapter instantiation
  - Delegates all business logic to service ✓

- **Service layer** (`service.ts:1-38`)
  - Receives `Container` via constructor (line 10)
  - All external integrations accessed through container ports:
    - `this.container.git.sync()` (line 21) — git port
    - `this.container.github()` (line 22) — github port
    - `this.container.jobs.enqueue()` (line 23) — jobs port
  - Instantiates only its own repository (line 11): `new SyncOrchestratorRepository(container.db)` ✓
  - Type-only import from another module's contracts (line 2: `IndexSummary`) — harmless ✓

- **Persistence layer** (`repository.ts:1-23`)
  - Extends `BaseRepository<SyncRunRow>` (line 7)
  - Imports only: database client/schema, own base class
  - All queries are workspace-scoped:
    - `list(workspaceId)` → calls `listScoped()` with tenancy guard (line 13)
    - `recordRun()` includes `workspaceId` in INSERT values (line 19)
  - No cross-module repository access ✓

### 3. Tenancy Compliance ✓

**Rule: `workspaceId` must appear in actual WHERE/INSERT clause, not just signature.**

- **`recordRun` method** (`repository.ts:16-22`)
  - Signature: `recordRun(workspaceId: string, repoId: string, status: string)`
  - Implementation: `values({ workspaceId, repoId, status, ... })` (line 19)
  - Tenancy is **actively enforced** in INSERT ✓

- **`list` method** (`repository.ts:12-14`)
  - Signature: `list(workspaceId: string)`
  - Implementation: calls `this.listScoped(workspaceId)` (line 13)
  - Base class method `listScoped` enforces tenancy (base-repository.ts:24-25):
    ```typescript
    where(eq(this.table.workspaceId, workspaceId))
    ```
  - Tenancy is **actively enforced** in WHERE clause ✓

- **Service-level tenancy flow** (`service.ts:14-27`)
  - `runFullSync(workspaceId: string, ...)` receives workspace context from routes
  - Passes to `this.repo.recordRun(workspaceId, ...)` (line 20)
  - No query bypasses or unscoped database access ✓

### 4. DTO Mapping & Data Exposure ✓

**Rule: Drizzle rows stay inside repository/service; routes return DTOs only.**

- **DTO mapper** (`helpers.ts:3-5`)
  ```typescript
  export function toSyncRunDto(row: SyncRunRow) {
    return { id: row.id, repoId: row.repoId, status: row.status, startedAt: row.startedAt };
  }
  ```
  - Selective field exposure: only `id`, `repoId`, `status`, `startedAt`
  - Excludes any internal-only fields
  - No partial leaks ✓

- **Service return types** (`service.ts:19, 32`)
  - `runFullSync()` returns `ReturnType<typeof toSyncRunDto>` — DTO type
  - `list()` returns `rows.map(toSyncRunDto)` — DTO array
  - No raw `SyncRunRow` objects exposed to routes ✓

- **Route return types** (`routes.ts:14, 19`)
  - Both endpoints return the service's DTO-mapped results
  - No raw Drizzle rows reach the client ✓

### 5. Port Access & Composition Root ✓

**Rule: Services receive `Container`; never instantiate adapters directly.**

- **Container dependency** (`service.ts:10-12`)
  - Service receives `Container` via constructor
  - Repository initialized with `container.db` (not direct instantiation)
  - All port access mediated through container ✓

- **Port access patterns** (`service.ts:21-23`)
  - `this.container.git.sync(...)` — lazy getter or cached
  - `this.container.github()` — async getter (note the `await`)
  - `this.container.jobs.enqueue(...)` — job system port
  - All wired through composition root, not locally instantiated ✓

### 6. Shared Base Repository ✓

**Rule: A shared base class under `_shared/` is code reuse within the same layer, not a cross-module violation.**

- **Base class design** (`_shared/base-repository.ts:10-27`)
  - Generic `<TRow>` type parameter — table-agnostic
  - Concrete table injected via constructor (line 12-13)
  - Methods `findScoped` and `listScoped` implement generic tenancy pattern
  - Touches no specific module's table ✓

- **Usage** (`repository.ts:7-14`)
  - `SyncOrchestratorRepository extends BaseRepository<SyncRunRow>`
  - Passes `t.syncRuns` table to base (line 9)
  - Calls `this.listScoped(workspaceId)` (line 13)
  - No layer violation; code reuse within persistence layer ✓

### 7. No Common Mistakes ✓

Checked and cleared:
- ✓ Service does not `new` external adapters
- ✓ Route contains no business logic (only delegation)
- ✓ Repository does not leak Drizzle rows to client
- ✓ No cross-module repository reach-in
- ✓ No `process.env` reads in feature code
- ✓ No adapter-to-adapter coupling
- ✓ Job enqueueing is proper (no direct `container.db` access)
- ✓ Domain core (if any) imports nothing from infra

### 8. No Harder-Case Violations ✓

Checked and cleared:
- ✓ **DTO leak:** Mapper is selective; no internal fields exposed
- ✓ **Decorative tenancy:** Both `recordRun` and `list` actively use `workspaceId`
- ✓ **Transitive tenancy gap:** Only queries `syncRuns` table directly; filters by `workspaceId`
- ✓ **Fake DI:** No locally-declared interface; all ports resolved through container
- ✓ **Infra error leaks:** No try-catch or error handling that might expose Postgres/Drizzle types
- ✓ **Legitimate complexity:** Multi-port orchestration (git, github, jobs) is correct, not a violation

---

## Code Quality Notes

### Recommended Improvement (Not a Violation)

**File:** `routes.ts:11-15`  
**Issue:** Request body validation is loose.

```typescript
app.post('/repos/:id/full-sync', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  const { owner, name } = req.body as { owner: string; name: string };  // ← Type assertion, no schema
  return service.runFullSync(workspaceId, req.params.id, owner, name);
});
```

**Recommendation:** Declare a Zod schema for `body` and validate:
```typescript
const SyncBodySchema = z.object({ owner: z.string(), name: z.string() });
app.post('/repos/:id/full-sync', { schema: { params: IdParams, body: SyncBodySchema } }, ...
```

**Status:** This is a **code-quality improvement**, not an onion-architecture violation. Tenancy is correctly guarded at the repository layer regardless of body validation.

---

## Conclusion

The `sync-orchestrator` module exemplifies correct onion-architecture practices:

1. ✓ All layers are properly separated and bounded
2. ✓ Dependencies flow inward only (routes → service → ports/repository)
3. ✓ Tenancy guards are enforced in actual SQL queries, not just signatures
4. ✓ All external integration is mediated through container ports
5. ✓ DTOs are correctly mapped; no raw persistence objects leak
6. ✓ Shared base repository is used appropriately for code reuse
7. ✓ No cross-layer or cross-module violations

**Verdict:** This module is production-ready from an onion-architecture compliance perspective.
