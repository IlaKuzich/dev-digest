# Onion Architecture Review: sync-orchestrator Module

**Module Path**: `modules/sync-orchestrator/` (reviewed as if at `server/src/modules/sync-orchestrator/`)

**Base Class**: `_shared/base-repository.ts` ✓ (compliant)

---

## Summary

The module has **2 violations** of the onion architecture dependency rule and routing schema requirements.

---

## Violations Found

### Violation 1: Service Directly Instantiates Repository Adapter

**File**: `service.ts`  
**Line**: 11  
**Severity**: Architecture violation (dependency rule breach)

```typescript
export class SyncOrchestratorService {
  private repo: SyncOrchestratorRepository;

  constructor(private container: Container) {
    this.repo = new SyncOrchestratorRepository(container.db);  // ❌ Line 11
  }
```

**Issue**: The service directly instantiates `SyncOrchestratorRepository` instead of resolving it from the container. The skill explicitly states:

> "Service `new`s an adapter" → Resolve it off the container; the container owns construction + secrets.

The repository is listed in the skill as a secondary adapter (persistence/infra layer), and the dependency rule requires that the container owns all adapter construction. The service should receive the repository from the container, not create it directly.

**Expected Pattern**:
```typescript
constructor(private container: Container) {
  this.repo = this.container.syncOrchestratorRepo; // or similar container getter
}
```

---

### Violation 2: Missing Zod Schema for Request Body

**File**: `routes.ts`  
**Lines**: 11–14  
**Severity**: Transport layer breach (runtime safety)

```typescript
app.post('/repos/:id/full-sync', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  const { owner, name } = req.body as { owner: string; name: string };  // ❌ No schema
  return service.runFullSync(workspaceId, req.params.id, owner, name);
});
```

**Issue**: The POST body is cast with a type assertion (`as { owner: string; name: string }`) instead of being declared with a Zod schema in the route definition. The skill requires:

> routes declare Zod `params`/`body` schemas — no hand-rolled `Schema.parse(req.body)`

The route defines a schema for `params` (IdParams) but omits the body schema entirely, leaving the request unparsed and unvalidated at the Fastify layer.

**Expected Pattern**:
```typescript
const SyncRunBody = z.object({ owner: z.string(), name: z.string() });

app.post(
  '/repos/:id/full-sync',
  { schema: { params: IdParams, body: SyncRunBody } },
  async (req) => {
    // req.body is now typed and validated
    return service.runFullSync(workspaceId, req.params.id, req.body.owner, req.body.name);
  }
);
```

---

## Compliant Elements

### Repository Layer ✓
- `repository.ts` correctly extends `BaseRepository<SyncRunRow>`
- Only touches the `syncRuns` table (single responsibility)
- All queries are workspace-scoped via `findScoped` and `listScoped`
- Returns raw Drizzle rows; DTOs are mapped in helpers

### Helpers ✓
- `helpers.ts` contains pure transforms (`toSyncRunDto`)
- Maps repository rows to contract DTOs (Drizzle rows do not leak to routes)
- No I/O or business logic

### Constants ✓
- `constants.ts` contains only job-kind literals
- Appropriate isolation from code logic

### Base Class ✓
- `base-repository.ts` is properly layered (persistence only)
- Imports only from `db/client.js` (no domain/service imports)
- Generic design allows subclasses to inject their table without coupling the base
- Workspace-scoped guard is enforced at the base level

### Service Business Logic (Partial) ✓
- `service.ts` correctly receives the `Container`
- Calls ports via the container (`this.container.git`, `this.container.github()`, `this.container.jobs.enqueue`)
- Maps repository rows to DTOs before returning to routes
- Business logic (orchestration) is correctly placed in the service

---

## Recommendation

**Fix both violations before merging**:

1. Extract repository instantiation to the container. Add a lazy getter in `platform/container.ts` or inject the repository directly into the service.
2. Add a Zod schema for the POST body and pass it in the route's schema option.

These are straightforward fixes that restore full dependency-rule compliance and runtime safety.
