# Plan: Intent Language Fix

> Status: DRAFT
> Created: 2026-06-25

## Problem

`deriveIntent()` uses DeepSeek Flash via OpenRouter. The model defaults to
responding in the same language as the input content (PR title/body). When a PR
is written in Chinese, Korean, or any non-English language the intent output
(`summary`, `in_scope[]`, `out_of_scope[]`) is returned in that language,
breaking the UI intent card readability for English-speaking reviewers.

Root cause: `INTENT_SYSTEM_PROMPT` in `intent-deriver.ts` does not specify
output language.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| reviews: deriver | `server/src/modules/reviews/intent-deriver.ts` | Modify |

## Tasks

### TASK-001: Add English output constraint to INTENT_SYSTEM_PROMPT

**Scope:** backend

**Owned Paths:**
- `server/src/modules/reviews/intent-deriver.ts`

**Change:**

Append `"Always respond in English regardless of the language of the PR title, body, or linked issue."` to `INTENT_SYSTEM_PROMPT`.

Before:
```typescript
const INTENT_SYSTEM_PROMPT =
  "You are a PR intent classifier. Given a PR title, optional description, and a list " +
  "of changed files with their hunk positions (no code bodies), output the PR's intent " +
  "summary, what changes are in scope, and what is explicitly out of scope. " +
  "If there is no description, infer intent from the title and changed file paths — " +
  "this is expected and sufficient. Be concise and specific.";
```

After:
```typescript
const INTENT_SYSTEM_PROMPT =
  "You are a PR intent classifier. Given a PR title, optional description, and a list " +
  "of changed files with their hunk positions (no code bodies), output the PR's intent " +
  "summary, what changes are in scope, and what is explicitly out of scope. " +
  "If there is no description, infer intent from the title and changed file paths — " +
  "this is expected and sufficient. Be concise and specific. " +
  "Always respond in English regardless of the language of the PR title, body, or linked issue.";
```

**Acceptance Criteria:**
- [ ] AC-001: Intent card shows English text for a PR with non-English title/body
- [ ] AC-002: `cd server && pnpm typecheck` passes (no new type errors)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | Click Recalculate on the PR that showed Chinese/Korean → card refreshes in English |
| AC-002 | `cd server && pnpm typecheck` |

## Implementation Phases

### Phase 1: Fix prompt
- [ ] Edit `INTENT_SYSTEM_PROMPT` in `server/src/modules/reviews/intent-deriver.ts`
- [ ] Restart server
- [ ] Click Recalculate on affected PR → verify English output

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Model ignores the instruction on some inputs | Instruction is authoritative (in system prompt, not untrusted data) — flash models reliably follow language constraints |

## Out of Scope

- No changes to client
- No DB migration
- No changes to other prompts (review agents use agent.systemPrompt controlled by user)
