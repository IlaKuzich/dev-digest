# TODO — repo sync button in the UI

Not yet implemented. Captured here so the idea isn't lost between sessions.

## Problem

There's currently no UI-visible way to trigger a re-sync of a tracked repo's PR/review data —
whatever mechanism keeps DevDigest's DB in sync with the source repo has to be triggered out of
band (re-running a seed script, restarting a poller, etc.). Users can't ask "is this PR's data
stale, and can I refresh it" from the UI itself.

## Proposed shape (not designed in detail yet — needs a real design pass before implementing)

- A "Sync now" action somewhere on the repo/PR view, calling a new (or existing?) sync endpoint.
- Needs to answer, before implementation:
  - Is there already a sync/poll mechanism server-side to hook this into, or does this require a new
    one? (Check `server/docs/architecture.md` and whatever currently populates PR/review data.)
  - Should this be per-repo or per-PR?
  - Optimistic UI (spinner + disabled state) vs. polling a job-status endpoint for completion?
  - Rate-limiting — a user mashing "sync" shouldn't be able to hammer the source repo's API.

## Status

Not started — this is a placeholder for a feature idea, not a committed plan. Needs a proper design
discussion (and likely a `spec-creator`/`quick-planner` pass) before any code is written.
