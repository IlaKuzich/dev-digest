# CLAUDE.md — DevDigest

Local-first AI PR review tool. Multi-package, NOT a workspace.

## Before answering
You MUST identify which package(s) the user's prompt touches and search those packages' `docs/`, `specs/`, and `INSIGHTS.md` for context relevant to the prompt. Also check root `docs/`, `TESTING.md`, and the root `INSIGHTS.md` (cross-cutting findings) if the prompt is project-wide. Pull in only what is relevant; if nothing applies, proceed without it. Treat each `INSIGHTS.md` as a curated learning log — read it every turn you work in that package.

## Stack (project-wide)
- Node ≥22 · pnpm ≥10 · Docker (Postgres only)
- TypeScript 5.7 everywhere; Zod 3 contracts in `@devdigest/shared`

## Packages (each owns its CLAUDE.md — auto-loads when you edit there)
- `server/`        Fastify 5 + Drizzle/Postgres (pgvector) · :3001
- `client/`        Next.js 15 + React 19 · :3000
- `reviewer-core/` Pure review engine (no DB/FS/network)
- `e2e/`           agent-browser deterministic flows

## Boot from zero
- `./scripts/dev.sh` — Postgres + API + web in one shot
- `./scripts/e2e.sh` — hermetic e2e (isolated stack on alt ports)
- Per-package: `cd <pkg> && pnpm install && pnpm dev` (server/client) or `npm install && npm test` (reviewer-core/e2e)

## Project-wide conventions (the agent CAN'T infer these)
- NOT a workspace: each package has its own `package.json` + lockfile
- Cross-package code shared via tsconfig path aliases, NOT pnpm workspaces
- `reviewer-core` is consumed as TypeScript SOURCE (never emits JS)
- `@devdigest/shared` is VENDORED into each consumer under `src/vendor/shared`

## Do-not-touch zones
- Don't introduce a workspace tool (pnpm workspace / turbo / nx)
- Don't import across package src directly — route through `@devdigest/shared`

## Read when
- Read [README.md](./README.md) **when** onboarding or unsure how packages fit together — has the architecture diagram and quick-start.
- Read [TESTING.md](./TESTING.md) **when** writing or running tests — owns the unit/integration split convention (`*.it.test.ts`).
- Read [docs/agent-prompts/](./docs/agent-prompts/) **when** changing or authoring a reviewer system prompt.
- Invoke a skill from `.claude/skills/` **when** working with Fastify, Drizzle, Next, React, Zod, etc. — don't re-derive framework patterns inline.
- Invoke skill `engineering-insights` **when** wrapping up a session — capture any non-obvious lesson into the touched module's `INSIGHTS.md` (append-only).
