/* BlastTab — full blast radius tree for a PR: changed symbols → downstream
   callers → affected endpoints/crons, served entirely from the pre-built
   repo-intel index (zero analysis at review time). Tree view ONLY — no
   Graph mode, no "prior PRs touching these files" (out of scope). All data
   flows through useBlast; this component never calls fetch/api directly. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useBlast } from "@/lib/hooks/blast";
import { blastCounts, degradationSentence, symbolsWithoutDownstream } from "./helpers";
import { SymbolRow } from "./SymbolRow";
import { s } from "./styles";

interface BlastTabProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}

export function BlastTab({ prId, repoFullName, headSha }: BlastTabProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = useBlast(prId);

  if (isLoading) {
    return (
      <section style={s.section}>
        <Skeleton height={40} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </section>
    );
  }

  if (isError || data == null) {
    return (
      <ErrorState
        title="Couldn't load blast radius"
        body="Something went wrong fetching the blast radius for this PR."
        onRetry={() => refetch()}
      />
    );
  }

  if (data.changed_symbols.length === 0) {
    return (
      <EmptyState
        icon="Boxes"
        title="No blast radius data"
        body="The repo index has no symbols recorded for these changed files."
      />
    );
  }

  const counts = blastCounts(data);
  const sentence = degradationSentence(data.index_state);
  const leftover = symbolsWithoutDownstream(data);

  return (
    <section style={s.section}>
      <div style={s.statStrip}>
        <span style={s.stat}>
          <span className="tnum" style={s.statValue}>
            {counts.symbols}
          </span>
          {t("stat.symbols")}
        </span>
        <span style={s.stat}>
          <span className="tnum" style={s.statValue}>
            {counts.callers}
          </span>
          {t("stat.callers")}
        </span>
        <span style={s.stat}>
          <span className="tnum" style={s.statValue}>
            {counts.endpoints}
          </span>
          {t("stat.endpoints")}
        </span>
        <span style={s.stat}>
          <span className="tnum" style={s.statValue}>
            {counts.crons ?? "unknown"}
          </span>
          {t("stat.crons")}
        </span>
      </div>

      {sentence && (
        <div style={s.degradedBanner}>
          <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
            Index incomplete
          </Badge>
          <span style={s.degradedText}>{sentence}</span>
        </div>
      )}

      <div style={s.tree}>
        {data.downstream.map((impact) => (
          <SymbolRow
            key={impact.symbol}
            impact={impact}
            degraded={sentence != null}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        ))}
      </div>

      {leftover.length > 0 && (
        <p style={s.noDownstream}>{t("noDownstream", { count: leftover.length })}</p>
      )}
    </section>
  );
}
