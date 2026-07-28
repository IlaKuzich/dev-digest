# Onion Architecture Review: members Module

## Summary

The `members` module contains **1 critical violation** of the onion-architecture dependency rule: a DTO mapper that leaks sensitive internal fields to the client, despite the presence of a mapping layer that appears compliant on the surface.

---

## Violations

### VIOLATION 1: Partial DTO leak — sensitive fields exposed via mapper
**File:** `helpers.ts:3-11`

**Evidence:**
```ts
export function toMemberDto(row: MemberRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    passwordHash: row.passwordHash,
    inviteToken: row.inviteToken,
  };
}
```

**Issue:** The `toMemberDto` mapper forwards sensitive internal fields (`passwordHash` and `inviteToken`) from the database row into the returned DTO. These are security-critical fields that should never be exposed to clients, yet the mapper includes them without filtering.

This is a classic "partial DTO leak" — a harder-to-detect violation because a mapper *exists* (the module looks compliant on the surface), but the mapper's actual implementation still breaks the dependency rule by leaking persistence-layer details that belong only inside the repository.

Per the skill's "Harder cases" section:
> *"A `toXDto`-style mapper exists (so the module looks compliant), but it forwards an internal-only field from the row — a password/token hash, an internal note, a full nested relation the client never asked for. The presence of a mapper is not sufficient evidence of compliance; read what the mapper actually returns, field by field, against what the contract DTO is supposed to expose."*

**Impact:** Any route calling `service.list(workspaceId)` will expose password hashes and invite tokens to the HTTP client, creating a serious information disclosure vulnerability. The transport layer (routes.ts) will inadvertently serialize these sensitive fields into the JSON response.

**Should be:**
The mapper should only include publicly-safe fields:
```ts
export function toMemberDto(row: MemberRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    // passwordHash and inviteToken are NOT included
  };
}
```

**Layer:** Transport/Domain boundary (infra details leaking to the HTTP contract)

---

## Summary Table

| Line | Violation | Severity | Corrective Layer |
|------|-----------|----------|------------------|
| helpers.ts:8-9 | DTO mapper leaks `passwordHash` and `inviteToken` | Critical | Filter sensitive fields; expose only `id`, `email`, `role` |

---

## Reference
- Skill: `/onion-architecture-v2` — Harder Cases: Partial DTO Leak
- Canonical pattern: Map row → contract DTO inside `helpers.ts`; never forward internal-only fields
- The presence of a mapper is necessary but not sufficient for compliance — the mapper's actual output must match the public contract
