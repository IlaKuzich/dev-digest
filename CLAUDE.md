# CLAUDE.md — DevDigest

Local-first AI PR review tool. Multi-package, NOT a workspace.

## Before answering
You MUST identify which package(s) the user's prompt touches and search those packages' `docs/`, `specs/`, and `INSIGHTS.md` for context relevant to the prompt. Also check root `docs/`, `TESTING.md`, and the root `INSIGHTS.md` (cross-cutting findings) if the prompt is project-wide. Pull in only what is relevant; if nothing applies, proceed without it. Treat each `INSIGHTS.md` as a curated learning log — read it every turn you work in that package. At session start, confirm you've read the relevant `INSIGHTS.md` and briefly summarize the top ~3 points most relevant to today's task before starting work. Treat entries as high-confidence guidance unless explicitly told otherwise.

## Stack (project-wide)
- Node ≥22 · pnpm ≥10 · Docker (Postgres only)
- TypeScript 5.7 everywhere; Zod 3 contracts in `@devdigest/shared`

## Packages (each owns its CLAUDE.md — auto-loads when you edit there)
- `server/`        Fastify 5 + Drizzle/Postgres (pgvector) · :3001
- `client/`        Next.js 15 + React 19 · :3000
- `reviewer-core/` Pure review engine (no DB/FS/network)
- `e2e/`           agent-browser deterministic flows
- `evals/`         Eval harness for skills/agents/workflow — vitest + Claude Agent SDK

## Boot from zero
- `./scripts/dev.sh` — Postgres + API + web in one shot
- `./scripts/e2e.sh` — hermetic e2e (isolated stack on alt ports)
- Per-package: `cd <pkg> && pnpm install && pnpm dev` (server/client) or `npm install && npm test` (reviewer-core/e2e)

## Project-wide conventions (the agent CAN'T infer these)
- NOT a workspace: each package has its own `package.json` + lockfile
- Cross-package code shared via tsconfig path aliases, NOT pnpm workspaces
- `reviewer-core` is consumed as TypeScript SOURCE (never emits JS)
- `@devdigest/shared` is VENDORED into each consumer under `src/vendor/shared`
- No root `package.json` by design (would imply a workspace) — `pnpm` commands for a package
  only work run from inside it, e.g. `cd evals && pnpm eval:quality`, never from repo root

## Evals — run after changing the harness itself
`evals/` (own `package.json`/lockfile — run everything via `cd evals`) is the only regression
check on `.claude/skills/*`, `.claude/agents/*`, and `CLAUDE.md`. Nothing runs it for you yet, so
run the matching command yourself before calling a harness change done:
- Changed `.claude/skills/*` → `pnpm eval:skills`
- Changed `.claude/agents/*` → `pnpm eval:agents`
- Changed `CLAUDE.md` (or other on-disk project config) → `pnpm eval:workflow`
- `pnpm eval:quality` — static gate, no model (SKILL.md structure/frontmatter/links)
- `pnpm eval` — full suite

## Do-not-touch zones
- Don't introduce a workspace tool (pnpm workspace / turbo / nx)
- Don't import across package src directly — route through `@devdigest/shared`

## Read when
- Read [README.md](./README.md) **when** onboarding or unsure how packages fit together — has the architecture diagram and quick-start.
- Read [TESTING.md](./TESTING.md) **when** writing or running tests — owns the unit/integration split convention (`*.it.test.ts`).
- Read [docs/agent-prompts/](./docs/agent-prompts/) **when** changing or authoring a reviewer system prompt.
- Invoke a skill from `.claude/skills/` **when** working with Fastify, Drizzle, Next, React, Zod, etc. — don't re-derive framework patterns inline.
- Invoke skill `engineering-insights` **when** wrapping up a session — capture any non-obvious lesson into the touched module's `INSIGHTS.md` (append-only). **Do not skip this step** — until the L06 Stop-hook automates it, capture only happens if you run it.
- Read [evals/README.md](./evals/README.md) **when** changing `.claude/skills/*`, `.claude/agents/*`, or `CLAUDE.md` — then run the matching eval command from the "Evals" section above. **Do not skip this step** — nothing triggers it automatically yet, so regression protection only happens if you run it.
