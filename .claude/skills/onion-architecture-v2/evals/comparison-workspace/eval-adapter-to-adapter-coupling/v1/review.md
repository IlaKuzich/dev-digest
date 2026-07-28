# Onion Architecture Review: Adapter-to-Adapter Coupling Test Case

**Review Date:** 2026-07-25  
**Fixture:** `02-adapter-to-adapter-coupling`  
**Scope:** Module at `modules/sync/` + Adapters at `adapters/github/` and `adapters/slack/`

## Summary
**VIOLATIONS FOUND: 1 critical violation**

The GitHub adapter (`adapters/github/status-adapter.ts`) directly imports and instantiates the Slack adapter, creating forbidden adapter-to-adapter coupling. This violates the core onion-architecture principle that adapters must be independent and only coupled through the composition root.

---

## Detailed Findings

### Module Layer Analysis (modules/sync/)

#### routes.ts
**Status:** COMPLIANT

- Line 9: Service instantiation in route is correct pattern
- Delegates business logic to service layer
- Receives context through proper channel (getContext helper)
- No business logic in route layer

#### service.ts
**Status:** COMPLIANT

- Properly receives `Container` for port resolution
- Line 8: Creates repository directly (correct for application layer)
- Line 14: Resolves `githubStatus` adapter through container (`this.container.githubStatus`)
- Does not instantiate adapters directly
- Proper orchestration between repository and container ports

#### repository.ts
**Status:** COMPLIANT

- Only layer touching database
- Line 2: Correctly imports `Db` type from `db/client`
- Lines 10-13: Uses Drizzle ORM for queries
- Line 14: Returns plain object, not Drizzle `$inferSelect` row (good DTO practice)
- Workspace-scoped queries with tenancy guard (workspaceId filtering)

#### constants.ts
**Status:** COMPLIANT

- Pure constant exports, no dependencies

---

### Adapter Layer Analysis

#### adapters/github/status-adapter.ts
**Status:** VIOLATES ONION ARCHITECTURE

**Violations:**

1. **Line 1: Forbidden cross-adapter import**
   ```ts
   import { SlackAdapter } from '../slack/slack-adapter.js';
   ```
   **Issue:** GitHub adapter imports Slack adapter directly. Adapters should never know about each other.

2. **Line 4: Adapter instantiation in adapter**
   ```ts
   private slack = new SlackAdapter();
   ```
   **Issue:** Constructor creates Slack adapter instance. Adapters must not instantiate other adapters; construction is the composition root's responsibility.

3. **Line 15: Cross-adapter method call**
   ```ts
   await this.slack.postMessage('#ci-alerts', `${owner}/${repo}@${sha} status: ${state}`);
   ```
   **Issue:** GitHub adapter calls Slack adapter method directly. This creates runtime coupling and makes the GitHub adapter impossible to test without a Slack adapter present.

**Why this violates the dependency rule:**
- Adapters implement ports (domain interfaces); they don't depend on other adapters
- The composition root (`platform/container.ts`) is the ONLY place where adapter-to-adapter wiring happens
- A GitHub adapter that needs Slack notifications should either:
  - Depend on a `SlackMessenger` port interface injected via constructor
  - Call a port on the container (e.g., `this.container.slackMessenger`)
  - Or return domain events that trigger side effects in the service layer

**Current broken layering:**
```
Service → GitHubStatus adapter → Slack adapter (WRONG)
                ↓
         Should be:
Service → GitHubStatus port (interface)
        ↓
     Container wires GitHubStatus impl + injects SlackMessenger port
```

#### adapters/slack/slack-adapter.ts
**Status:** COMPLIANT

- Self-contained implementation
- No cross-adapter imports
- No dependency violations
- Implements messaging contract correctly

---

## Compliance Score

| Layer | Status | Evidence |
|-------|--------|----------|
| Transport (routes) | ✓ PASS | routes.ts: proper delegation |
| Application (service) | ✓ PASS | service.ts: uses container for ports, not direct instantiation |
| Persistence (repository) | ✓ PASS | repository.ts: isolated DB layer, returns plain objects |
| Domain Core | ✓ PASS | No vendor code in contracts |
| Composition Root | ✗ FAIL | Adapters not composed in container; coupled directly |
| **Adapter Independence** | ✗ FAIL | GitHub adapter imports/instantiates Slack adapter |

---

## Remediation

To fix the adapter-to-adapter coupling:

### Option A: Inject SlackMessenger port (recommended)
Define a `SlackMessenger` port interface in domain core, then inject it:

```ts
// adapters/github/status-adapter.ts
export class OctokitStatusAdapter {
  constructor(
    private token: string,
    private slack: SlackMessenger  // Injected port, not adapter
  ) {}

  async setStatus(owner: string, repo: string, sha: string, state: string): Promise<void> {
    await fetch(...);
    if (state === 'failure') {
      await this.slack.postMessage('#ci-alerts', `${owner}/${repo}@${sha} status: ${state}`);
    }
  }
}
```

Then wire in container:
```ts
// platform/container.ts
get githubStatus(): GitHubStatusAdapter {
  this._githubStatus ??= new OctokitStatusAdapter(
    this.config.githubToken,
    this.slackMessenger  // Inject the port, not the adapter
  );
  return this._githubStatus;
}
```

### Option B: Call port through container
Pass container to adapter and resolve Slack through it (less clean but acceptable):

```ts
export class OctokitStatusAdapter {
  constructor(private token: string, private container: Container) {}

  async setStatus(owner: string, repo: string, sha: string, state: string): Promise<void> {
    await fetch(...);
    if (state === 'failure') {
      await this.container.slack.postMessage('#ci-alerts', `${owner}/${repo}@${sha} status: ${state}`);
    }
  }
}
```

### Option C: Move side effect to service
Keep adapters focused on their primary responsibility:

```ts
// service.ts
async syncStatus(workspaceId: string, prId: string, state: string): Promise<void> {
  const pr = await this.repo.getPrRef(workspaceId, prId);
  if (!pr) return;
  await this.container.githubStatus.setStatus(pr.owner, pr.repo, pr.sha, state);
  
  if (state === 'failure') {
    await this.container.slack.postMessage('#ci-alerts', `...`);
  }
  
  await this.repo.markSynced(workspaceId, prId);
}
```

---

## References

**Onion Architecture Skill (onion-architecture):**
- Layer map: adapters implement ports; nothing else couples to adapters
- Composition root: "Wires concrete adapters → port interfaces; the only place where concrete adapters meet"
- Common mistakes: "Cross-module reach-in (importing another module's code)" extends to cross-adapter coupling

**Dependency Rule (non-negotiable):**
> Adapters implement ports; the container wires them. Nothing flows the other way.

The fixture demonstrates exactly why this rule exists: without it, testing becomes impossible, swapping implementations becomes hard, and the system loses the flexibility that ports-and-adapters architecture provides.
