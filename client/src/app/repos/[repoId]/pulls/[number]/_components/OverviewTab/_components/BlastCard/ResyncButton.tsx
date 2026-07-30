/* ResyncButton — the affordance `emptyExplanation`/`degradationSentence` tell
   the user to reach for ("resync the repo to find out"). Until this existed the
   copy was a dead end: `useResyncRepoIntel` shipped with no caller, and the PR
   list's Refresh button could not advance the index at all (its clone job does a
   bare `fetch`, leaving HEAD on the old sha — see `repos/service.ts` `refresh`).

   Owns the whole resync round-trip so BlastCard stays a render component:
   POST /resync (202, async job) → poll /index-state → when `lastIndexedSha`
   moves off the sha we started from, the index has genuinely advanced, so
   invalidate this PR's blast query and the map re-renders with real data.

   `lastIndexedSha` is the completion signal rather than `status` because the
   status enum is terminal-only ("full" both before and after a resync) — see
   `lib/hooks/repo-intel.ts:18,29`. */
"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@devdigest/ui";
import { useParams } from "next/navigation";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { RESYNC_POLL_TIMEOUT_MS } from "./constants";
import { s } from "./styles";

/** A resync that never advances the sha (degraded `no_clone`/`sync_failed` —
    `repo-intel/service.ts:143` returns those instead of throwing, so the 202
    still looks like success) must not poll forever. Give up after a deadline
    and say so rather than spinning silently. */
export function ResyncButton({ prId }: { prId: string | null }) {
  const { repoId } = useParams<{ repoId: string }>();
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);

  // Non-null ⇒ a resync is in flight; holds the sha we are trying to move off.
  const [startedFrom, setStartedFrom] = React.useState<string | null>(null);
  const [timedOut, setTimedOut] = React.useState(false);

  const polling = startedFrom !== null;
  const indexState = useRepoIntelStatus(repoId, polling);
  const currentSha = indexState.data?.lastIndexedSha;

  // Completion: the sha moved off the one we started from.
  React.useEffect(() => {
    if (startedFrom === null) return;
    if (!currentSha || currentSha === startedFrom) return;

    setStartedFrom(null);
    // The index moved — what is stale now is the MAP, not the index state.
    // Nothing else invalidates the blast query, so this is its refresh.
    qc.invalidateQueries({ queryKey: ["blast", prId] });
  }, [startedFrom, currentSha, prId, qc]);

  // Give-up deadline. This MUST be a real timer rather than a `Date.now()`
  // check inside the effect above: when a resync degrades, the sha never
  // changes, so no dependency ever changes, so that effect never re-runs and
  // the button would spin forever — the exact failure this is here to prevent.
  // Keyed on `startedFrom` so it arms on click, and the cleanup disarms it the
  // moment the sha advances (or the component unmounts).
  React.useEffect(() => {
    if (startedFrom === null) return;
    const id = setTimeout(() => {
      setStartedFrom(null);
      setTimedOut(true);
    }, RESYNC_POLL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [startedFrom]);

  const onClick = () => {
    setTimedOut(false);
    // `?? ""` — an index-state that has not loaded still gives a baseline that
    // any real sha differs from, so completion is detected, never missed.
    setStartedFrom(currentSha ?? "");
    resync.mutate();
  };

  const busy = polling || resync.isPending;

  return (
    <div style={s.resyncRow}>
      <Button
        kind="secondary"
        size="sm"
        icon="RefreshCw"
        loading={busy}
        disabled={busy || !repoId}
        aria-label="Resync the repository index and rebuild this blast radius"
        onClick={onClick}
      >
        {busy ? "Resyncing…" : "Resync repo"}
      </Button>

      {resync.isError && (
        <span role="alert" style={s.resyncNote}>
          Couldn&apos;t start the resync. The map above is unchanged.
        </span>
      )}

      {timedOut && (
        <span role="alert" style={s.resyncNote}>
          The index didn&apos;t advance — the repo may not be cloned yet, or the fetch failed.
        </span>
      )}
    </div>
  );
}
