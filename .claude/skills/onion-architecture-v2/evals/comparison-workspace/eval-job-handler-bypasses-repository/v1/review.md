# Onion Architecture Review: `cleanup` Module

**Module Path:** `modules/cleanup/`  
**Review Date:** 2026-07-25  
**Reviewer:** Architecture Audit

## Summary

The `cleanup` module contains **1 violation** of the onion-architecture dependency rule: the job handler in `service.ts` bypasses the repository layer and directly accesses the database.

---

## Violations

### 1. Job Handler Directly Accesses Database (Bypass Repository Layer)

**File:** `service.ts`  
**Lines:** 22-24

**Violation:**
```ts
registerCleanupJobHandler(): void {
  this.container.jobs.register(CLEANUP_JOB_KIND, async (payload) => {
    const { workspaceId } = payload as CleanupJobPayload;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.container.db                                           // <- VIOLATION
      .delete(t.agentRuns)                                            // <- VIOLATION
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), lt(t.agentRuns.createdAt, cutoff))); // <- VIOLATION
  });
}
```

**Why This Violates the Rule:**

The onion-architecture skill states:

> "A `repository.ts` is the **ONLY** place that touches its table" (line 37)
> 
> "The dependency rule in one line: **routes → service → (ports + repository); adapters _implement_ ports; the container wires them.**" (line 31)

The service is directly executing a Drizzle query against `t.agentRuns` instead of delegating to its own repository instance (`this.repo`). This breaks the dependency rule because:

1. **Repository is bypassed:** The class has a fully-constructed `CleanupRepository` instance (`this.repo`, line 12) with a method `deleteOldRuns` (repository.ts:8-14) that encapsulates exactly this query.

2. **DB query logic is duplicated:** The same database operation now lives in two places:
   - **repository.ts:8-14** — `deleteOldRuns()` wraps the delete with Drizzle query
   - **service.ts:22-24** — The job handler duplicates the logic directly

3. **Breaks single responsibility:** The service layer is now touching the database directly, violating the "application layer" role defined in the skill (line 26): "Business logic, orchestration; receives `Container`" — orchestration, not persistence.

4. **Workspace-scoping is not enforced consistently:** While the direct query does include the workspace guard (`eq(t.agentRuns.workspaceId, workspaceId)`), having DB logic scattered across multiple files makes it impossible to audit all data access in one place.

**Expected Fix:**

Replace the direct Drizzle access with a call to the repository method:

```ts
registerCleanupJobHandler(): void {
  this.container.jobs.register(CLEANUP_JOB_KIND, async (payload) => {
    const { workspaceId } = payload as CleanupJobPayload;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.repo.deleteOldRuns(workspaceId, cutoff);  // <- Use repository
  });
}
```

This aligns the job handler with the `scheduleCleanup` orchestration method (line 28-30), which correctly delegates business logic to the service and persistence concerns to the repository.

---

## Compliant Areas

- **routes.ts:** Correctly parses HTTP requests and delegates to the service; only imports service, context, and Fastify (lines 1-8). ✓
- **service.ts (scheduleCleanup method):** Correctly orchestrates job enqueueing without touching DB directly (lines 28-30). ✓
- **repository.ts:** Correctly encapsulates the only DB table access with workspace scoping (lines 8-14). ✓
- **constants.ts:** Pure literals, no violations (lines 1-2). ✓

---

## Severity

**HIGH** — The job handler pattern directly violates the core onion-architecture principle that "A `repository.ts` is the ONLY place that touches its table." This opens the door to:
- Inconsistent workspace tenancy enforcement
- Duplicated DB logic that drifts during maintenance
- Difficulty auditing all data access paths
- Inability to use a mock repository in tests for the job handler path
