# Onion Architecture Review: Adapter-to-Adapter Coupling

**Fixture**: `02-adapter-to-adapter-coupling`  
**Modules Reviewed**: `modules/sync/` (routes, service, repository, constants)  
**Adapters Reviewed**: `adapters/github/status-adapter.ts`, `adapters/slack/slack-adapter.ts`  
**Review Date**: 2026-07-25

---

## Summary

**Status**: CRITICAL VIOLATION FOUND

This fixture exhibits a textbook adapter-to-adapter coupling violation. The GitHub status adapter directly imports and instantiates the Slack adapter, breaking the fundamental onion architecture principle that **each adapter implements exactly one port** and **coordination between capabilities belongs in `service.ts`**.

---

## Violations Found

### 1. Adapter-to-Adapter Direct Coupling (CRITICAL)

**Violation Type**: Adapter calls a sibling adapter directly  
**Rule Violated**: SKILL.md, section "Adding an external integration (a new port + adapter)", subsection 2, and "Common mistakes" section.

**Files and Evidence**:

- **`adapters/github/status-adapter.ts`, line 1**: Direct import of sibling adapter
  ```typescript
  import { SlackAdapter } from '../slack/slack-adapter.js';
  ```

- **`adapters/github/status-adapter.ts`, line 4**: Direct instantiation of sibling adapter
  ```typescript
  private slack = new SlackAdapter();
  ```

- **`adapters/github/status-adapter.ts`, lines 14-16**: Sibling adapter called inside primary adapter method
  ```typescript
  if (state === 'failure') {
    await this.slack.postMessage('#ci-alerts', `${owner}/${repo}@${sha} status: ${state}`);
  }
  ```

**Why This Violates the Rule**:

The SKILL.md explicitly states:

> "An adapter may call vendor SDKs and do its own I/O, but it **must not import and call a *different* port's adapter directly** (e.g. a GitHub adapter reaching into the Slack adapter to post a message) — each adapter implements exactly one port, and any coordination between two capabilities belongs in `service.ts`, which already has both ports available off the container."

This is also listed as a "Common mistake":

> "**Adapter calls a sibling adapter directly** instead of the service coordinating both ports. → Move the coordination up to `service.ts`."

**What Should Happen Instead**:

1. `OctokitStatusAdapter` should only implement the GitHub port (`GitHubClient`). It should accept no dependencies except those required for its single concern (GitHub status updates).

2. The coordination logic (GitHub status update → Slack notification on failure) should live in `SyncService.syncStatus()`:
   ```typescript
   async syncStatus(workspaceId: string, prId: string, state: string): Promise<void> {
     const pr = await this.repo.getPrRef(workspaceId, prId);
     if (!pr) return;
     
     // Call GitHub port
     await this.container.githubStatus.setStatus(pr.owner, pr.repo, pr.sha, state);
     
     // Call Slack port (if state is 'failure')
     if (state === 'failure') {
       await this.container.slack.postMessage('#ci-alerts', `${pr.owner}/${pr.repo}@${pr.sha} status: ${state}`);
     }
     
     await this.repo.markSynced(workspaceId, prId);
   }
   ```

3. `SlackAdapter` should be injected or resolved from the container, never instantiated or called directly from within another adapter.

**Impact**:

- **Testability**: Cannot test `OctokitStatusAdapter` without also pulling in `SlackAdapter`. Cannot mock `SlackAdapter` independently.
- **Dependency Injection**: No DI for the Slack adapter. Hard-coded `new SlackAdapter()` defeats the purpose of the container.
- **Replaceability**: Cannot swap Slack for Discord, Teams, or any other notification system without modifying the GitHub adapter.
- **Separation of Concerns**: The GitHub adapter's sole responsibility (GitHub status updates) is muddied by notification logic.
- **Container Authority**: The composition root (`platform/container.ts`) loses authority over wiring decisions. A deployment policy to change notification channels cannot be applied without editing the adapter class.

---

## Files Reviewed

### Module Files (Compliant)

#### `modules/sync/routes.ts`
- ✓ Routes layer correctly creates service with container
- ✓ Delegates business logic to service
- ✓ No business logic in route handler

#### `modules/sync/service.ts`
- ✓ Service correctly receives `Container`
- ✓ Service instantiates repository correctly (`new SyncRepository(container.db)`)
- ✓ Service calls port off container (`this.container.githubStatus.setStatus(...)`)
- ✓ Calls own repository for persistence
- Note: This file is actually correct in structure; it's the adapter it depends on that's broken.

#### `modules/sync/repository.ts`
- ✓ Only touches database (Drizzle queries)
- ✓ Queries properly scoped by workspace (tenancy guard via `and(eq(...workspaceId...), ...)`)
- ✓ Returns plain row objects, not domain objects

#### `modules/sync/constants.ts`
- ✓ Pure literal constants, no violations possible

### Adapter Files (VIOLATIONS FOUND)

#### `adapters/github/status-adapter.ts`
- **VIOLATION**: Imports sibling `SlackAdapter` (line 1)
- **VIOLATION**: Instantiates sibling `SlackAdapter` directly (line 4)
- **VIOLATION**: Calls sibling adapter's method in its own business logic (lines 14-16)
- **Violation Type**: Adapter-to-adapter coupling; breaks the single-port-per-adapter rule

#### `adapters/slack/slack-adapter.ts`
- ✓ Clean single-port implementation (Slack notifications)
- ✓ No outbound dependencies to other adapters
- ✓ Should only be called from `service.ts` or the container; it is not correctly used here

---

## Compliance Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Domain core imports nothing from `server/src` | N/A | No domain core in this fixture |
| `service.ts` depends on port interfaces, not concrete adapters | ⚠ PARTIAL | Service correctly calls `this.container.githubStatus`, but the adapter it depends on is malformed. The service is calling the wrong method due to adapter-to-adapter coupling. |
| Only `repository.ts` touches DB | ✓ PASS | Repository correctly isolated |
| Drizzle rows stay inside repository/service | ✓ PASS | Repository returns plain objects; service doesn't leak them |
| Tenancy-scoped queries include tenancy in WHERE clause | ✓ PASS | Both repository methods include `eq(t.pullRequests.workspaceId, workspaceId)` |
| Adapters implement exactly one port | **✗ FAIL** | GitHub adapter tries to implement both GitHub AND Slack capabilities |
| Adapters do NOT call sibling adapters | **✗ FAIL** | GitHub adapter directly calls Slack adapter |
| Coordination between ports lives in `service.ts` | **✗ FAIL** | Coordination is in the GitHub adapter instead |
| Each adapter can be tested independently | **✗ FAIL** | GitHub adapter drags in Slack adapter; cannot mock independently |
| Container is the authority for wiring | **✗ FAIL** | Adapter instantiates its own dependency; container has no say |

---

## Conclusion

This fixture contains **one critical violation**: adapter-to-adapter coupling. The GitHub status adapter violates the onion architecture principle by importing and directly calling the Slack adapter. This is explicitly called out in the SKILL.md as a "Common mistake" and as a violation of the fundamental rule that "each adapter implements exactly one port."

**Resolution**: Move the conditional Slack notification logic from `OctokitStatusAdapter.setStatus()` to `SyncService.syncStatus()`, where both ports are available and coordination properly belongs. Remove the `SlackAdapter` import and instantiation from the GitHub adapter.

---

## Relevant SKILL.md Citations

> "An adapter may call vendor SDKs and do its own I/O, but it must not import and call a different port's adapter directly (e.g. a GitHub adapter reaching into the Slack adapter to post a message) — each adapter implements exactly one port, and any coordination between two capabilities belongs in `service.ts`, which already has both ports available off the container." (Line 78-82)

> "**Adapter calls a sibling adapter directly** instead of the service coordinating both ports. → Move the coordination up to `service.ts`." (Line 124-125)

---
