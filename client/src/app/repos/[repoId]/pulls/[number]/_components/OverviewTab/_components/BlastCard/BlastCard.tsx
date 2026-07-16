/* BlastCard — L04: compact blast-radius summary on the PR Overview tab,
   sibling of IntentCard. Shows counts (changed symbols / callers / affected
   endpoints / crons) and a peek at the top impacted endpoints, then links
   out to the full Blast tab. No tree here — the tree is BlastTab's job.
   All data flows through useBlast; this component never calls fetch/api. */
"use client";

import { useTranslations } from "next-intl";
import { SectionLabel, Button, EmptyState, Skeleton, Badge, Chip } from "@devdigest/ui";
import { useBlast, type BlastResponse } from "@/lib/hooks/blast";
import { s } from "./styles";

interface BlastCardProps {
  prId: string | null;
  onOpenBlast: () => void;
}

interface BlastCardCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  /** `null` means "unknown" — the degraded facade path carries no cron data;
      never render a fabricated 0. */
  crons: number | null;
}

/** True when the index is degraded/partial — crons must render "unknown",
    never a silent "0" (honest degradation). */
function isDegraded(data: BlastResponse): boolean {
  return data.index_state.degraded === true || data.index_state.status !== "full";
}

function countsFor(data: BlastResponse): BlastCardCounts {
  const callers = data.downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpoints = new Set(data.downstream.flatMap((d) => d.endpoints_affected)).size;
  const degraded = isDegraded(data);
  const crons = degraded ? null : new Set(data.downstream.flatMap((d) => d.crons_affected)).size;
  return { symbols: data.changed_symbols.length, callers, endpoints, crons };
}

/** Top N distinct impacted endpoints, for a quick peek — the full list lives
    in the Blast tab's tree. */
function topEndpoints(data: BlastResponse, max: number): string[] {
  return Array.from(new Set(data.downstream.flatMap((d) => d.endpoints_affected))).slice(0, max);
}

export function BlastCard({ prId, onOpenBlast }: BlastCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading } = useBlast(prId);

  if (isLoading) {
    return (
      <section style={s.card}>
        <SectionLabel icon="Zap">Blast radius</SectionLabel>
        <Skeleton height={15} width="70%" />
        <Skeleton height={15} width="50%" style={{ marginTop: 6 }} />
      </section>
    );
  }

  if (data == null || data.changed_symbols.length === 0) {
    return (
      <section style={s.card}>
        <SectionLabel icon="Zap">Blast radius</SectionLabel>
        <EmptyState
          icon="Zap"
          title="No blast radius data"
          body="The repo index has no symbols recorded for these changed files."
        />
      </section>
    );
  }

  const degraded = isDegraded(data);
  const counts = countsFor(data);
  const endpoints = topEndpoints(data, 3);

  return (
    <section style={s.card}>
      <SectionLabel
        icon="Zap"
        right={
          <Button kind="ghost" size="sm" iconRight="ArrowRight" onClick={onOpenBlast}>
            View blast radius
          </Button>
        }
      >
        Blast radius
      </SectionLabel>

      <div style={s.statRow}>
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

      {degraded && (
        <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
          Index incomplete
        </Badge>
      )}

      {endpoints.length > 0 && (
        <div style={s.chipRow}>
          {endpoints.map((ep) => (
            <Chip key={ep} icon="Globe">
              {ep}
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}
