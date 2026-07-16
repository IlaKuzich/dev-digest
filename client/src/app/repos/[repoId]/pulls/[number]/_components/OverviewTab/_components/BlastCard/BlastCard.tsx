/* BlastCard — the Blast Radius surface on the PR Overview tab, sibling of
   IntentCard. This card is the WHOLE feature: stat strip, Tree/Graph toggle,
   the impact tree (changed symbols → downstream callers → affected
   endpoints/crons), and the "Prior PRs touching these files" footer.

   There is deliberately no separate "Blast" tab — an earlier iteration split
   a counts-only card from a full-page tab; the approved design puts the tree
   inline here and keeps the tab strip at Overview / Agent runs / Files
   changed. See docs/plans/2026-07-16-blast-radius.md (T9).

   Served entirely from the pre-built repo-intel index — zero analysis at
   review time. All data flows through useBlast; this component never calls
   fetch/api directly. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Badge, Skeleton, ErrorState, Icon } from "@devdigest/ui";
import { useBlast, useExplainBlast } from "@/lib/hooks/blast";
import {
  blastCounts,
  coverageSentence,
  degradationSentence,
  emptyExplanation,
  symbolsWithoutDownstream,
} from "./helpers";
import { SymbolRow } from "./SymbolRow";
import { ViewToggle, type BlastView } from "./ViewToggle";
import { BlastGraph } from "./BlastGraph";
import { PriorPrs } from "./PriorPrs";
import { s } from "./styles";

interface BlastCardProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section style={s.card}>
      <SectionLabel icon="Zap">Blast radius</SectionLabel>
      {children}
    </section>
  );
}

export function BlastCard({ prId, repoFullName, headSha }: BlastCardProps) {
  const t = useTranslations("blast");
  const [view, setView] = React.useState<BlastView>("tree");
  const { data, isLoading, isError, refetch } = useBlast(prId);
  // Optional, user-triggered "explain" summary — never fires automatically,
  // never blocks the read path above (the map itself is not AI-derived).
  const explain = useExplainBlast(prId);

  if (isLoading) {
    return (
      <CardShell>
        <Skeleton height={40} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </CardShell>
    );
  }

  if (isError || data == null) {
    return (
      <CardShell>
        <ErrorState
          title="Couldn't load blast radius"
          body="Something went wrong fetching the blast radius for this PR."
          onRetry={() => refetch()}
        />
      </CardShell>
    );
  }

  const sentence = degradationSentence(data.index_state);
  const degraded = sentence != null;
  const coverage = coverageSentence(data.coverage);

  // Not a degradation — the index is healthy, it simply has no view of files
  // this PR creates. Rendered wherever the counts are, so a big PR with a small
  // map explains itself instead of reading as "nothing is affected".
  const coverageNote = coverage ? (
    <p style={s.coverageNote}>
      <Icon.Info size={12} /> {coverage}
    </p>
  ) : null;

  // Honest degradation: the badge + explanation are computed BEFORE the empty
  // branch and rendered inside it. An incomplete index must always explain
  // itself — "no data" with no reason is exactly the empty screen the
  // requirement forbids.
  const banner = degraded ? (
    <div style={s.degradedBanner}>
      <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
        Index incomplete
      </Badge>
      <span style={s.degradedText}>{sentence}</span>
    </div>
  ) : null;

  // Nothing indexed for these files. This is the branch that must never be a
  // bare empty screen — `emptyExplanation` already folds in the degradation
  // reason when there is one, so render exactly ONE explanation block here
  // rather than stacking it on top of `banner`.
  if (data.changed_symbols.length === 0) {
    return (
      <CardShell>
        <div style={s.degradedBanner}>
          {degraded ? (
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              Index incomplete
            </Badge>
          ) : (
            <Badge icon="Info" color="var(--text-muted)" bg="var(--bg)">
              No symbols indexed
            </Badge>
          )}
          <span style={s.degradedText}>{emptyExplanation(data.index_state)}</span>
        </div>
        {coverageNote}
        <PriorPrs priorPrs={data.prior_prs} repoFullName={repoFullName} />
      </CardShell>
    );
  }

  const counts = blastCounts(data);
  const leftover = symbolsWithoutDownstream(data);

  return (
    <section style={s.card}>
      <SectionLabel icon="Zap">Blast radius</SectionLabel>

      <div style={s.statRow}>
        <span style={s.stat}>
          <Icon.Code size={13} />
          <span className="tnum" style={s.statValue}>
            {counts.symbols}
          </span>
          {t("stat.symbols")}
        </span>
        <span style={s.stat}>
          <Icon.CornerDownRight size={13} />
          <span className="tnum" style={s.statValue}>
            {counts.callers}
          </span>
          {t("stat.callers")}
        </span>
        <span style={s.stat}>
          <Icon.Globe size={13} />
          <span className="tnum" style={s.statValue}>
            {counts.endpoints}
          </span>
          {t("stat.endpoints")}
        </span>
        <span style={s.stat}>
          <Icon.Clock size={13} />
          <span className="tnum" style={s.statValue}>
            {counts.crons ?? "unknown"}
          </span>
          {t("stat.crons")}
        </span>
        <span style={s.statSpacer}>
          <ViewToggle view={view} onChange={setView} />
        </span>
      </div>

      {banner}
      {coverageNote}

      {view === "tree" ? (
        <>
          <div style={s.tree}>
            {data.downstream.map((impact) => (
              <SymbolRow
                key={impact.symbol}
                impact={impact}
                degraded={degraded}
                repoFullName={repoFullName}
                headSha={headSha}
              />
            ))}
          </div>
          {leftover.length > 0 && (
            <p style={s.noDownstream}>{t("noDownstream", { count: leftover.length })}</p>
          )}
        </>
      ) : (
        <BlastGraph downstream={data.downstream} />
      )}

      <PriorPrs priorPrs={data.prior_prs} repoFullName={repoFullName} />

      <div style={s.explainRow}>
        <Button
          kind="ghost"
          size="sm"
          icon="Sparkles"
          loading={explain.isPending}
          aria-label="Explain this blast radius map in one paragraph"
          onClick={() => explain.mutate()}
        >
          Explain
        </Button>
      </div>

      {explain.isError && (
        <p role="alert" style={s.explainError}>
          Could not generate an explanation. The map above is unaffected.
        </p>
      )}

      {explain.data?.summary && (
        <p aria-live="polite" style={s.summary}>
          {explain.data.summary}
        </p>
      )}
    </section>
  );
}
