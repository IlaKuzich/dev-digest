/** How long ResyncButton waits for `lastIndexedSha` to advance before calling
    the resync a failure. The server's resync is an async 202 job that degrades
    to `no_clone`/`sync_failed` instead of throwing (`repo-intel/service.ts:143`),
    so a "successful" POST can still never move the sha — without a deadline the
    button would spin forever. Generous enough for a full reindex of a large
    repo (observed: ~5s for 153 files) plus queue wait. */
export const RESYNC_POLL_TIMEOUT_MS = 60_000;
