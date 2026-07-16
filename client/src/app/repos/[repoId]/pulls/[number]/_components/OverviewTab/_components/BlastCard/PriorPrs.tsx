/* PriorPrs — the "Prior PRs touching these files" collapsible footer of the
   BlastCard: the history half of "what can this change break". Data comes
   from pr_files (other PRs that touched any of this PR's changed paths),
   already workspace-scoped server-side.

   An empty list is NOT a degraded state — a PR touching brand-new files
   legitimately has no history — so this renders nothing rather than
   borrowing the index's "unknown" affordance. */
"use client";

import React from "react";
import { Icon, Badge } from "@devdigest/ui";
import type { PriorPr } from "@/lib/hooks/blast";
import { s, chevronFor } from "./styles";

export function PriorPrs({
  priorPrs,
  repoFullName,
}: {
  priorPrs: PriorPr[];
  repoFullName: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  if (priorPrs.length === 0) return null;

  return (
    <div style={s.priorSection}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} prior PRs touching these files`}
        onClick={() => setOpen((o) => !o)}
        style={s.priorToggle}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.History size={13} />
        <span>Prior PRs touching these files</span>
        <span style={s.priorMeta}>
          <Badge>{priorPrs.length}</Badge>
        </span>
      </button>

      {open && (
        <div style={s.priorList}>
          {priorPrs.map((pr) => {
            const meta = pr.merged_at ? new Date(pr.merged_at).toLocaleDateString() : "open";
            const inner = (
              <>
                <span className="mono" style={s.priorNumber}>
                  #{pr.number}
                </span>
                <span style={s.priorTitle}>{pr.title}</span>
                <span style={s.priorMeta}>
                  {pr.author ? `${pr.author} · ` : ""}
                  {meta}
                </span>
              </>
            );

            // Without repoFullName there is no honest URL to build — render
            // plain text rather than a dead link.
            if (!repoFullName) {
              return (
                <span key={pr.id} style={s.priorRow}>
                  {inner}
                </span>
              );
            }
            return (
              <a
                key={pr.id}
                style={s.priorRow}
                href={`https://github.com/${repoFullName}/pull/${pr.number}`}
                target="_blank"
                rel="noreferrer"
              >
                {inner}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
