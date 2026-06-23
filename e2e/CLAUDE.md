# CLAUDE.md — @devdigest/e2e (browser flows)

## Before answering
You MUST search this package's `docs/`, `specs/`, and `INSIGHTS.md` for context relevant to the user's current prompt before responding. Pull in only what is relevant; if nothing applies, proceed without it. Treat `INSIGHTS.md` as a curated learning log — read it every turn.

## Stack
- Vercel **agent-browser** (Rust + CDP) — NO Playwright, NO LLM, NO API key
- Thin JSON-flow convention; runner in `run.ts` (tsx)

## Commands
- `agent-browser install`                — one-time, downloads Chrome for Testing
- `./scripts/e2e.sh`                     — hermetic (isolated stack on :5433/:3101/:3100) — RECOMMENDED
- `npm test` (after `./scripts/dev.sh`)  — against your dev stack (ONLY safe if dev DB has only the seeded repo)

## Where things live (top-level map)
- Flow specs → `specs/NN-name.flow.json`
- Runner (substitutes `{BASE}`, sequences steps) → `run.ts`
- Shared step helpers → `lib/`
- Hermetic stack script → `../scripts/e2e.sh`
- Failure screenshots → `test-results/` (git-ignored)

## Non-default conventions
- Locators are DETERMINISTIC only: `wait --url`, `wait --text`, `find role|text|label`
- `wait --text` / `wait --url` ARE the assertions (non-zero exit fails the step)
- Optional `"assert": { "stdoutIncludes": "…" }` adds a substring check
- Flows assume freshly-seeded DB (demo repo `acme/payments-api`, PR #482)
- `{BASE}` placeholder is replaced with `E2E_BASE_URL` (default `http://localhost:3000`)

## Do-not-touch zones
- DON'T use the AI `chat` command in any flow — would make runs non-deterministic
- DON'T run `docker compose down -v` to "reset" — deletes the `devdigest_pgdata` volume and every imported repo
- DON'T run `npm test` against a dev DB that has multiple repos — flows 02/04/05 follow the home redirect to the *first* repo and will land on the wrong one
- DON'T add an LLM/key dependency — this suite must stay deterministic and key-free

## Read when
- Read [README.md](./README.md) **when** adding a flow or changing the runner — has the spec format, env knobs, and coverage table.
- Read [docs/](./docs/) **when** you need a deep dive (flow patterns, debugging tips, …).
- Read [specs/](./specs/) **when** authoring or editing a flow (this is where the `.flow.json` files live).
- Read [../TESTING.md](../TESTING.md) **when** unsure how this suite fits into the broader test strategy.
