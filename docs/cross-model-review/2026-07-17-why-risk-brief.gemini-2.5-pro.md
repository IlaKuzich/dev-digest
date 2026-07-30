SHIP WITH CHANGES

This is an exceptionally detailed and well-structured implementation plan. It demonstrates a deep understanding of the existing architecture, proactively resolves ambiguities, and has a robust testing strategy. The parallel execution plan is sound due to the clear definition of file ownership and the contract-first approach. The few findings below are minor clarifications to prevent ambiguity for the implementer.

---

### Findings

1.  **[High] Ambiguous handling of corrupted cache entries.**
    -   **Problem:** T2, Step 2 (`repository.ts`) specifies that the `read` method should `Return null if no row`. It does not specify what to do if a row exists but its JSON blob is malformed or fails Zod parsing. This could lead to an unhandled exception and a 500 error for the user, instead of a graceful recovery.
    -   **Change:** Modify the `read` method's specification in T2, Step 2. It should explicitly state: "Return `null` if no row exists OR if the stored blob is malformed and fails parsing. This treats a corrupted cache entry as a cache miss, allowing the service layer to trigger a clean regeneration."

2.  **[Medium] Incomplete validation of cached data.**
    -   **Problem:** T2, Step 2 specifies that the `read` method should parse the blob via `Brief.parse` on the nested `brief` field. However, the service layer relies on the entire `CachedBrief` object (`{ brief, head_sha, generated_at }`) to compute staleness. Parsing only the nested field leaves the `head_sha` and `generated_at` fields unvalidated, potentially causing runtime errors if they are missing or malformed in a corrupted cache entry.
    -   **Change:** In T2, Step 2, clarify that the `read` method should parse the *entire* JSON blob against a server-internal Zod schema for `CachedBrief`. This ensures all data read from the database is type-safe before being used by the service.

3.  **[Low] Incorrect documentation citation for a UI primitive.**
    -   **Problem:** T3, Step 3 instructs the implementer to reuse the `SeverityBadge` primitive and cites `client/INSIGHTS.md:47` as its source. This citation is incorrect; that line refers to testing libraries. This minor error could cause a brief delay while the implementer searches for the correct component.
    -   **Change:** In T3, Step 3, replace the incorrect citation with the correct path to the `SeverityBadge` component or a more accurate reference from `INSIGHTS.md`.

4.  **[Low] Ambiguity in i18n key cleanup.**
    -   **Problem:** T3, Step 5 instructs the implementer to `grep` for usages of old i18n keys before removing them, and to leave them if they are in use. This is a safe but passive approach that can lead to accumulating technical debt.
    -   **Change:** Strengthen the instruction in T3, Step 5. Add: "If `grep` finds other components using the old keys, do not block this task, but file a follow-up tech-debt ticket to refactor those components and remove the unused keys." This ensures the debt is tracked and addressed.

---
_model: google/gemini-2.5-pro · tokens: 10319 in / 4608 out_
