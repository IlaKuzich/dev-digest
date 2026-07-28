# Onion Architecture Review: Invites Module
**Fixture**: `06-error-leak-via-exception/modules/invites/`

## Summary
**VIOLATION FOUND**: Infrastructure-specific error type (PostgreSQL constraint code) leaks through an unhandled exception from the persistence layer into the routes layer, violating the dependency rule.

---

## Violations

### 1. Infrastructure Error Type Leaking Through Exception (Critical)
**Location**: `routes.ts:16`  
**Severity**: Critical dependency-rule violation

```typescript
// routes.ts, line 14-20
try {
  await service.invite(workspaceId, email);
} catch (err: any) {
  if (err.code === '23505') {  // ← VIOLATION: Postgres error code
    reply.status(409);
    return { error: 'already_invited' };
  }
  throw err;
}
```

**Evidence of the leak chain**:
- **repository.ts:9** — `await this.db.insert(t.invites).values(...)` throws a Drizzle ORM exception when the unique constraint on email/workspace is violated
- **service.ts:12** — `await this.repo.create(workspaceId, email)` does NOT catch or translate this error; it propagates unhandled
- **routes.ts:16** — The route handler inspects `err.code === '23505'`, which is PostgreSQL's standard error code for unique constraint violation

**Why this violates the rule**:
Per the SKILL.md "Harder cases" section:
> Translate the error into a domain error (or a typed result) inside `repository.ts` or `service.ts`, before it ever reaches `routes.ts`.

The route layer should never know about PostgreSQL error codes, Drizzle exception shapes, or any vendor-specific error structure. The route is reaching down through two layers of abstraction and making domain decisions (`409 Conflict`) based on database infrastructure details.

**Correct approach**:
The `repository.ts` should catch the Drizzle exception and either:
1. Translate it into a domain error (e.g., a custom `DuplicateInviteError` or similar) that `service.ts` returns, or
2. Return a typed Result that distinguishes between success and constraint-violation failure

Then `service.ts` or `routes.ts` can handle the domain-level error without inspecting `err.code`.

---

## Compliance Assessment

| Layer | Aspect | Status | Notes |
|-------|--------|--------|-------|
| **Persistence** | Tenancy guard | ✅ PASS | `repository.ts:13` correctly includes `workspaceId` in the WHERE clause: `eq(t.invites.workspaceId, workspaceId)` |
| **Persistence** | No Drizzle rows to client | ✅ PASS | Routes return domain-level responses (`{ ok: true }`, `{ error: 'already_invited' }`), not Drizzle rows |
| **Application** | Service receives Container | ✅ PASS | `service.ts:7` correctly takes `Container` in constructor |
| **Application** | Error translation | ❌ FAIL | Service does not translate persistence errors; they propagate unhandled |
| **Transport** | Delegation only | ⚠️ PARTIAL | Routes delegate to service for business logic, but they also inspect infrastructure error codes instead of domain errors |
| **Transport** | No business logic | ✅ PASS | Routes only parse request, delegate to service, and map status codes |

---

## What Should Be Fixed

### Option A: Translate at Repository Level
```typescript
// repository.ts
async create(workspaceId: string, email: string): Promise<void> {
  try {
    await this.db.insert(t.invites).values({ workspaceId, email, status: 'pending' });
  } catch (err) {
    // Check Drizzle/Postgres error code only here, never in routes
    if (err instanceof Error && 'code' in err && err.code === '23505') {
      throw new DuplicateInviteError(`Invite already exists for ${email}`);
    }
    throw err; // re-throw if not a constraint violation
  }
}
```

Then update routes to catch `DuplicateInviteError`:
```typescript
// routes.ts
try {
  await service.invite(workspaceId, email);
} catch (err: any) {
  if (err instanceof DuplicateInviteError) {
    reply.status(409);
    return { error: 'already_invited' };
  }
  throw err;
}
```

### Option B: Use Result Type
Alternatively, return a typed result instead of throwing:
```typescript
// repository.ts
async create(workspaceId: string, email: string): Promise<{ success: boolean; reason?: string }> {
  try {
    await this.db.insert(t.invites).values({ workspaceId, email, status: 'pending' });
    return { success: true };
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === '23505') {
      return { success: false, reason: 'duplicate' };
    }
    throw err;
  }
}

// routes.ts
const result = await service.invite(workspaceId, email);
if (!result.success && result.reason === 'duplicate') {
  reply.status(409);
  return { error: 'already_invited' };
}
```

---

## Files Analyzed
- `routes.ts` — Violation found here (error inspection)
- `service.ts` — Compliant; does not inspect errors
- `repository.ts` — Compliant as written; does not explicitly catch errors (but should)
- `constants.ts` — Compliant; no violations

---

## Conclusion
The module is **NOT compliant** with the onion-architecture dependency rule due to infrastructure error codes leaking through exceptions into the transport layer. The fix is straightforward: translate infrastructure errors into domain errors inside the repository or service layer before they propagate to the routes.
