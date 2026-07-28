# Onion Architecture Review: `modules/flags/`

**Module:** `/fixtures/04-transitive-tenancy-leak/modules/flags/`

**Review Date:** 2026-07-25

**Overall Compliance:** ❌ VIOLATIONS FOUND

---

## Summary

The flags module violates the tenancy-guard dependency rule. While the service and routes layers correctly accept and propagate the `workspaceId` parameter, the repository layer accepts `workspaceId` in its method signatures but **never uses it in the actual query WHERE/and(...) clauses**. This is the "decorative tenancy parameter" pattern identified in the skill's "Harder cases" section.

---

## Violations

### 1. Decorative tenancy parameter in `getForPr` — repository.ts:10-13

**File:** `repository.ts`

**Lines:** 10-13

**Violation Type:** Decorative tenancy parameter / Missing workspace-scope filter

**Evidence:**

```typescript
async getForPr(workspaceId: string, prId: string): Promise<FlagRow | undefined> {
  const [row] = await this.db.select().from(t.prFlags).where(eq(t.prFlags.prId, prId));
  return row;
}
```

**Problem:**

- The method signature accepts `workspaceId` as a parameter (line 10)
- The query on line 11 filters **only** by `prId`: `where(eq(t.prFlags.prId, prId))`
- `workspaceId` is never referenced in the WHERE clause
- This means the query returns a flag row for **any workspace's PR**, not just the requesting workspace's PR
- This is a tenancy violation: `workspaceId` appears in the method signature but is not enforced in the query

**Skill Reference:**

From onion-architecture-v2 SKILL.md, "Harder cases" section:

> **Decorative tenancy parameter.** A repository method accepts `workspaceId` (so its signature "looks" scoped) but never uses it in the `WHERE`/`and(...)` clause — the parameter is dead weight and the query is unscoped. Read the query body, not just the method signature.

And from the dependency rule section:

> **A tenancy-scoped signature is not the same as a tenancy-scoped query.** `workspaceId` must appear in the actual `WHERE`/`and(...)` clause, not just in the method's parameter list.

---

### 2. Decorative tenancy parameter in `set` — repository.ts:15-20

**File:** `repository.ts`

**Lines:** 15-20

**Violation Type:** Decorative tenancy parameter / Missing workspace-scope filter

**Evidence:**

```typescript
async set(workspaceId: string, prId: string, key: string, value: boolean): Promise<void> {
  await this.db
    .insert(t.prFlags)
    .values({ prId, key, value })
    .onConflictDoUpdate({ target: [t.prFlags.prId, t.prFlags.key], set: { value } });
}
```

**Problem:**

- The method signature accepts `workspaceId` as a parameter (line 15)
- The insert operation on lines 16-19 does not reference `workspaceId` in:
  - The inserted values: `{ prId, key, value }` (line 18) — `workspaceId` is missing
  - The conflict resolution: only targets `[t.prFlags.prId, t.prFlags.key]` (line 19) — no workspace scoping
- `workspaceId` is never used anywhere in the query
- This means flag records can be inserted/updated for **any workspace's PR**, not just the requesting workspace's PR
- This is a tenancy violation: `workspaceId` is a dead parameter

**Skill Reference:**

Same as violation #1 — this is another instance of the "decorative tenancy parameter" pattern.

---

## Impact

Both violations allow **cross-workspace data access**:

1. **getForPr:** Any user from any workspace could theoretically query for a PR flag row by only knowing the PR ID, circumventing the workspace isolation boundary.
2. **set:** Any user could insert or modify flag records for any workspace's PR without workspace verification.

These are **IDOR (Insecure Direct Object Reference)** class vulnerabilities at the persistence layer.

---

## Recommended Fix

Both methods should enforce workspace scoping in the query:

### For `getForPr`:

The query should join the `prFlags` table to the `pulls` table (or equivalent parent entity) to ensure the PR belongs to the requested workspace:

```typescript
async getForPr(workspaceId: string, prId: string): Promise<FlagRow | undefined> {
  const [row] = await this.db
    .select()
    .from(t.prFlags)
    .innerJoin(t.pulls, eq(t.prFlags.prId, t.pulls.id))
    .where(and(
      eq(t.prFlags.prId, prId),
      eq(t.pulls.workspaceId, workspaceId)  // ← Add workspace filter
    ));
  return row;
}
```

### For `set`:

Include `workspaceId` in the insert and ensure the PR belongs to the workspace:

```typescript
async set(workspaceId: string, prId: string, key: string, value: boolean): Promise<void> {
  // Verify PR belongs to workspace first
  const pull = await this.db.select().from(t.pulls)
    .where(and(eq(t.pulls.id, prId), eq(t.pulls.workspaceId, workspaceId)))
    .limit(1);
  
  if (!pull.length) {
    throw new Error('PR not found or does not belong to workspace');
  }

  await this.db
    .insert(t.prFlags)
    .values({ prId, key, value, workspaceId })  // ← Include workspace
    .onConflictDoUpdate({ 
      target: [t.prFlags.prId, t.prFlags.key], 
      set: { value } 
    });
}
```

---

## Compliance Checklist

- ❌ **Routes layer:** ✓ Correctly extracts and passes `workspaceId`
- ❌ **Service layer:** ✓ Correctly receives and forwards `workspaceId`
- ❌ **Repository layer:** ✗ Accepts `workspaceId` but never uses it in queries (VIOLATION)
- ❌ **DTO mapping:** N/A (repository returns raw rows, no mapping layer present)
- ❌ **Container / DI:** ✓ Service correctly instantiates repository with container.db
- ❌ **Cross-module reach-in:** ✓ No violations detected
- ❌ **Adapter instantiation:** ✓ No direct adapter instantiation in service

---

## Conclusion

The module has **2 critical violations** of the onion architecture dependency rule, both rooted in the repository layer's failure to enforce workspace scoping in its queries. The `workspaceId` parameter is present but decorative — it does not guard the actual database operations.

This is a textbook "decorative tenancy parameter" violation as described in the skill guide. Fixing it requires adding workspace filters to both repository methods.
