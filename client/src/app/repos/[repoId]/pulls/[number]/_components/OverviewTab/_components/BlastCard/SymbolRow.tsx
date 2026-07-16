/* SymbolRow — one collapsible row in the blast radius tree: a changed
   symbol's downstream callers (level 2) and affected endpoints/crons
   (level 3).

   The collapsed header carries the symbol name and caller count ONLY. Endpoint
   and cron chips live in the expanded body, where they name the actual
   endpoints — per the design. Count chips in the header crowd the row and
   truncate the symbol name, and they duplicate the card's stat strip.

   Mirrors the collapsible-row precedent in
   components/diff-viewer/FileCard/FileCard.tsx (there is no Tree primitive
   in @devdigest/ui). Callers live outside the PR diff (the facade excludes
   the declaration's own file), so each caller links out to GitHub instead
   of the local diff viewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Chip } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s, chevronFor } from "./styles";

export function SymbolRow({
  impact,
  degraded,
  repoFullName,
  headSha,
}: {
  impact: DownstreamImpact;
  /** True when the index is degraded/partial — empty endpoint/cron lists
      must render "unknown", never a silent "0". */
  degraded: boolean;
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);

  const endpoints = impact.endpoints_affected;
  const crons = impact.crons_affected;
  const showUnknownEndpoints = degraded && endpoints.length === 0;
  const showUnknownCrons = degraded && crons.length === 0;

  return (
    <div style={s.symbolCard}>
      <div style={s.symbolHeader}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} callers of ${impact.symbol}`}
          onClick={() => setOpen((o) => !o)}
          style={s.symbolToggle}
        >
          <Icon.ChevronRight size={13} style={chevronFor(open)} />
          <span className="mono" style={s.symbolName}>
            {impact.symbol}
          </span>
          <span style={s.symbolMeta}>{t("callerCount", { count: impact.callers.length })}</span>
        </button>
      </div>

      {open && (
        <div style={s.symbolBody}>
          <div style={s.callerList}>
            {impact.callers.map((caller, i) => {
              if (!repoFullName) {
                return (
                  <span key={`${caller.file}:${caller.line}:${i}`} className="mono" style={s.callerRow}>
                    <Icon.CornerDownRight size={12} />
                    <span style={s.callerName}>{caller.name}</span>
                    <span>{caller.file}:{caller.line}</span>
                  </span>
                );
              }
              return (
                <a
                  key={`${caller.file}:${caller.line}:${i}`}
                  className="mono"
                  style={s.callerRow}
                  href={githubBlobUrl(repoFullName, headSha, caller.file, caller.line)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon.CornerDownRight size={12} />
                  <span style={s.callerName}>{caller.name}</span>
                  <span>{caller.file}:{caller.line}</span>
                  <Icon.ExternalLink size={11} />
                </a>
              );
            })}
          </div>

          {endpoints.length > 0 && (
            <div>
              <div style={s.chipGroupLabel}>{t("stat.endpoints")}</div>
              <div style={s.chipRow}>
                {endpoints.map((ep) => (
                  <Chip key={ep} icon="Globe">
                    {ep}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {showUnknownEndpoints && (
            <div style={s.symbolMeta}>Endpoints unknown — the index is incomplete for this symbol.</div>
          )}

          {crons.length > 0 && (
            <div>
              <div style={s.chipGroupLabel}>{t("stat.crons")}</div>
              <div style={s.chipRow}>
                {crons.map((cron) => (
                  <Chip key={cron} icon="Clock">
                    {cron}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {showUnknownCrons && (
            <div style={s.symbolMeta}>Cron/job impact unknown — the degraded index carries no cron data.</div>
          )}
        </div>
      )}
    </div>
  );
}
