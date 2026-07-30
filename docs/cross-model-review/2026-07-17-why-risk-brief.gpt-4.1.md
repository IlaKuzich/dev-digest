**SHIP WITH CHANGES**

---

### 1. [critical] Ambiguity in "file_ref" normalization and matching (T2 Step 3)
The plan specifies that `groundBrief` should "strip a trailing :line / :start-end suffix" for file refs, but does not define the normalization algorithm precisely, nor does it specify how to handle edge cases (e.g., Windows paths, double colons, or malformed refs). This could lead to inconsistent grounding or dropped refs. **Action:** Explicitly define the normalization algorithm and add test cases for edge cases in `brief-grounding.test.ts`.

---

### 2. [high] Unclear handling of concurrent POST and GET requests (T2 Step 5, T2 Step 6)
While the in-flight guard for POST (`regenerate`) is specified, the plan does not clarify what happens if a GET and POST for the same PR occur concurrently (e.g., GET while POST is generating). Could GET return null or stale data? **Action:** Specify that GET should always return the latest available cache (even if a POST is in-flight), and clarify this in both implementation and tests.

---

### 3. [high] Missing explicit error handling for malformed cache data (T2 Step 2)
The plan says to parse cached data with `Brief.parse`, but does not specify what to do if parsing fails (e.g., due to a corrupted cache row). Should the cache be deleted, or should an error be surfaced? **Action:** Define and test the error-handling path for corrupted cache data.

---

### 4. [medium] Incomplete i18n key migration instructions (T3 Step 5)
The plan says to "verify by grep first" that no other component reads the old i18n keys before removing them, but does not specify what to do if other components do use them. This could lead to accidental breakage. **Action:** Specify that if any other component uses the old keys, they must be left in place until those components are migrated.

---

### 5. [medium] Insufficient detail on "discovered context docs" wiring (T2 Step 5)
The plan refers to "discovered context docs" and says to reuse `ContextService` discovery, but does not specify how to handle cases where discovery fails, is empty, or returns unexpected data. **Action:** Add explicit handling and test coverage for empty/missing/invalid context doc discovery.

---

### 6. [medium] No explicit test for Markdown rendering limitations (T3 Step 3, T3 Step 6)
The plan notes that headings in model text render flat due to Markdown limitations, but does not require a test to ensure this is handled gracefully (e.g., no broken UI). **Action:** Add a test case to verify that Markdown rendering does not break the card even with heading-like input.

---

### 7. [medium] No explicit test for non-interactive placeholder state (T3 Step 2, T3 Step 6)
While the plan says to render a placeholder when `prId == null`, it does not require a test to ensure that no network request is fired in this state. **Action:** Add a test that asserts no fetch occurs when `prId` is null.

---

### 8. [low] Potential for stale contract barrels (T1 Step 3)
The plan says to check if barrels use `export *` or explicit lists, but does not require a test to ensure the new types are actually exported. **Action:** Add a test or verification step to ensure the new types are exported from the barrels.

---

### 9. [low] No explicit mention of accessibility testing (T3 Step 3, T3 Step 6)
The plan references accessibility requirements (e.g., color + label, non-nested interactives), but does not require an a11y test (e.g., using axe or similar). **Action:** Add a test to check for basic accessibility violations.

---

### 10. [low] No explicit test for endpoint file_ref matching (T2 Step 3, T2 Step 8)
The plan says endpoints are matched verbatim, but does not require a test for this. **Action:** Add a test case for endpoint-style file_refs in `brief-grounding.test.ts`.

---

### 11. [low] No explicit test for multi-process in-flight guard limitations (T2 Step 5)
The plan notes the in-memory in-flight guard is sufficient for a single-process server, but does not require a test or warning for multi-process deployments. **Action:** Add a comment or test noting this limitation.

---

**Everything else is well-specified, with clear file ownership, sequencing, and testability. The plan is thorough and aligns with the spec and context.**

---
_model: openai/gpt-4.1 · tokens: 9544 in / 985 out_
