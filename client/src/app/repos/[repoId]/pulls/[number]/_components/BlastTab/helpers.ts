/* BlastTab/helpers.ts — pure helpers for the blast radius tree: honest
   degradation copy, the "no downstream callers" leftover list, and the stat
   strip counts. No React import — business logic only. */
import type { BlastIndexState, BlastResponse } from "@/lib/hooks/blast";
import type { ChangedSymbol } from "@devdigest/shared";

/** Human sentence per repo-intel degradation reason
    (`repo-intel/types.ts` reason enum). */
const REASON_SENTENCES: Record<string, string> = {
  flag_off: "Repo intelligence is disabled for this repo — blast radius data is unavailable.",
  index_failed: "The last index build failed — blast radius data may be missing or stale.",
  index_partial: "The index is only partially built — some callers may be missing.",
  repo_too_large: "This repo is too large to fully index — blast radius data is incomplete.",
  no_data: "No index has been built for this repo yet — blast radius data is unavailable.",
};

/** One human sentence explaining why the index is degraded/partial, or
    `null` on the full (non-degraded) path — never renders an empty screen. */
export function degradationSentence(state: BlastIndexState): string | null {
  if (!state.degraded && state.status === "full") return null;
  const reason = state.degradedReason;
  if (reason && REASON_SENTENCES[reason]) return REASON_SENTENCES[reason];
  return `The repo index is ${state.status} — some blast radius data may be missing.`;
}

/** True when the index is degraded/partial — the caller must never present
    an empty caller/endpoint/cron list as "0" on this path (honest
    degradation, not a fabricated zero). */
export function isDegraded(state: BlastIndexState): boolean {
  return state.degraded === true || state.status !== "full";
}

/** Changed symbols with no entry in `downstream` (no callers found for
    them) — rendered via the `noDownstream` message instead of a tree row. */
export function symbolsWithoutDownstream(data: BlastResponse): ChangedSymbol[] {
  const withDownstream = new Set(data.downstream.map((d) => d.symbol));
  return data.changed_symbols.filter((sym) => !withDownstream.has(sym.name));
}

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  /** `null` means "unknown" (degraded path — never fabricate a 0). */
  crons: number | null;
}

/** Stat-strip counts. Endpoints/crons are deduped unions across all
    downstream groups; crons is `null` (render "unknown") on the degraded
    path since the facade carries no cron data there. */
export function blastCounts(data: BlastResponse): BlastCounts {
  const callers = data.downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpoints = new Set(data.downstream.flatMap((d) => d.endpoints_affected)).size;
  const degraded = isDegraded(data.index_state);
  const crons = degraded ? null : new Set(data.downstream.flatMap((d) => d.crons_affected)).size;
  return { symbols: data.changed_symbols.length, callers, endpoints, crons };
}
