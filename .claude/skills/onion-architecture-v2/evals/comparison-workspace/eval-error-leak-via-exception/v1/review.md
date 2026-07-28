# Onion Architecture Review: invites module

**Fixture**: `06-error-leak-via-exception/modules/invites/`  
**Review date**: 2026-07-25  
**Reviewer**: Claude Code  

## Summary

**Status**: VIOLATIONS FOUND

The module violates the onion dependency rule by allowing infrastructure-specific error details (Postgres error codes) to leak through unhandled exceptions into the transport layer. The route handler directly inspects database error codes, coupling it to the persistence implementation.

---

## Violations

### 1. Postgres Error Code Leak to Routes Layer

**File**: `routes.ts:16`  
**Severity**: High  
**Category**: Exception-based dependency violation (infrastructure leak via exception path)

**Evidence**:
```typescript
// routes.ts, lines 15–20
try {
  await service.invite(workspaceId, email);
} catch (err: any) {
  if (err.code === '23505') {  // ← Postgres-specific error code
    reply.status(409);
    return { error: 'already_invited' };
  }
  throw err;
}
```

**Problem**:
- The route layer is checking for Postgres error code `23505` (unique constraint violation)
- This couples the transport layer to the persistence layer's implementation detail
- The error bubbles unhandled from the repository through the service to the route
- The route must know about Postgres error codes to handle the business case (duplicate invite)
- This is infrastructure leaking through the exception path, not just through imports

**Onion Rule Violated**:
Per the skill: *"dependencies point inward only"* and *"infrastructure-specific concerns"* must stay in adapters/repository layers. Routes should not check for database error codes.

**Why it matters**:
- If Postgres is swapped for another database, the route breaks
- The route handler should not need to know internal DB schemas or error codes
- This violates the port-and-adapter pattern where domain errors are wrapped at the adapter boundary

---

## No Direct Import Violations

**routes.ts**: Correctly imports only `fastify`, `ZodTypeProvider`, `getContext`, and `InviteService`. ✓

**service.ts**: Correctly imports only `Container` type and `InviteRepository`. ✓  
(Creates instance via `new InviteRepository(container.db)`, which is acceptable pattern per skill examples.)

**repository.ts**: Correctly imports only `drizzle-orm`, `Db` type, and database schema. ✓

**constants.ts**: No dependencies (pure literals). ✓

---

## Recommended Fixes

### Option A: Wrap exception at repository boundary

Move error handling into the repository layer, throw a domain-specific error:

```typescript
// repository.ts
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class InviteRepository {
  constructor(private db: Db) {}

  async create(workspaceId: string, email: string): Promise<void> {
    try {
      await this.db.insert(t.invites).values({ workspaceId, email, status: 'pending' });
    } catch (err: any) {
      if (err.code === '23505') {
        throw new Error('INVITE_DUPLICATE_EMAIL'); // Domain error
      }
      throw err;
    }
  }

  async list(workspaceId: string) {
    return this.db.select().from(t.invites).where(eq(t.invites.workspaceId, workspaceId));
  }
}
```

Then in **routes.ts**:
```typescript
try {
  await service.invite(workspaceId, email);
} catch (err: any) {
  if (err.message === 'INVITE_DUPLICATE_EMAIL') {
    reply.status(409);
    return { error: 'already_invited' };
  }
  throw err;
}
```

### Option B: Wrap exception at service boundary

Let the service handle the translation:

```typescript
// service.ts
async invite(workspaceId: string, email: string): Promise<void> {
  try {
    await this.repo.create(workspaceId, email);
  } catch (err: any) {
    if (err.code === '23505') {
      throw new Error('INVITE_DUPLICATE_EMAIL'); // Domain error
    }
    throw err;
  }
}
```

Then routes.ts catches the domain error instead of the DB error.

---

## Root Cause Analysis

1. **Service does not wrap exceptions**: The `InviteService` passes through any exception from `this.repo.create()` without translation.
2. **Repository does not translate errors**: The `InviteRepository` lets Postgres errors bubble up raw.
3. **Route assumes infrastructure detail**: The route handler catches a specific Postgres error code instead of a domain error.

This is a classic anti-pattern: pushing error translation *outward* (to the route) instead of *inward* (to the adapter).

---

## Compliance Checklist

| Aspect | Status | Notes |
|--------|--------|-------|
| Import boundaries | ✓ PASS | No import violations; routes, service, and repository are correctly layered. |
| Exception handling | ✗ FAIL | Postgres error codes leak to routes via unhandled exceptions. |
| Repository layering | ✓ PASS | Repository correctly owns database operations. |
| Service orchestration | ✓ PASS | Service correctly orchestrates repository calls. |
| Route delegation | ✗ FAIL | Route inspects infrastructure error codes; should inspect domain errors only. |
| Tenancy guard | N/A | Not relevant to this review (no query-specific tenancy shown). |
| DTO mapping | ✓ PASS | Repository returns raw rows; no DTO shown in list(), but no leak either. |

---

## Conclusion

The module has **one high-severity violation**: infrastructure-specific Postgres error codes leak into the route layer via unhandled exceptions. This violates the dependency rule by coupling the transport layer to database implementation details. The fix is to wrap/translate the exception at the repository or service boundary, not the route boundary, so routes only handle domain errors.
