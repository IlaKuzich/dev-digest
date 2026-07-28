# Onion Architecture Review: cleanup Module

## Summary
**Status: VIOLATION FOUND** — 1 critical dependency-rule breach

The cleanup module contains a **high-confidence violation of the job handler rule**: the `registerCleanupJobHandler()` method reaches directly into `container.db` instead of delegating to the module's own repository, bypassing the persistence layer.

---

## Violations

### 1. Job Handler Bypasses Repository Layer (CRITICAL)

**File:** `service.ts`  
**Lines:** 18–25  
**Severity:** Critical — Direct violation of application-layer rule for job handlers

**Evidence:**

```typescript
// service.ts:18–25
registerCleanupJobHandler(): void {
  this.container.jobs.register(CLEANUP_JOB_KIND, async (payload) => {
    const { workspaceId } = payload as CleanupJobPayload;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.container.db                                    // ← VIOLATION HERE
      .delete(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), lt(t.agentRuns.createdAt, cutoff)));
  });
}
```

**Rule Violated:**

From SKILL.md line 68:
> "A **job handler registered by the service** (`this.container.jobs.register(KIND, handler)`) is still application-layer code — it must call the module's own `repository`/ports like any other service method, never reach into `container.db` on its own to shortcut the persistence layer."

Also from SKILL.md "Common mistakes" section (line 127–128):
> "**A job handler reaches into `container.db` directly** instead of calling the module's own `repository`. → Route it through `repository.ts` like every other read/write."

**Why This Matters:**

1. **Layering violation:** The job handler is executing persistence logic directly (DELETE query) instead of delegating to `CleanupRepository`, which exists precisely for this purpose (line 8–14 of `repository.ts`).

2. **Repository bypass:** The module already has `CleanupRepository.deleteOldRuns(workspaceId, before)` (repository.ts:8–14) that performs the exact same DELETE operation with proper tenancy scoping. The job handler should call this method instead of duplicating the query.

3. **Consistency:** All other persistence access in the service (e.g., `scheduleCleanup` at line 28–30) properly routes through the repository or container abstractions. The job handler should follow the same pattern.

**Corrected Version:**

The job handler should be rewritten to:

```typescript
registerCleanupJobHandler(): void {
  this.container.jobs.register(CLEANUP_JOB_KIND, async (payload) => {
    const { workspaceId } = payload as CleanupJobPayload;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.repo.deleteOldRuns(workspaceId, cutoff);  // ← Delegate to repository
  });
}
```

This follows the same contract already exposed by `CleanupRepository.deleteOldRuns(workspaceId: string, before: Date)`.

---

## Compliant Patterns Observed

- **routes.ts** correctly instantiates the service via the container and delegates to it.
- **repository.ts** is the exclusive place touching the `agentRuns` table, with proper tenancy scoping (`workspaceId` in the WHERE clause).
- **service.ts** constructor correctly instantiates the repository with `container.db` (line 15).
- **constants.ts** appropriately holds literals.

---

## Conclusion

The module contains one critical violation: the job handler reaches into `container.db` directly, bypassing the `CleanupRepository` layer. This breaks the dependency rule because job handlers are application-layer code and must route all persistence access through the repository, just like service methods do. The fix is straightforward: call `this.repo.deleteOldRuns(workspaceId, cutoff)` in the job handler closure.
