# CLAUDE.md — @devdigest/api (server)

## Before answering
You MUST search this package's `docs/`, `specs/`, and `insights.md` for context relevant to the user's current prompt before responding. Pull in only what is relevant; if nothing applies, proceed without it. Treat `insights.md` as a curated learning log — read it every turn.

## Stack
- Fastify 5 · `fastify-type-provider-zod` · `fastify-sse-v2` · helmet · cors · rate-limit
- Drizzle ORM 0.38 · `postgres` driver · Postgres 16 + pgvector
- Pino logging · testcontainers (integration) · vitest 2

## Commands
- `pnpm dev`                                              — API on :3001 (tsx watch)
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:generate` — Drizzle CLI
- `pnpm exec vitest run --exclude '**/*.it.test.ts'`     — unit (hermetic)
- `pnpm exec vitest run .it.test`                        — integration (Docker)
- `pnpm test` / `pnpm typecheck`

## Where things live (top-level map)
- DI composition root → `src/platform/container.ts`
- Adapter mocks → `src/adapters/mocks.ts` (use in unit tests)
- Feature modules → `src/modules/<name>/{routes,service,repository}.ts`
- DB schema barrel → `src/db/schema.ts` (per-domain files in `src/db/schema/`)
- Shared Zod contracts (canonical copy) → `src/vendor/shared/`
- Secrets store → `~/.devdigest/secrets.json` (mode 0600, accessed via `SecretsProvider`)

## Non-default conventions
- Services receive `Container`; never instantiate adapters directly
- Routes declare Zod `params`/`body` — no hand-rolled `Schema.parse(req.body)`
- Tests: `*.it.test.ts` = DB-backed (testcontainers); everything else hermetic
- Secrets: ALWAYS via `SecretsProvider`, never `process.env` in feature code
- `server/package.json` is `skip-worktree` — CI uses explicit `pnpm exec vitest`
- Grounding gate is mandatory; model's self-reported score is IGNORED
- Plugins register BEFORE modules in `src/app.ts` so encapsulated modules inherit them

## Do-not-touch zones
- Don't migrate on boot — `pnpm db:migrate` is manual by design
- Don't add OpenAI calls when `EMBEDDINGS_ENABLED=false` (must stay zero)
- Don't edit existing schema files — extend with a new file + migration
- Don't add `test:unit`/`test:integration` npm scripts (package.json is skip-worktree)
- Don't put secrets in `AppConfig` / env — they live behind `SecretsProvider` only

## Read when
- Read [README.md](./README.md) **when** working on routes, the DI container, or the request/error flow — has the API map and request diagram.
- Read [docs/](./docs/) **when** you need a deep dive (pipeline architecture, module design, etc.).
- Read [specs/](./specs/) **when** changing a contract or proposing a new one.
- Read [src/modules/repo-intel/README.md](./src/modules/repo-intel/README.md) **when** touching repo-intel — degraded-mode rules and T1/T3 layering live there.
- Invoke skill `fastify-best-practices` **when** adding routes/plugins; `drizzle-orm-patterns` and `postgresql-table-design` **when** changing schema; `zod` **when** defining or evolving contracts.
