# Onion Architecture Review: `modules/flags/`

## Summary

**VIOLATIONS FOUND: 2 Critical Tenancy Leaks**

The `flags` module accepts `workspaceId` parameters through all layers (routes → service → repository) but **never actually uses them inside the database queries**. This is a transitive tenancy leak: the parameter flows through the call chain but is silently dropped at the repository boundary, leaving queries unscoped to the workspace.

---

## Violations

### Violation 1: `getForPr` lacks workspace scoping

**File:** `repository.ts`, lines 10–13

```typescript
async getForPr(workspaceId: string, prId: string): Promise<FlagRow | undefined> {
  const [row] = await this.db.select().from(t.prFlags).where(eq(t.prFlags.prId, prId));
  return row;
}
```

**Problem:**
- The method signature accepts `workspaceId` as a parameter (line 10).
- The SQL query on line 11 **only filters by `prId`**: `where(eq(t.prFlags.prId, prId))`.
- The `workspaceId` parameter is **never referenced** inside the query.

**Implication:**  
A user in workspaceA can query for flags of any PR by simply knowing its ID, regardless of which workspace owns it. Tenancy is not enforced.

**Required fix:**  
The query must join on or filter by the workspace. For example:
```typescript
where(and(eq(t.prFlags.prId, prId), eq(t.prFlags.workspaceId, workspaceId)))
```

---

### Violation 2: `set` lacks workspace scoping

**File:** `repository.ts`, lines 15–20

```typescript
async set(workspaceId: string, prId: string, key: string, value: boolean): Promise<void> {
  await this.db
    .insert(t.prFlags)
    .values({ prId, key, value })
    .onConflictDoUpdate({ target: [t.prFlags.prId, t.prFlags.key], set: { value } });
}
```

**Problem:**
- The method signature accepts `workspaceId` as a parameter (line 15).
- The insert values on line 18 **do not include `workspaceId`**: `{ prId, key, value }`.
- The `workspaceId` parameter is **never referenced** anywhere in the function.

**Implication:**  
When inserting or updating a flag, there is no tenant guard. A user in workspaceA could potentially upsert flags for a PR in workspaceB. Additionally, if the `prFlags` table has a `workspaceId` column with a NOT NULL constraint, this query would fail at runtime; if not, records are created without tenant context, orphaning them or creating ambiguity during read operations.

**Required fix:**  
Include `workspaceId` in the values and conflict resolution:
```typescript
.values({ prId, key, value, workspaceId })
.onConflictDoUpdate({ 
  target: [t.prFlags.prId, t.prFlags.key], 
  set: { value } 
})
```

---

## Call Chain Evidence

The workspaceId flows through the layers but disappears at the boundary:

- **routes.ts:12** → extracts `workspaceId` from context
- **routes.ts:13, 20** → passes `workspaceId` to `service.get()` and `service.set()`
- **service.ts:12, 16** → receives `workspaceId`, passes it to `repo.getForPr()` and `repo.set()`
- **repository.ts:11, 18** → **parameter accepted but unused in queries**

---

## Architecture Violation Type

Per the onion-architecture skill:
- **Layer:** Persistence (repository)
- **Rule violated:** "every query is workspace-scoped (tenancy guard)"
- **Severity:** Critical
- **Category:** Transitive tenancy leak (parameter flows through call chain but is dropped at the database boundary, leaving queries unscoped)

---

## Recommendation

1. Ensure the `prFlags` table schema includes a `workspaceId` column.
2. Update both `getForPr` and `set` methods to include `workspaceId` in their WHERE clauses (for reads) or VALUES (for writes).
3. Add integration tests that verify queries are properly scoped (e.g., confirm a user from workspaceA cannot read/write flags for a PR not in their workspace).
