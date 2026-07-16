/**
 * Runtime configuration for the devdigest-mcp stdio server.
 *
 * The only external knob is `DEVDIGEST_API_URL` — this is a purely local dev
 * tool that talks to the DevDigest Fastify API over plain HTTP; there is no
 * secret/token to resolve (the API runs `LocalNoAuthProvider` and auto-resolves
 * the default workspace via `getContext`). See root docs/plans/2026-07-16-…md
 * "Constraints" section for why this deliberately skips SecretsProvider.
 */
export const API_URL = process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001';

/** Max time to poll `run_agent_on_pr` for a run to leave 'running' before
 * returning a `{ status: 'running', run_id }` partial result. */
export const RUN_TIMEOUT_MS = 120_000;

/** Delay between polls of `GET /pulls/:id/runs` while waiting on a run. */
export const POLL_INTERVAL_MS = 2_000;

/** Hard guard on the serialized size (characters) of a single tool response
 * payload — trimmed/truncated by `guardCharacterLimit` (src/trim.ts). */
export const CHARACTER_LIMIT = 25_000;

/** Pagination defaults for list-shaped tool outputs. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
