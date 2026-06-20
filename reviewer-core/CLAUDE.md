# CLAUDE.md — @devdigest/reviewer-core (review engine)

## Before answering
You MUST search this package's `docs/`, `specs/`, and `insights.md` for context relevant to the user's current prompt before responding. Pull in only what is relevant; if nothing applies, proceed without it. Treat `insights.md` as a curated learning log — read it every turn.

## Stack
- Pure TypeScript engine — NO DB, NO GitHub, NO filesystem
- `openai` SDK (used by `OpenRouterProvider`) · Zod 3
- vitest 2 + tsx 4

## Commands
- `npm test`         — vitest (hermetic; uses stubbed `LLMProvider`)
- `npm run typecheck` / `npm run build` — BOTH are typecheck-only; this package never emits JS

## Where things live (top-level map)
- Public exports → `src/index.ts`
- Prompt assembly + injection guard → `src/prompt.ts`
- Citation grounding gate → `src/grounding.ts`
- Structured output (Zod → JSON Schema, parse-with-repair) → `src/llm/structured.ts`
- OpenRouter provider → `src/llm/openrouter.ts`
- Orchestrator (`reviewPullRequest`, `reduce`) → `src/review/run.ts`

## Non-default conventions
- Pure module — the only side effect is the INJECTED `LLMProvider`
- `LLMProvider` is ALWAYS injected (tests pass `MockLLMProvider`); never construct one inline
- Grounding is MANDATORY: every finding must cite a real diff line or it's dropped
- The model's self-reported score is IGNORED — recomputed from surviving findings
- `INJECTION_GUARD` is appended to every system prompt by `assemblePrompt` — never keyword-scan untrusted text
- Consumed as TypeScript SOURCE by the server via tsconfig path alias

## Do-not-touch zones
- Don't make this package emit JS — `build` must stay typecheck-only
- Don't import from `server/`, `client/`, or any DB / GitHub / filesystem code
- Don't add a parallel "trust the model's score" path — grounding is the contract
- Don't add keyword-based injection filters — `INJECTION_GUARD` is the defense

## Read when
- Read [README.md](./README.md) **when** changing the pipeline shape — has the diff→prompt→LLM→grounding diagram and public API list.
- Read [docs/](./docs/) **when** you need a deep dive on prompt assembly, grounding rules, or structured output.
- Read [specs/](./specs/) **when** changing the `Review`/`Finding` contract — shared with server and future CI runner.
- Invoke skill `zod` **when** evolving contracts; `typescript-expert` **when** unsure about a type-level construct.
