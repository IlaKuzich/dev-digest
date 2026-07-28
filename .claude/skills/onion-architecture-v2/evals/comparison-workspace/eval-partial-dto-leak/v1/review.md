# Onion Architecture Review: `members` Module

**Fixture**: `evals/fixtures/03-partial-dto-leak/modules/members/`  
**Date**: 2026-07-25  
**Reviewer**: Claude Haiku 4.5

---

## Executive Summary

**Verdict**: VIOLATION FOUND

The `members` module has one critical DTO mapping violation: the `toMemberDto` mapper leaks sensitive fields (`passwordHash` and `inviteToken`) into the response DTO that should never be exposed to clients. While a mapper function exists, it fails to provide proper field filtering—a partial DTO leak.

---

## Violations

### Violation 1: Sensitive Fields Leaked via DTO Mapper

**Severity**: High (data exposure)  
**Category**: DTO boundary violation  
**Evidence**:

- **File**: `helpers.ts`
- **Lines**: 3–11
- **Code**:
  ```typescript
  export function toMemberDto(row: MemberRow) {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      passwordHash: row.passwordHash,    // ← LEAKED
      inviteToken: row.inviteToken,      // ← LEAKED
    };
  }
  ```

**Problem**:
The `toMemberDto` mapper forwards `passwordHash` and `inviteToken` from the database row directly into the returned DTO. These are sensitive, internal fields:
- `passwordHash` should never be exposed outside the authentication layer.
- `inviteToken` is an internal state field used for invite workflows and should not be revealed to clients.

**Impact**:
When `service.ts` (line 14) calls `rows.map(toMemberDto)`, it returns an array of DTOs containing these secrets. The HTTP response in `routes.ts` (line 12) then sends this data to the client, violating the principle that DTOs should expose only what is safe and necessary for the client to know.

**Onion Architecture Principle Violated**:
Per the skill guidance: *"Drizzle rows (`$inferSelect`) stay inside the repository/service; routes return DTOs from contracts (map via a `toXDto` helper)."*

The mapper exists and is used correctly in the layering, but **fails in its core responsibility**: it does not filter the row to expose only safe, public fields. The presence of a mapper is not sufficient evidence of compliance.

**Recommendation**:
Rewrite `toMemberDto` to expose only safe, client-facing fields:
```typescript
export function toMemberDto(row: MemberRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    // passwordHash and inviteToken must NOT be included
  };
}
```

---

## Compliant Aspects

- ✓ **Repository layer**: Correctly returns raw `MemberRow[]` and stays in persistence layer.
- ✓ **Service layer**: Correctly receives rows from the repository and maps them via `toMemberDto` before returning.
- ✓ **Routes layer**: Correctly delegates to service and returns the result.
- ✓ **Dependency direction**: All imports point inward (routes → service → repository); no outward dependencies detected.
- ✓ **Container wiring**: Service correctly instantiates its repository via `container.db`.

---

## Summary

The module's architecture is sound in structure and dependency flow, but the DTO mapper introduces a data-exposure vulnerability by forwarding sensitive fields that should be filtered out before the response leaves the application layer.
