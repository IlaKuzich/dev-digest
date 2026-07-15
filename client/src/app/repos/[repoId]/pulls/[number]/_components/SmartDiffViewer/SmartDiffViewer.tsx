/* SmartDiffViewer — reviewer-ordered diff layout (Smart Diff). IS the
   files-changed diff: real patch content, grouped by role (core/wiring/
   boilerplate, server-classified, no LLM call), with findings pinned inline
   to their exact code line range (a multi-line finding highlights every line
   it covers) and a clickable badge that opens the finding's full detail.
   Reuses the existing diff engine (`FileCard` / `DiffViewer` from
   `components/diff-viewer`) via its opt-in findings overlay + `defaultOpen`
   — no patch parsing reinvented here. A badge click also re-triggers the
   caller's onFocusLine (reuses the existing DiffFocus mechanism — see
   docs/superpowers/specs/2026-06-29-findings-deep-link-navigation.md). */
"use client";

import React from "react";
import { Button, SectionLabel } from "@devdigest/ui";
import { DiffViewer, FileCard, type DiffCommentApi, type DiffFocus } from "@/components/diff-viewer";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { usePrReviews } from "@/lib/hooks/reviews";
import { ROLE_META, ROLE_ORDER } from "./constants";
import { activeFindingsForFile } from "./helpers";

type Order = "smart" | "original";

const s = {
  toggle: { display: "inline-flex", gap: 4 } as React.CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties,
  groupHeader: { display: "flex", alignItems: "center", gap: 10, padding: "4px 2px" } as React.CSSProperties,
  marker: { width: 8, height: 8, borderRadius: 99, flexShrink: 0 } as React.CSSProperties,
  groupTitleWrap: { display: "flex", flexDirection: "column", gap: 1, minWidth: 0 } as React.CSSProperties,
  groupLabel: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } as React.CSSProperties,
  groupSubtitle: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
  groupCount: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
  fileList: { display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

/** Header + Smart/Original order toggle (client-only state, no group data
    needed to render it). */
function SmartDiffHeader({ order, onOrderChange }: { order: Order; onOrderChange: (o: Order) => void }) {
  return (
    <SectionLabel
      icon="Layers"
      right={
        <div style={s.toggle}>
          <Button kind="tertiary" size="sm" active={order === "smart"} onClick={() => onOrderChange("smart")}>
            Smart order
          </Button>
          <Button kind="tertiary" size="sm" active={order === "original"} onClick={() => onOrderChange("original")}>
            Original order
          </Button>
        </div>
      }
    >
      Reviewer-ordered diff
    </SectionLabel>
  );
}

export function SmartDiffViewer({
  prId,
  files,
  commenting,
  focus,
  onFocusLine,
}: {
  prId: string | null;
  /** Real PR files (carry the patch text) — joined with the role groups by
      path so each group renders the ACTUAL diff, not a summary. */
  files: PrFile[];
  commenting?: DiffCommentApi;
  focus?: DiffFocus | null;
  onFocusLine: (file: string, line: number) => void;
}) {
  const smartDiff = useSmartDiff(prId);
  const reviews = usePrReviews(prId);
  const [order, setOrder] = React.useState<Order>("smart");

  const filesByPath = React.useMemo(() => {
    const map = new Map<string, PrFile>();
    for (const f of files) map.set(f.path, f);
    return map;
  }, [files]);

  const findingsByFile = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const f of files) map.set(f.path, activeFindingsForFile(reviews.data, f.path));
    return map;
  }, [files, reviews.data]);

  const groups = smartDiff.data?.groups ?? [];
  const hasGroups = smartDiff.isSuccess && groups.length > 0;

  // No role-grouping data yet (loading/error) or the user picked "Original
  // order": fall back to the plain diff, in the PR's own file order — still
  // fully overlaid with inline findings + deep-link focus via the shared
  // DiffViewer, so nothing is ever missing while smart-diff loads.
  if (!hasGroups || order === "original") {
    return (
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {hasGroups && <SmartDiffHeader order={order} onOrderChange={setOrder} />}
        <DiffViewer
          files={files}
          commenting={commenting}
          focus={focus}
          findingsByFile={findingsByFile}
          onFocusLine={onFocusLine}
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <SmartDiffHeader order={order} onOrderChange={setOrder} />
      {ROLE_ORDER.map((role) => {
        const group = groups.find((g) => g.role === role);
        if (!group || group.files.length === 0) return null;
        const meta = ROLE_META[role];
        return (
          <div key={role} style={s.group}>
            <div style={s.groupHeader}>
              <span aria-hidden="true" style={{ ...s.marker, background: meta.markerColor }} />
              <div style={s.groupTitleWrap}>
                <span style={s.groupLabel}>{meta.label}</span>
                <span style={s.groupSubtitle}>{meta.subtitle}</span>
              </div>
              <span className="tnum" style={s.groupCount}>{group.files.length}</span>
            </div>
            <div style={s.fileList}>
              {group.files.map((sf) => {
                const file = filesByPath.get(sf.path);
                // The smart-diff endpoint and `files` prop are both sourced
                // from the same PR — a miss means stale data mid-refetch;
                // skip rather than render a patch-less placeholder.
                if (!file) return null;
                return (
                  <FileCard
                    key={sf.path}
                    file={file}
                    commenting={commenting}
                    focus={focus}
                    findings={findingsByFile.get(sf.path)}
                    defaultOpen={meta.defaultOpen(file)}
                    onFocusLine={onFocusLine}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
