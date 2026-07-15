/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { FindingBadge } from "../FindingBadge";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  highlight,
  highlightSeverity,
  findings,
  onFocusLine,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Set when this line is the deep-link focus target — flashes a highlight. */
  highlight?: { line: number; side: "new" | "old" } | null;
  /** Opt-in inline-findings overlay: the most severe active finding covering
      this line's NEW-file number (spans a finding's whole start_line..end_line
      range). Absent ⇒ no border (unchanged rendering). */
  highlightSeverity?: Severity;
  /** Findings anchored (start_line) at this exact line — one clickable badge
      renders per finding, opening its detail popover. */
  findings?: FindingRecord[];
  /** Fires when a finding badge is clicked — re-triggers this line's
      deep-link focus/scroll/flash one level up. */
  onFocusLine?: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const highlighted =
    !!highlight &&
    (highlight.side === "new" ? ln.newNo === highlight.line : ln.oldNo === highlight.line);

  const rowStyle: React.CSSProperties = {
    ...lineRowFor(ln.kind),
    ...(highlightSeverity ? { boxShadow: `inset 3px 0 0 ${SEV[highlightSeverity].c}` } : {}),
    ...(highlighted
      ? { background: "var(--accent-bg)", boxShadow: "inset 2px 0 0 var(--accent)" }
      : {}),
  };

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-ln-new={ln.newNo ?? undefined}
      data-ln-old={ln.oldNo ?? undefined}
    >
      <div style={rowStyle}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {findings && findings.length > 0 && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {findings.map((f) => (
              <FindingBadge key={f.id} finding={f} onFocusLine={onFocusLine} />
            ))}
          </div>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
